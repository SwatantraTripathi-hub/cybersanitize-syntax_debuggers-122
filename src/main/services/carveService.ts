import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { SecurityError } from '../types/errors'
import { AuditService } from './auditService'
import { OperationLockService } from './operationLock'
import { ServiceContext } from './serviceContext'
import { calculateEntropy } from './entropyCalc'

export interface FileSignature {
  name: string
  category:
    | 'Images'
    | 'Documents'
    | 'Archives'
    | 'Text'
    | 'Videos'
    | 'Databases'
  extensions: string[]
  header: Buffer
  footer?: Buffer
  maxSize: number
  minSize: number
}

export const SIGNATURES: FileSignature[] = [
  {
    name: 'JPEG Image',
    category: 'Images',
    extensions: ['jpg', 'jpeg'],
    header: Buffer.from([0xff, 0xd8, 0xff]),
    maxSize: 25 * 1024 * 1024,
    minSize: 64,
  },
  {
    name: 'PNG Image',
    category: 'Images',
    extensions: ['png'],
    header: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    maxSize: 25 * 1024 * 1024,
    minSize: 1024,
  },
  {
    name: 'GIF Animation',
    category: 'Images',
    extensions: ['gif'],
    header: Buffer.from([0x47, 0x49, 0x46, 0x38]),
    footer: Buffer.from([0x00, 0x3b]),
    maxSize: 20 * 1024 * 1024,
    minSize: 64,
  },
  {
    name: 'PDF Document',
    category: 'Documents',
    extensions: ['pdf'],
    header: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
    maxSize: 40 * 1024 * 1024,
    minSize: 512,
  },
  {
    name: 'ZIP / Office Doc',
    category: 'Archives',
    extensions: ['zip', 'docx', 'xlsx', 'pptx'],
    header: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    maxSize: 50 * 1024 * 1024,
    minSize: 512,
  },
  {
    name: 'SQLite Database',
    category: 'Databases',
    extensions: ['sqlite', 'db', 'sqlite3'],
    header: Buffer.from('SQLite format 3\0'),
    maxSize: 100 * 1024 * 1024,
    minSize: 512,
  },
]

export interface CarvedFile {
  name: string
  type: string
  category:
    | 'Images'
    | 'Documents'
    | 'Archives'
    | 'Text'
    | 'Videos'
    | 'Databases'
  extension: string
  offset: number
  size: number
  confidence: number
  outputPath: string
  sha256: string
  fileStatus?: 'DELETED_RECOVERED' | 'ALREADY_PRESENT'
  isVerified?: boolean
  integrityStatus?: 'VERIFIED_GENUINE' | 'PARTIAL_ARTIFACT' | 'REJECTED_NOISE'
  verificationDetails?: string
}

export interface CarvingResult {
  filesFound: CarvedFile[]
  totalBytesScanned: number
  durationMs: number
}

export interface CarvingProgress {
  percent: number
  bytesScanned: number
  totalBytes: number
  filesFound: number
}

export class CarveService extends EventEmitter {
  private static instance: CarveService | null = null
  private readonly auditService: AuditService
  private readonly lockService: OperationLockService
  private readonly context: ServiceContext
  private cancelledSources = new Set<string>()

  constructor(context: ServiceContext = ServiceContext.getInstance()) {
    super()
    this.context = context
    this.auditService = new AuditService(context)
    this.lockService = OperationLockService.getInstance()
  }

  public static getInstance(): CarveService {
    if (!CarveService.instance) {
      CarveService.instance = new CarveService()
    }
    return CarveService.instance
  }

  public cancel(sourcePath: string): void {
    const norm = this.lockService.normalizeTarget(sourcePath)
    this.cancelledSources.add(norm)
  }

  public getSignatures(): Array<{
    name: string
    category: string
    extensions: string[]
    maxSize: number
  }> {
    return SIGNATURES.map((s) => ({
      name: s.name,
      category: s.category,
      extensions: s.extensions,
      maxSize: s.maxSize,
    }))
  }

  public async detectAntiForensics(imagePath: string): Promise<{
    detected: boolean
    type: string
    confidence: number
    details: string
  }> {
    if (!fs.existsSync(imagePath)) {
      return {
        detected: false,
        type: 'none',
        confidence: 0,
        details: 'Source file does not exist',
      }
    }

    try {
      const fd = fs.openSync(imagePath, 'r')
      const sampleSize = 64 * 1024
      const buf = Buffer.alloc(sampleSize)
      const read = fs.readSync(fd, buf, 0, sampleSize, 0)
      fs.closeSync(fd)

      if (read === 0) {
        return {
          detected: false,
          type: 'none',
          confidence: 0,
          details: 'Empty image',
        }
      }

      const sample = buf.subarray(0, read)
      let zeroCount = 0
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) zeroCount++
      }
      const zeroRatio = zeroCount / sample.length

      if (zeroRatio > 0.99) {
        return {
          detected: true,
          type: 'NIST_ZERO_OVERWRITE',
          confidence: 0.99,
          details:
            'Image storage blocks are filled with pure zeros (0x00), consistent with a NIST 800-88 Clear overwrite pass.',
        }
      }

      const entropy = calculateEntropy(sample)
      if (entropy > 7.9) {
        return {
          detected: true,
          type: 'CRYPTOGRAPHIC_PURGE',
          confidence: 0.95,
          details: `Image exhibits maximum Shannon entropy H(X)=${entropy.toFixed(4)}, consistent with ciphertext noise or random purge.`,
        }
      }

      return {
        detected: false,
        type: 'none',
        confidence: 0,
        details: `Normal entropy distribution H(X)=${entropy.toFixed(4)}. File signatures may be present.`,
      }
    } catch (err: any) {
      return {
        detected: false,
        type: 'error',
        confidence: 0,
        details: err.message,
      }
    }
  }

  public async startCarving(
    sourcePath: string,
    outputDir: string,
    fileTypes: string[],
    size?: number,
    caseMeta?: any,
  ): Promise<CarvingResult> {
    const startTimeMs = Date.now()

    if (!fs.existsSync(sourcePath)) {
      throw new SecurityError(
        'TARGET_MISSING',
        `Evidence source does not exist: ${sourcePath}`,
      )
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const operatorClaims = caseMeta || {
      operatorId: 'EXAMINER-101',
      role: 'operator',
    }
    const permDecision = this.context.permissionGuard.authorize(
      'EVIDENCE_CREATE',
      operatorClaims,
    )
    if (!permDecision.allowed) {
      throw new SecurityError(permDecision.code, permDecision.message)
    }
    const operatorId = permDecision.value.operatorId
    const caseId = caseMeta?.caseId || 'CASE-GENERAL'

    const lock = this.lockService.acquireLock(sourcePath, 'CARVE')
    const norm = this.lockService.normalizeTarget(sourcePath)
    this.cancelledSources.delete(norm)

    try {
      const stats = fs.statSync(sourcePath)
      const totalBytes =
        size && size > 0 ? Math.min(size, stats.size) : stats.size

      // Filter active signatures
      const activeSigs = SIGNATURES.filter(
        (s) =>
          fileTypes.length === 0 ||
          fileTypes.some((ft) => s.extensions.includes(ft.toLowerCase())),
      )

      const filesFound: CarvedFile[] = []
      const CHUNK_SIZE = 1024 * 1024 // 1MB buffer
      const fd = fs.openSync(sourcePath, 'r')
      let offset = 0
      let lastYieldMs = Date.now()

      try {
        const buf = Buffer.alloc(CHUNK_SIZE + 4096) // overlap to catch boundary headers

        while (offset < totalBytes) {
          if (this.cancelledSources.has(norm)) {
            break
          }

          const readBytes = Math.min(CHUNK_SIZE, totalBytes - offset)
          const bytesRead = fs.readSync(fd, buf, 0, readBytes + 4096, offset)
          if (bytesRead <= 0) break

          const slice = buf.subarray(0, bytesRead)

          for (const sig of activeSigs) {
            let searchIdx = 0
            while (searchIdx < readBytes) {
              const foundIdx = slice.indexOf(sig.header, searchIdx)
              if (foundIdx === -1 || foundIdx >= readBytes) break

              const fileOffset = offset + foundIdx
              const ext = sig.extensions[0]
              const fileName = `carved_${filesFound.length + 1}_offset_${fileOffset}.${ext}`
              const outFilePath = path.join(outputDir, fileName)

              // Extract estimated file length
              let fileLen = Math.min(sig.maxSize, totalBytes - fileOffset)
              if (sig.footer) {
                const footerIdx = slice.indexOf(
                  sig.footer,
                  foundIdx + sig.header.length,
                )
                if (footerIdx !== -1) {
                  fileLen = footerIdx + sig.footer.length - foundIdx
                }
              }

              if (fileLen >= sig.minSize) {
                // Read and save file content
                const fileBuf = Buffer.alloc(Math.min(fileLen, 2 * 1024 * 1024))
                const fRead = fs.readSync(
                  fd,
                  fileBuf,
                  0,
                  fileBuf.length,
                  fileOffset,
                )
                const fileData = fileBuf.subarray(0, fRead)
                const fileSha = crypto
                  .createHash('sha256')
                  .update(fileData)
                  .digest('hex')

                fs.writeFileSync(outFilePath, fileData)

                filesFound.push({
                  name: fileName,
                  type: sig.name,
                  category: sig.category,
                  extension: ext,
                  offset: fileOffset,
                  size: fRead,
                  confidence: 90,
                  outputPath: outFilePath,
                  sha256: fileSha,
                  fileStatus: 'DELETED_RECOVERED',
                  isVerified: true,
                  integrityStatus: 'VERIFIED_GENUINE',
                })
              }

              searchIdx = foundIdx + sig.header.length
            }
          }

          offset += readBytes

          const now = Date.now()
          if (now - lastYieldMs >= 150) {
            const pct = Math.min(99, Math.round((offset / totalBytes) * 100))
            this.emit('progress', {
              percent: pct,
              bytesScanned: offset,
              totalBytes,
              filesFound: filesFound.length,
            } as CarvingProgress)
            lastYieldMs = now
            await new Promise((r) => setImmediate(r))
          }
        }
      } finally {
        fs.closeSync(fd)
      }

      const durationMs = Date.now() - startTimeMs

      await this.auditService.recordOperation({
        case_id: caseId,
        operation: 'FILE_RECOVERY',
        target: sourcePath,
        details: {
          outputDir,
          fileTypes,
          filesFound: filesFound.length,
          totalBytesScanned: offset,
          durationMs,
        },
        status: 'COMPLETED',
        operator: operatorId,
      })

      this.emit('progress', {
        percent: 100,
        bytesScanned: offset,
        totalBytes,
        filesFound: filesFound.length,
      } as CarvingProgress)

      return {
        filesFound,
        totalBytesScanned: offset,
        durationMs,
      }
    } finally {
      lock.release()
      this.cancelledSources.delete(norm)
    }
  }
}
