import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { authorizeDestructiveTarget } from '../security/targetGuard'
import { SecurityError } from '../types/errors'
import { AuditService } from './auditService'
import { WriteBlockerService } from './writeBlockerService'
import { OperationLockService } from './operationLock'
import { ServiceContext } from './serviceContext'
import { verifyWipe, VerificationResult, calculateEntropy } from './entropyCalc'
import { sha256Hex } from '../crypto/hash'

export type WipeStandardType =
  | 'nist-clear'
  | 'nist-purge'
  | 'dod-3'
  | 'dod-7'
  | 'nist-zero'
  | 'nist-random'
  | 'nist-fast'
  | 'nvme-crypto'

export interface WipeOptions {
  dryRun?: boolean
  blockSize?: number
  verify?: boolean
  size?: number
  caseMeta?: {
    caseId?: string
    operatorId?: string
    caseTitle?: string
    evidenceTag?: string
    overrideWriteBlocker?: boolean
    role?: string
  }
}

export interface PassResult {
  passNumber: number
  pattern: string
  bytesWritten: number
  durationMs: number
}

export interface WipeProgress {
  percent: number
  currentPass: number
  totalPasses: number
  bytesWritten: number
  totalBytes: number
  speed: number
  phase: 'writing' | 'verifying' | 'complete' | 'cancelled'
  currentPattern: string
}

export interface WipeResult {
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'DRY_RUN' | 'UNAVAILABLE'
  success: boolean
  standard: string
  passes: PassResult[]
  verification: VerificationResult | null
  startTime: string
  endTime: string
  totalBytes: number
  durationMs: number
  targetPath: string
  preHash?: string
  postHash?: string
  error?: string
}

export class WipeService extends EventEmitter {
  private static instance: WipeService | null = null
  private readonly auditService: AuditService
  private readonly writeBlockerService: WriteBlockerService
  private readonly lockService: OperationLockService
  private readonly context: ServiceContext
  private cancelledTargets = new Set<string>()

  constructor(context: ServiceContext = ServiceContext.getInstance()) {
    super()
    this.context = context
    this.auditService = new AuditService(context)
    this.writeBlockerService = WriteBlockerService.getInstance()
    this.lockService = OperationLockService.getInstance()
  }

  public static getInstance(): WipeService {
    if (!WipeService.instance) {
      WipeService.instance = new WipeService()
    }
    return WipeService.instance
  }

  public cancel(targetPath: string): void {
    const norm = this.lockService.normalizeTarget(targetPath)
    this.cancelledTargets.add(norm)
  }

  public isCancelled(targetPath: string): boolean {
    const norm = this.lockService.normalizeTarget(targetPath)
    return this.cancelledTargets.has(norm)
  }

  public getStandards(): Array<{
    id: string
    name: string
    passes: number
    description: string
    patterns: string[]
  }> {
    return [
      {
        id: 'nist-clear',
        name: 'NIST SP 800-88 Rev. 1 Clear (Zero Overwrite)',
        passes: 1,
        description:
          'Single pass of pure zeros (0x00) across all addressable storage blocks. Verified by Adaptive Shannon Entropy H(X) ~= 0.0000.',
        patterns: ['0x00'],
      },
      {
        id: 'nist-purge',
        name: 'NIST SP 800-88 Rev. 1 Purge (Crypto / Random Erase)',
        passes: 1,
        description:
          'High-entropy cryptographic noise overwrite pass. Verified by Adaptive Entropy H(X) ~= 8.0000 and magic-byte absence scan.',
        patterns: ['random'],
      },
      {
        id: 'dod-3',
        name: 'DoD 5220.22-M Standard (3-Pass Legacy)',
        passes: 3,
        description:
          'Legacy military sanitization standard: zeros -> ones -> cryptographically pseudo-random.',
        patterns: ['0x00', '0xFF', 'random'],
      },
      {
        id: 'dod-7',
        name: 'DoD 5220.22-M ECE (7-Pass Military Sanitization)',
        passes: 7,
        description:
          'Seven-pass rigorous overwrite sequence for high-security environments.',
        patterns: ['0x00', '0xFF', 'random', '0x96', '0x00', '0xFF', 'random'],
      },
      {
        id: 'nist-fast',
        name: 'NIST SP 800-88 Fast Cryptographic Purge (Headers & MFT)',
        passes: 1,
        description:
          'Sanitizes partition tables, allocation structures and headers with random bytes.',
        patterns: ['crypto-meta-purge'],
      },
    ]
  }

  public async startWipe(
    targetPath: string,
    standardInput: string,
    options: WipeOptions = {},
  ): Promise<WipeResult> {
    const startTimeMs = Date.now()
    const startTime = new Date(startTimeMs).toISOString()

    // 1. Validate and authorize target (Phase 11: Security Boundaries)
    const targetDecision = await authorizeDestructiveTarget(targetPath)
    if (!targetDecision.allowed) {
      throw new SecurityError(targetDecision.code, targetDecision.message)
    }
    const classifiedTarget = targetDecision.value

    // 2. Authorize operator permissions
    const operatorClaims = options.caseMeta || {
      operatorId: 'EXAMINER-101',
      role: 'operator',
    }
    const permDecision = this.context.permissionGuard.authorize(
      'DESTRUCTIVE_WIPE',
      operatorClaims,
    )
    if (!permDecision.allowed) {
      throw new SecurityError(permDecision.code, permDecision.message)
    }

    // 3. ISO/IEC 27037 Write-Blocker Check
    if (options.caseMeta?.overrideWriteBlocker) {
      this.writeBlockerService.unprotectDrive(targetPath)
    } else {
      this.writeBlockerService.assertWriteAllowed(targetPath)
    }

    // 4. Acquire in-process concurrency lock
    const lock = this.lockService.acquireLock(targetPath, 'WIPE')
    const norm = this.lockService.normalizeTarget(targetPath)
    this.cancelledTargets.delete(norm)

    const standard = this.normalizeStandard(standardInput)
    const caseId = options.caseMeta?.caseId || 'CASE-GENERAL'
    const operatorId = permDecision.value.operatorId

    try {
      // 5. Check Dry-Run
      if (options.dryRun) {
        const dryResult: WipeResult = {
          status: 'DRY_RUN',
          success: true,
          standard,
          passes: [],
          verification: null,
          startTime,
          endTime: new Date().toISOString(),
          totalBytes: 0,
          durationMs: Date.now() - startTimeMs,
          targetPath,
        }

        await this.auditService.recordOperation({
          case_id: caseId,
          operation: 'DRIVE_WIPE',
          target: targetPath,
          details: { standard, dryRun: true, plan: 'Dry run execution plan' },
          status: 'COMPLETED',
          operator: operatorId,
        })

        return dryResult
      }

      // 6. Determine target size
      let targetSize = options.size || 0
      if (
        !targetSize &&
        classifiedTarget.kind === 'REGULAR_FILE' &&
        classifiedTarget.filePath
      ) {
        try {
          const stats = fs.statSync(classifiedTarget.filePath)
          targetSize = stats.size
        } catch {
          targetSize = 10 * 1024 * 1024 // fallback 10MB
        }
      }
      if (targetSize <= 0) {
        targetSize = 10 * 1024 * 1024
      }

      // 7. Execute Wipe Passes
      const passConfigs = this.getPassConfigurations(standard)
      const passResults: PassResult[] = []
      let totalBytesWritten = 0
      const CHUNK_SIZE = Math.min(
        1024 * 1024,
        Math.max(4096, options.blockSize || 64 * 1024),
      )

      // Calculate pre-hash sample
      const preHash = await this.quickSampleHash(
        classifiedTarget.normalized,
        targetSize,
      )

      let wasCancelled = false

      for (let pIdx = 0; pIdx < passConfigs.length; pIdx++) {
        if (this.isCancelled(targetPath)) {
          wasCancelled = true
          break
        }

        const pass = passConfigs[pIdx]
        const passStartMs = Date.now()
        let passBytes = 0

        // Open target handle
        let fd: number | null = null
        try {
          fd = fs.openSync(classifiedTarget.normalized, 'r+')
        } catch {
          try {
            fd = fs.openSync(classifiedTarget.normalized, 'w')
          } catch (err: any) {
            throw new SecurityError(
              'TARGET_UNSUPPORTED',
              `Cannot open target for writing: ${err.message}`,
            )
          }
        }

        try {
          let pos = 0
          let lastReportMs = Date.now()

          while (pos < targetSize) {
            if (this.isCancelled(targetPath)) {
              wasCancelled = true
              break
            }

            const writeSize = Math.min(CHUNK_SIZE, targetSize - pos)
            const chunk = this.createPatternChunk(pass.pattern, writeSize)

            fs.writeSync(fd, chunk, 0, writeSize, pos)
            pos += writeSize
            passBytes += writeSize
            totalBytesWritten += writeSize

            const now = Date.now()
            if (now - lastReportMs >= 100 || pos >= targetSize) {
              const overallPercent = Math.min(
                99,
                Math.round(
                  ((pIdx * targetSize + pos) /
                    (passConfigs.length * targetSize)) *
                    100,
                ),
              )
              const elapsedSec = Math.max(0.001, (now - passStartMs) / 1000)
              const speed = Math.round(passBytes / elapsedSec)

              this.emit('progress', {
                percent: overallPercent,
                currentPass: pIdx + 1,
                totalPasses: passConfigs.length,
                bytesWritten: totalBytesWritten,
                totalBytes: targetSize * passConfigs.length,
                speed,
                phase: 'writing',
                currentPattern: pass.pattern,
              } as WipeProgress)

              lastReportMs = now
              await new Promise((r) => setImmediate(r))
            }
          }
        } finally {
          if (fd !== null) {
            try {
              fs.closeSync(fd)
            } catch {
              // ignore
            }
          }
        }

        if (wasCancelled) break

        passResults.push({
          passNumber: pIdx + 1,
          pattern: pass.pattern,
          bytesWritten: passBytes,
          durationMs: Date.now() - passStartMs,
        })
      }

      if (wasCancelled) {
        this.emit('progress', {
          percent: 0,
          currentPass: 0,
          totalPasses: passConfigs.length,
          bytesWritten: totalBytesWritten,
          totalBytes: targetSize * passConfigs.length,
          speed: 0,
          phase: 'cancelled',
          currentPattern: 'CANCELLED',
        } as WipeProgress)

        await this.auditService.recordOperation({
          case_id: caseId,
          operation: 'DRIVE_WIPE',
          target: targetPath,
          details: {
            standard,
            wasCancelled: true,
            bytesWritten: totalBytesWritten,
          },
          status: 'FAILED',
          operator: operatorId,
        })

        return {
          status: 'CANCELLED',
          success: false,
          standard,
          passes: passResults,
          verification: null,
          startTime,
          endTime: new Date().toISOString(),
          totalBytes: totalBytesWritten,
          durationMs: Date.now() - startTimeMs,
          targetPath,
        }
      }

      // 8. Verification Phase
      let verification: VerificationResult | null = null
      if (options.verify !== false) {
        this.emit('progress', {
          percent: 99,
          currentPass: passConfigs.length,
          totalPasses: passConfigs.length,
          bytesWritten: totalBytesWritten,
          totalBytes: targetSize * passConfigs.length,
          speed: 0,
          phase: 'verifying',
          currentPattern: 'Shannon Entropy Verification',
        } as WipeProgress)

        let vFd: number | null = null
        try {
          vFd = fs.openSync(classifiedTarget.normalized, 'r')
          const verifyMode =
            standard === 'nist-clear' || standard === 'nist-zero'
              ? 'nist-clear'
              : 'nist-purge'
          verification = await verifyWipe(vFd, targetSize, verifyMode)
        } catch {
          verification = null
        } finally {
          if (vFd !== null) {
            try {
              fs.closeSync(vFd)
            } catch {
              // ignore
            }
          }
        }
      }

      const postHash = await this.quickSampleHash(
        classifiedTarget.normalized,
        targetSize,
      )
      const isVerified = verification ? verification.passed : false
      const finalStatus = isVerified ? 'VERIFIED' : 'COMPLETED'

      // 9. Persist Actual Audit Record
      await this.auditService.recordOperation({
        case_id: caseId,
        operation: 'DRIVE_WIPE',
        target: targetPath,
        details: {
          standard,
          passes: passResults,
          totalBytes: totalBytesWritten,
          verificationPassed: isVerified,
          averageEntropy: verification?.averageEntropy,
        },
        status: finalStatus,
        operator: operatorId,
        hash_before: preHash,
        hash_after: postHash,
        verification_result: verification
          ? (verification as unknown as Record<string, unknown>)
          : null,
      })

      this.emit('progress', {
        percent: 100,
        currentPass: passConfigs.length,
        totalPasses: passConfigs.length,
        bytesWritten: totalBytesWritten,
        totalBytes: targetSize * passConfigs.length,
        speed: 0,
        phase: 'complete',
        currentPattern: 'Complete',
      } as WipeProgress)

      return {
        status: 'SUCCESS',
        success: true,
        standard,
        passes: passResults,
        verification,
        startTime,
        endTime: new Date().toISOString(),
        totalBytes: totalBytesWritten,
        durationMs: Date.now() - startTimeMs,
        targetPath,
        preHash,
        postHash,
      }
    } catch (err: any) {
      await this.auditService.recordOperation({
        case_id: caseId,
        operation: 'DRIVE_WIPE',
        target: targetPath,
        details: { standard, error: err.message },
        status: 'FAILED',
        operator: operatorId,
      })
      throw err
    } finally {
      lock.release()
      this.cancelledTargets.delete(norm)
    }
  }

  public async getEntropySnapshot(
    targetPath: string,
  ): Promise<{ entropy: number; mode: string }> {
    try {
      const fd = fs.openSync(targetPath, 'r')
      const buf = Buffer.alloc(64 * 1024)
      const read = fs.readSync(fd, buf, 0, buf.length, 0)
      fs.closeSync(fd)
      const ent = calculateEntropy(buf.subarray(0, read))
      return {
        entropy: parseFloat(ent.toFixed(4)),
        mode: ent < 0.5 ? 'ZERO_FILLED' : 'ENTROPIC',
      }
    } catch {
      return { entropy: 0, mode: 'UNAVAILABLE' }
    }
  }

  public async createTestImage(
    sizeMB: number,
  ): Promise<{ success: boolean; filePath: string }> {
    const validMB = Math.min(1024, Math.max(1, sizeMB))
    const testDir = path.join(this.context.tempDir, 'test_images')
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }
    const testFile = path.join(
      testDir,
      `test_image_${Date.now()}_${validMB}MB.img`,
    )
    const fd = fs.openSync(testFile, 'w')
    const chunk = crypto.randomBytes(1024 * 1024)
    for (let i = 0; i < validMB; i++) {
      fs.writeSync(fd, chunk, 0, chunk.length)
    }
    fs.closeSync(fd)
    return { success: true, filePath: testFile }
  }

  private normalizeStandard(std: string): WipeStandardType {
    const s = std.toLowerCase()
    if (s === 'nist-zero') return 'nist-clear'
    if (s === 'nist-random') return 'nist-purge'
    if (
      [
        'nist-clear',
        'nist-purge',
        'dod-3',
        'dod-7',
        'nist-fast',
        'nvme-crypto',
      ].includes(s)
    ) {
      return s as WipeStandardType
    }
    return 'nist-clear'
  }

  private getPassConfigurations(
    standard: WipeStandardType,
  ): Array<{ pattern: string }> {
    switch (standard) {
      case 'nist-clear':
      case 'nist-zero':
        return [{ pattern: '0x00' }]
      case 'nist-purge':
      case 'nist-random':
        return [{ pattern: 'random' }]
      case 'dod-3':
        return [{ pattern: '0x00' }, { pattern: '0xFF' }, { pattern: 'random' }]
      case 'dod-7':
        return [
          { pattern: '0x00' },
          { pattern: '0xFF' },
          { pattern: 'random' },
          { pattern: '0x96' },
          { pattern: '0x00' },
          { pattern: '0xFF' },
          { pattern: 'random' },
        ]
      case 'nist-fast':
        return [{ pattern: 'random' }]
      default:
        return [{ pattern: '0x00' }]
    }
  }

  private createPatternChunk(pattern: string, size: number): Buffer {
    if (pattern === '0x00') {
      return Buffer.alloc(size, 0x00)
    }
    if (pattern === '0xFF') {
      return Buffer.alloc(size, 0xff)
    }
    if (pattern === '0x96') {
      return Buffer.alloc(size, 0x96)
    }
    return crypto.randomBytes(size)
  }

  private async quickSampleHash(
    filePath: string,
    size: number,
  ): Promise<string> {
    try {
      const fd = fs.openSync(filePath, 'r')
      const buf = Buffer.alloc(Math.min(64 * 1024, size))
      const read = fs.readSync(fd, buf, 0, buf.length, 0)
      fs.closeSync(fd)
      return sha256Hex(buf.subarray(0, read))
    } catch {
      return '0'.repeat(64)
    }
  }
}
