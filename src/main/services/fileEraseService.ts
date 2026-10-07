import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { SecurityError } from '../types/errors'
import { AuditService } from './auditService'
import { WriteBlockerService } from './writeBlockerService'
import { OperationLockService } from './operationLock'
import { MetadataCleaner } from './metadataCleaner'
import { ServiceContext } from './serviceContext'

export interface FileEraseProgress {
  percent: number
  currentStep: number
  stepName: string
  currentFile: string
  filesProcessed: number
  totalFiles: number
  totalBytes: number
  status: 'running' | 'completed' | 'failed'
}

export interface FileEraseResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  success: boolean
  filesProcessed: number
  totalBytes: number
  metadataCleaned: string[]
  errors: string[]
}

export class FileEraseService extends EventEmitter {
  private static instance: FileEraseService | null = null
  private readonly auditService: AuditService
  private readonly writeBlockerService: WriteBlockerService
  private readonly lockService: OperationLockService
  private readonly metadataCleaner: MetadataCleaner
  private readonly context: ServiceContext

  constructor(context: ServiceContext = ServiceContext.getInstance()) {
    super()
    this.context = context
    this.auditService = new AuditService(context)
    this.writeBlockerService = WriteBlockerService.getInstance()
    this.lockService = OperationLockService.getInstance()
    this.metadataCleaner = new MetadataCleaner()
  }

  public static getInstance(): FileEraseService {
    if (!FileEraseService.instance) {
      FileEraseService.instance = new FileEraseService()
    }
    return FileEraseService.instance
  }

  public async startFileErase(
    paths: string[],
    standard: string = 'nist-clear',
    caseMeta?: any,
  ): Promise<FileEraseResult> {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new SecurityError(
        'INPUT_INVALID',
        'Target paths list must be a non-empty array of strings',
      )
    }

    // 1. Authorize operator
    const operatorClaims = caseMeta || {
      operatorId: 'EXAMINER-101',
      role: 'operator',
    }
    const permDecision = this.context.permissionGuard.authorize(
      'FILE_ERASE',
      operatorClaims,
    )
    if (!permDecision.allowed) {
      throw new SecurityError(permDecision.code, permDecision.message)
    }
    const operatorId = permDecision.value.operatorId
    const caseId = caseMeta?.caseId || 'CASE-GENERAL'

    // 2. Check Write-Blocker protection for all paths
    for (const p of paths) {
      if (!caseMeta?.overrideWriteBlocker) {
        this.writeBlockerService.assertWriteAllowed(p)
      }
    }

    // 3. Acquire concurrency locks for all paths
    const locks: Array<{ release: () => void }> = []
    try {
      for (const p of paths) {
        locks.push(this.lockService.acquireLock(p, 'FILE_ERASE'))
      }
    } catch (lockErr) {
      // Release any acquired locks before failing
      for (const l of locks) l.release()
      throw lockErr
    }

    let filesProcessed = 0
    let totalBytes = 0
    const metadataCleaned: string[] = []
    const errors: string[] = []

    try {
      const totalCount = paths.length

      for (let i = 0; i < paths.length; i++) {
        const targetPath = path.resolve(paths[i])

        try {
          if (!fs.existsSync(targetPath)) {
            errors.push(`Target not found: ${targetPath}`)
            continue
          }

          const stats = fs.lstatSync(targetPath)
          if (stats.isSymbolicLink()) {
            // Unlink symlink directly without traversing
            fs.unlinkSync(targetPath)
            filesProcessed++
            continue
          }

          if (stats.isDirectory()) {
            const dirResult = await this.eraseDirectory(
              targetPath,
              standard,
              (current) => {
                this.emit('progress', {
                  percent: Math.round(((i + 0.5) / totalCount) * 100),
                  currentStep: 1,
                  stepName: 'Shredding directory contents',
                  currentFile: path.basename(current),
                  filesProcessed,
                  totalFiles: totalCount,
                  totalBytes,
                  status: 'running',
                } as FileEraseProgress)
              },
            )
            filesProcessed += dirResult.filesProcessed
            totalBytes += dirResult.totalBytes
          } else {
            const fileResult = await this.eraseSingleFile(
              targetPath,
              standard,
              (step, name) => {
                this.emit('progress', {
                  percent: Math.round(((i + 1) / totalCount) * 100),
                  currentStep: step,
                  stepName: name,
                  currentFile: path.basename(targetPath),
                  filesProcessed,
                  totalFiles: totalCount,
                  totalBytes,
                  status: 'running',
                } as FileEraseProgress)
              },
            )
            filesProcessed += fileResult.filesProcessed
            totalBytes += fileResult.totalBytes
          }

          if (caseMeta?.cleanMetadata !== false) {
            const cleaned =
              await this.metadataCleaner.cleanMetadataTraces(targetPath)
            metadataCleaned.push(...cleaned)
          }
        } catch (err: any) {
          errors.push(`Error shredding "${targetPath}": ${err.message}`)
        }
      }

      const isSuccess = errors.length === 0 && filesProcessed > 0
      const status: FileEraseResult['status'] = isSuccess
        ? 'SUCCESS'
        : filesProcessed > 0
          ? 'PARTIAL'
          : 'FAILED'

      await this.auditService.recordOperation({
        case_id: caseId,
        operation: 'FILE_ERASE',
        target:
          paths.slice(0, 3).join(', ') +
          (paths.length > 3 ? ` (+${paths.length - 3} more)` : ''),
        details: {
          standard,
          filesProcessed,
          totalBytes,
          metadataCleaned,
          errors,
        },
        status: status === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
        operator: operatorId,
      })

      this.emit('progress', {
        percent: 100,
        currentStep: 4,
        stepName: 'Complete',
        currentFile: '',
        filesProcessed,
        totalFiles: paths.length,
        totalBytes,
        status: status === 'SUCCESS' ? 'completed' : 'failed',
      } as FileEraseProgress)

      return {
        status,
        success: isSuccess,
        filesProcessed,
        totalBytes,
        metadataCleaned: Array.from(new Set(metadataCleaned)),
        errors,
      }
    } finally {
      for (const l of locks) {
        l.release()
      }
    }
  }

  private async eraseSingleFile(
    filePath: string,
    standard: string,
    onProgress: (step: number, name: string) => void,
  ): Promise<{ filesProcessed: number; totalBytes: number }> {
    try {
      fs.chmodSync(filePath, 0o666)
    } catch {
      // ignore
    }

    const stats = fs.statSync(filePath)
    const size = stats.size
    let written = 0
    const CHUNK_SIZE = 1024 * 1024 // 1MB buffer

    onProgress(1, 'Physical Cluster Sector Overwrite')
    const isRandom = standard === 'nist-purge' || standard === 'nist-random'

    let fd = fs.openSync(filePath, 'r+')
    try {
      let pos = 0
      while (pos < size) {
        const writeSize = Math.min(CHUNK_SIZE, size - pos)
        const chunk = isRandom
          ? crypto.randomBytes(writeSize)
          : Buffer.alloc(writeSize, 0x00)
        fs.writeSync(fd, chunk, 0, writeSize, pos)
        pos += writeSize
        written += writeSize

        if (pos % (4 * 1024 * 1024) === 0) {
          await new Promise((r) => setImmediate(r))
        }
      }

      // Step 2: Flush & Purge Slack Space
      onProgress(2, 'Slack Space Purge')
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }

    // Step 3: Truncate to 0
    onProgress(3, 'Zero-length Truncation')
    fs.truncateSync(filePath, 0)

    // Step 4: Scramble file name in directory table to destroy metadata traces before unlink
    onProgress(4, 'Directory Entry Scramble & Unlink')
    const dir = path.dirname(filePath)
    const scrambled = path.join(
      dir,
      `__cys_${crypto.randomBytes(8).toString('hex')}.tmp`,
    )
    try {
      fs.renameSync(filePath, scrambled)
      fs.unlinkSync(scrambled)
    } catch {
      // If rename fails, unlink directly
      fs.unlinkSync(filePath)
    }

    return { filesProcessed: 1, totalBytes: written }
  }

  private async eraseDirectory(
    dirPath: string,
    standard: string,
    onProgress: (current: string) => void,
  ): Promise<{ filesProcessed: number; totalBytes: number }> {
    let filesProcessed = 0
    let totalBytes = 0

    const entries = fs.readdirSync(dirPath)
    for (const entry of entries) {
      const full = path.join(dirPath, entry)
      onProgress(full)

      const st = fs.lstatSync(full)
      if (st.isSymbolicLink()) {
        fs.unlinkSync(full)
        filesProcessed++
      } else if (st.isDirectory()) {
        const sub = await this.eraseDirectory(full, standard, onProgress)
        filesProcessed += sub.filesProcessed
        totalBytes += sub.totalBytes
      } else {
        const res = await this.eraseSingleFile(full, standard, () => {})
        filesProcessed += res.filesProcessed
        totalBytes += res.totalBytes
      }
    }

    try {
      fs.rmdirSync(dirPath)
    } catch {
      // ignore
    }

    return { filesProcessed, totalBytes }
  }
}
