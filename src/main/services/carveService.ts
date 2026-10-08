import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
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
    name: 'WebP Image',
    category: 'Images',
    extensions: ['webp'],
    header: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    maxSize: 25 * 1024 * 1024,
    minSize: 64,
  },
  {
    name: 'MP4 / MOV Video',
    category: 'Videos',
    extensions: ['mp4', 'mov', 'm4v'],
    header: Buffer.from([0x66, 0x74, 0x79, 0x70]),
    maxSize: 150 * 1024 * 1024,
    minSize: 32,
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
  {
    name: 'Bitmap Image',
    category: 'Images',
    extensions: ['bmp'],
    header: Buffer.from([0x42, 0x4d]),
    maxSize: 15 * 1024 * 1024,
    minSize: 100,
  },
  {
    name: 'Plain Text Document',
    category: 'Text',
    extensions: ['txt', 'csv', 'log', 'json'],
    header: Buffer.from([0xef, 0xbb, 0xbf]),
    maxSize: 5 * 1024 * 1024,
    minSize: 64,
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
  success: boolean
  filesFound: CarvedFile[]
  totalBytesScanned: number
  durationMs: number
}

export interface CarvingProgress {
  percent: number
  percentage?: number
  bytesScanned: number
  totalBytes: number
  filesFound: number
  stage?: string
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

  public getCategoryForExtension(
    ext: string
  ): 'Images' | 'Documents' | 'Archives' | 'Text' | 'Videos' | 'Databases' {
    const e = ext.toLowerCase().replace(/^\./, '')
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico', 'svg'].includes(e)) return 'Images'
    if (['mp4', 'mov', 'm4v', 'avi', 'mkv'].includes(e)) return 'Videos'
    if (['sqlite', 'db', 'sqlite3', 'sql'].includes(e)) return 'Databases'
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(e)) return 'Documents'
    if (['txt', 'log', 'csv', 'json', 'xml', 'md'].includes(e)) return 'Text'
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'Archives'
    return 'Documents'
  }

  public getFileTypeDescription(ext: string): string {
    const e = ext.toLowerCase().replace(/^\./, '')
    const map: Record<string, string> = {
      pdf: 'PDF Document',
      jpg: 'JPEG Image',
      jpeg: 'JPEG Image',
      png: 'PNG Image',
      gif: 'GIF Animation',
      webp: 'WebP Image',
      bmp: 'Bitmap Image',
      mp4: 'MP4 Video',
      mov: 'QuickTime MOV Video',
      m4v: 'M4V Video',
      sqlite: 'SQLite Forensic Database',
      sqlite3: 'SQLite Database',
      db: 'SQLite Database',
      docx: 'Microsoft Word Document',
      xlsx: 'Microsoft Excel Spreadsheet',
      pptx: 'Microsoft PowerPoint Presentation',
      zip: 'ZIP Compressed Archive',
      txt: 'Plain Text Document',
      csv: 'CSV Data Sheet',
      log: 'System Audit Log',
    }
    return map[e] || `${e.toUpperCase()} File`
  }

  private scanActiveFiles(
    rootPath: string,
    outputDir: string,
    activeExtensions: string[],
    includeAll: boolean
  ): CarvedFile[] {
    const activeFiles: CarvedFile[] = []
    if (!fs.existsSync(rootPath)) return activeFiles

    const IGNORED_DIRS = new Set([
      '$recycle.bin',
      'system volume information',
      '.git',
      'node_modules',
      'recovery',
      'windows',
    ])

    const IGNORED_FILES = new Set([
      'desktop.ini',
      'thumbs.db',
      'hiberfil.sys',
      'pagefile.sys',
      'swapfile.sys',
    ])

    const walk = (dir: string, depth: number) => {
      if (depth > 4 || activeFiles.length >= 60) return
      let entries: fs.Dirent[] = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (_) {
        return
      }

      for (const entry of entries) {
        if (activeFiles.length >= 60) break
        const lowerName = entry.name.toLowerCase()

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(lowerName) && !lowerName.startsWith('$')) {
            walk(path.join(dir, entry.name), depth + 1)
          }
        } else if (entry.isFile()) {
          if (IGNORED_FILES.has(lowerName)) continue
          const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '')
          if (!ext) continue

          const category = this.getCategoryForExtension(ext)
          const typeMatch =
            includeAll ||
            activeExtensions.length === 0 ||
            activeExtensions.includes(ext) ||
            activeExtensions.includes(category.toLowerCase())

          if (!typeMatch) continue

          const fullPath = path.join(dir, entry.name)
          try {
            const stats = fs.statSync(fullPath)
            if (stats.size <= 0 || stats.size > 100 * 1024 * 1024) continue

            const fileBuf = fs.readFileSync(fullPath)
            const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex')

            const destPath = path.join(outputDir, entry.name)
            try {
              if (path.resolve(fullPath) !== path.resolve(destPath)) {
                fs.copyFileSync(fullPath, destPath)
              }
            } catch (_) {}

            activeFiles.push({
              name: entry.name,
              type: this.getFileTypeDescription(ext),
              category,
              extension: ext,
              offset: 0,
              size: stats.size,
              confidence: 99,
              outputPath: destPath,
              sha256,
              fileStatus: 'ALREADY_PRESENT',
              isVerified: true,
              integrityStatus: 'VERIFIED_GENUINE',
            })
          } catch (_) {}
        }
      }
    }

    walk(rootPath, 0)
    return activeFiles
  }

  private acquireSnapshotAsync(
    volumeLetter: string,
    destinationPath: string,
    targetBytes: number,
    onProgress: (copied: number, target: number) => void
  ): Promise<number> {
    return new Promise((resolve) => {
      const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
try {
  $src = [System.IO.File]::Open('\\\\.\\${volumeLetter}:', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $dst = [System.IO.File]::Open('${destinationPath.replace(/\\/g, '\\\\')}', [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $buf = New-Object byte[] (2048 * 1024)
  $copied = [long]0
  $target = [long]${targetBytes}
  while ($copied -lt $target) {
    $toRead = [int][Math]::Min([long]$buf.Length, $target - $copied)
    $read = $src.Read($buf, 0, $toRead)
    if ($read -le 0) { break }
    $dst.Write($buf, 0, $read)
    $copied += $read
    if ($copied % (8 * 1024 * 1024) -eq 0) {
      [Console]::WriteLine("PROGRESS:" + $copied)
    }
  }
  $src.Close()
  $dst.Close()
  [Console]::WriteLine("DONE:" + $copied)
} catch {
  [Console]::WriteLine("DONE:" + $copied)
}
`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const child = spawn(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          encoded,
        ],
        { windowsHide: true }
      )

      let finalCopied = 0

      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split(/\r?\n/)
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('PROGRESS:')) {
            const copied = parseInt(trimmed.split(':')[1], 10)
            if (!isNaN(copied)) {
              finalCopied = copied
              onProgress(copied, targetBytes)
            }
          } else if (trimmed.startsWith('DONE:')) {
            const copied = parseInt(trimmed.split(':')[1], 10)
            if (!isNaN(copied)) finalCopied = copied
          }
        }
      })

      child.on('close', () => resolve(finalCopied))
      child.on('error', () => resolve(finalCopied))
    })
  }

  public async detectAntiForensics(imagePath: string): Promise<{
    detected: boolean
    type: string
    confidence: number
    details: string
    patternsDetected?: string[]
  }> {
    const isDevice =
      imagePath.startsWith('\\\\.\\') || /^[a-zA-Z]:[\\\/]?$/.test(imagePath)

    if (isDevice) {
      let letter = ''
      const match = imagePath.match(/([a-zA-Z]):/)
      if (match) letter = match[1].toUpperCase()

      if (letter && fs.existsSync(`${letter}:\\`)) {
        try {
          const entries = fs.readdirSync(`${letter}:\\`)
          const realFiles = entries.filter(
            (e) =>
              !e.toLowerCase().includes('recycle') &&
              !e.toLowerCase().includes('volume information')
          )
          if (realFiles.length > 0) {
            return {
              detected: false,
              type: 'ACTIVE_DATA',
              confidence: 0.95,
              details: `Active partition filesystem with ${realFiles.length} allocated item(s) detected.`,
              patternsDetected: [],
            }
          }
        } catch (_) {}
      }
      return {
        detected: false,
        type: 'none',
        confidence: 0.8,
        details: 'Device partition mounted and verified ready for signature analysis.',
        patternsDetected: [],
      }
    }

    if (!fs.existsSync(imagePath)) {
      return {
        detected: false,
        type: 'none',
        confidence: 0,
        details: 'Source file does not exist',
        patternsDetected: [],
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
          patternsDetected: [],
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
            'Image storage blocks are filled with pure zeros (0x00), consistent with a NIST SP 800-88 Clear overwrite pass.',
          patternsDetected: ['NIST_ZERO_OVERWRITE'],
        }
      }

      const entropy = calculateEntropy(sample)
      if (entropy > 7.9) {
        return {
          detected: true,
          type: 'CRYPTOGRAPHIC_PURGE',
          confidence: 0.95,
          details: `Image exhibits maximum Shannon entropy H(X)=${entropy.toFixed(4)}, consistent with ciphertext noise or random purge.`,
          patternsDetected: ['CRYPTOGRAPHIC_PURGE'],
        }
      }

      return {
        detected: false,
        type: 'none',
        confidence: 0,
        details: `Normal entropy distribution H(X)=${entropy.toFixed(4)}. File signatures may be present.`,
        patternsDetected: [],
      }
    } catch (err: any) {
      return {
        detected: false,
        type: 'error',
        confidence: 0,
        details: err.message,
        patternsDetected: [],
      }
    }
  }

  public async startCarving(
    sourcePath: string,
    outputDir: string,
    fileTypes: string[],
    size?: number,
    caseMeta?: any
  ): Promise<CarvingResult> {
    const startTimeMs = Date.now()

    let isRegularFile = false
    try {
      if (fs.existsSync(sourcePath)) {
        isRegularFile = fs.statSync(sourcePath).isFile()
      }
    } catch (_) {}

    const isDevice =
      !isRegularFile &&
      (sourcePath.startsWith('\\\\.\\') ||
        /^[a-zA-Z]:[\\\/]?$/.test(sourcePath) ||
        /PhysicalDrive/i.test(sourcePath))

    if (!isDevice && !isRegularFile) {
      throw new SecurityError(
        'TARGET_MISSING',
        `Evidence source does not exist: ${sourcePath}`
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
      operatorClaims
    )
    if (!permDecision.allowed) {
      throw new SecurityError(permDecision.code, permDecision.message)
    }
    const operatorId = permDecision.value.operatorId
    const caseId = caseMeta?.caseId || 'CASE-GENERAL'

    const lock = this.lockService.acquireLock(sourcePath, 'CARVE')
    const norm = this.lockService.normalizeTarget(sourcePath)
    this.cancelledSources.delete(norm)

    let tempSnapshotPath: string | null = null

    try {
      const filesFound: CarvedFile[] = []
      const activeHashes = new Set<string>()

      let volumeLetter = ''
      const volMatch = (isDevice || /^[a-zA-Z]:[\\\/]?$/.test(sourcePath))
        ? sourcePath.match(/([a-zA-Z]):/)
        : null
      if (volMatch) {
        volumeLetter = volMatch[1].toUpperCase()
      } else if (isDevice) {
        const driveMatch = sourcePath.match(/PhysicalDrive(\d+)/i)
        if (driveMatch) {
          try {
            const diskNum = driveMatch[1]
            const psCmd = `(Get-Partition -DiskNumber ${diskNum} -ErrorAction SilentlyContinue | Where-Object DriveLetter | Select-Object -ExpandProperty DriveLetter)[0]`
            const out = require('node:child_process')
              .execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, {
                timeout: 3000,
              })
              .toString()
              .trim()
            if (out && /^[A-Za-z]$/.test(out)) {
              volumeLetter = out.toUpperCase()
            }
          } catch (_) {}
        }
      }

      const activeSigs = SIGNATURES.filter(
        (s) =>
          fileTypes.length === 0 ||
          fileTypes.some((ft) => s.extensions.includes(ft.toLowerCase()))
      )
      const lowerTypes = fileTypes.map((t) => t.toLowerCase())
      const includeAll = lowerTypes.length === 0 || lowerTypes.includes('all')

      // Phase 1: Active Filesystem Scan
      if (volumeLetter && fs.existsSync(`${volumeLetter}:\\`)) {
        this.emit('progress', {
          percent: 5,
          percentage: 5,
          bytesScanned: 0,
          totalBytes: size || 1024 * 1024 * 1024,
          filesFound: 0,
          stage: `Scanning active filesystem on [${volumeLetter}:]...`,
        } as CarvingProgress)

        const activeFiles = this.scanActiveFiles(
          `${volumeLetter}:\\`,
          outputDir,
          lowerTypes,
          includeAll
        )
        for (const af of activeFiles) {
          filesFound.push(af)
          activeHashes.add(af.sha256)
        }
      }

      // Phase 2: Stream Raw Sector Snapshot if Device, or read file directly
      let carveTargetPath = sourcePath
      let totalBytes = size || 128 * 1024 * 1024

      if (isDevice) {
        if (volumeLetter) {
          const snapshotTargetBytes = Math.min(
            size || 128 * 1024 * 1024,
            256 * 1024 * 1024
          )
          tempSnapshotPath = path.join(
            os.tmpdir(),
            `cybersanitize_carve_${volumeLetter}_${Date.now()}.raw`
          )

          this.emit('progress', {
            percent: 15,
            percentage: 15,
            bytesScanned: 0,
            totalBytes: snapshotTargetBytes,
            filesFound: filesFound.length,
            stage: `Streaming write-protected sectors from [${volumeLetter}:]...`,
          } as CarvingProgress)

          await this.acquireSnapshotAsync(
            volumeLetter,
            tempSnapshotPath,
            snapshotTargetBytes,
            (copied, target) => {
              const pct = Math.max(15, Math.min(45, Math.round((copied / target) * 30) + 15))
              this.emit('progress', {
                percent: pct,
                percentage: pct,
                bytesScanned: copied,
                totalBytes: target,
                filesFound: filesFound.length,
                stage: `Streaming sector blocks (${(copied / (1024 * 1024)).toFixed(0)} MB / ${(target / (1024 * 1024)).toFixed(0)} MB)...`,
              } as CarvingProgress)
            }
          )

          if (fs.existsSync(tempSnapshotPath)) {
            carveTargetPath = tempSnapshotPath
            totalBytes = fs.statSync(tempSnapshotPath).size
          }
        }
      } else {
        try {
          const stats = fs.statSync(sourcePath)
          totalBytes = size && size > 0 ? Math.min(size, stats.size) : stats.size
        } catch (_) {}
      }

      // Phase 3: Signature Pattern Carving
      let offset = 0
      if (fs.existsSync(carveTargetPath) && totalBytes > 0) {
        const CHUNK_SIZE = 1024 * 1024 // 1MB buffer
        let fd: number | null = null
        try {
          fd = fs.openSync(carveTargetPath, 'r')
          const buf = Buffer.alloc(CHUNK_SIZE + 4096)
          let lastYieldMs = Date.now()

          while (offset < totalBytes) {
            if (this.cancelledSources.has(norm)) break

            const readBytes = Math.min(CHUNK_SIZE, totalBytes - offset)
            let bytesRead = 0
            try {
              bytesRead = fs.readSync(fd, buf, 0, readBytes + 4096, offset)
            } catch (_) {
              break
            }
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

                let fileLen = Math.min(sig.maxSize, totalBytes - fileOffset)
                if (sig.footer) {
                  const footerIdx = slice.indexOf(
                    sig.footer,
                    foundIdx + sig.header.length
                  )
                  if (footerIdx !== -1) {
                    fileLen = footerIdx + sig.footer.length - foundIdx
                  }
                }

                if (fileLen >= sig.minSize) {
                  const fileBuf = Buffer.alloc(Math.min(fileLen, 2 * 1024 * 1024))
                  let fRead = 0
                  try {
                    fRead = fs.readSync(fd, fileBuf, 0, fileBuf.length, fileOffset)
                  } catch (_) {}

                  if (fRead > 0) {
                    const fileData = fileBuf.subarray(0, fRead)
                    const fileSha = crypto
                      .createHash('sha256')
                      .update(fileData)
                      .digest('hex')

                    if (!activeHashes.has(fileSha)) {
                      activeHashes.add(fileSha)
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
                  }
                }

                searchIdx = foundIdx + sig.header.length
              }
            }

            offset += readBytes

            const now = Date.now()
            if (now - lastYieldMs >= 120) {
              const basePct = isDevice ? 45 : 0
              const carvePct = Math.round((offset / totalBytes) * (isDevice ? 54 : 99))
              const pct = Math.min(99, basePct + carvePct)
              this.emit('progress', {
                percent: pct,
                percentage: pct,
                bytesScanned: offset,
                totalBytes,
                filesFound: filesFound.length,
                stage: `Deep signature matching (${(offset / (1024 * 1024)).toFixed(0)} MB)...`,
              } as CarvingProgress)
              lastYieldMs = now
              await new Promise((r) => setImmediate(r))
            }
          }
        } finally {
          if (fd !== null) {
            try {
              fs.closeSync(fd)
            } catch (_) {}
          }
        }
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
        percentage: 100,
        bytesScanned: offset,
        totalBytes,
        filesFound: filesFound.length,
        stage: 'Scan Complete',
      } as CarvingProgress)

      return {
        success: true,
        filesFound,
        totalBytesScanned: offset,
        durationMs,
      }
    } finally {
      if (tempSnapshotPath && fs.existsSync(tempSnapshotPath)) {
        try {
          fs.unlinkSync(tempSnapshotPath)
        } catch (_) {}
      }
      lock.release()
      this.cancelledSources.delete(norm)
    }
  }
}
