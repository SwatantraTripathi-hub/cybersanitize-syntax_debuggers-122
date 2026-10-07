import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { getWipeStandard, WipeStandardId } from './wipeStandards'
import { resolveWipeTarget } from './wipeTarget'

export type WipeStandard = WipeStandardId | 'nist-zero' | 'nist-random' | 'dod-3' | 'dod-7'
export type WipeState = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'CANCELLED' | 'DRY_RUN' | 'UNAVAILABLE'

export interface WipeOptions {
  dryRun?: boolean
  blockSize?: number
  verify?: boolean
  size?: number
  signal?: AbortSignal
}

export interface PassResult {
  passNumber: number
  pattern: string
  bytesWritten: number
  durationMs: number
}

export interface WipeResult {
  state: WipeState
  success: boolean
  standard: string
  passes: PassResult[]
  verification: { passed: boolean; checkedBytes: number; failedOffset?: number } | null
  startTime: string
  endTime: string
  totalBytes: number
  bytesWritten: number
  durationMs: number
  error?: string
}

function normalizeStandard(input: WipeStandard): WipeStandardId {
  if (input === 'nist-zero') return 'nist-clear'
  if (input === 'nist-random') return 'nist-purge'
  if (input === 'dod-3' || input === 'dod-7') return 'legacy-multi-pass'
  return input
}

export class WipeEngine extends EventEmitter {
  private cancelled = false

  cancel(): void {
    this.cancelled = true
  }

  async wipe(targetPath: string, requestedStandard: WipeStandard, options: WipeOptions = {}): Promise<WipeResult> {
    const started = Date.now()
    const startTime = new Date(started).toISOString()
    this.cancelled = false
    const passes: PassResult[] = []
    let bytesWritten = 0
    let totalBytes = 0
    const standard = normalizeStandard(requestedStandard)
    const finish = (state: WipeState, verification: WipeResult['verification'], error?: string): WipeResult => ({
      state,
      success: state === 'SUCCESS',
      standard,
      passes,
      verification,
      startTime,
      endTime: new Date().toISOString(),
      totalBytes,
      bytesWritten,
      durationMs: Date.now() - started,
      ...(error ? { error } : {})
    })

    let target
    try {
      target = resolveWipeTarget(targetPath)
      totalBytes = target.size || 0
    } catch (error) {
      return finish('FAILED', null, error instanceof Error ? error.message : String(error))
    }
    const definition = getWipeStandard(standard)
    if (definition.status === 'UNAVAILABLE') return finish('UNAVAILABLE', null, definition.description)
    if (options.size !== undefined && (!Number.isSafeInteger(options.size) || options.size < 0 || options.size > totalBytes)) {
      return finish('FAILED', null, 'Requested size is outside the validated target')
    }
    const workSize = options.size ?? totalBytes
    totalBytes = workSize
    if (options.dryRun || standard === 'dry-run') return finish('DRY_RUN', null)
    const blockSize = options.blockSize ?? 1024 * 1024
    if (!Number.isSafeInteger(blockSize) || blockSize < 4096 || blockSize > 16 * 1024 * 1024) {
      return finish('FAILED', null, 'Block size is outside the supported range')
    }
    if (target.kind !== 'REGULAR_FILE' && target.kind !== 'DISK_IMAGE') {
      return finish('UNAVAILABLE', null, 'Only validated regular files and disk images are supported')
    }

    let fd: number | undefined
    try {
      fd = fs.openSync(target.resolvedPath, 'r+')
      const passCount = standard === 'legacy-multi-pass' ? 3 : 1
      for (let pass = 0; pass < passCount; pass += 1) {
        const passStarted = Date.now()
        const pattern = passCount === 1 || pass === passCount - 1 ? 0x00 : pass === 0 ? 0xff : 0xaa
        const buffer = Buffer.alloc(blockSize, pattern)
        let offset = 0
        while (offset < workSize) {
          if (this.cancelled || options.signal?.aborted) {
            fs.fsyncSync(fd)
            return finish(bytesWritten === 0 ? 'CANCELLED' : 'PARTIAL', null)
          }
          const length = Math.min(blockSize, workSize - offset)
          let written = 0
          while (written < length) {
            const result = fs.writeSync(fd, buffer, written, length - written, offset + written)
            if (result <= 0) throw new Error('Write returned no progress')
            written += result
            bytesWritten += result
          }
          this.emit('progress', { bytesWritten, totalBytes: workSize, passNumber: pass + 1, status: 'running' })
        }
        fs.fsyncSync(fd)
        passes.push({ passNumber: pass + 1, pattern: `0x${pattern.toString(16).padStart(2, '0')}`, bytesWritten: workSize, durationMs: Date.now() - passStarted })
      }
      let verification: WipeResult['verification'] = null
      if (options.verify !== false) {
        const buffer = Buffer.alloc(blockSize)
        let checkedBytes = 0
        let failedOffset: number | undefined
        while (checkedBytes < workSize) {
          const length = Math.min(blockSize, workSize - checkedBytes)
          const read = fs.readSync(fd, buffer, 0, length, checkedBytes)
          if (read !== length) return finish('FAILED', { passed: false, checkedBytes: checkedBytes + read }, 'Read-back returned fewer bytes than expected')
          for (let index = 0; index < length; index += 1) {
            if (buffer[index] !== 0) { failedOffset = checkedBytes + index; break }
          }
          if (failedOffset !== undefined) break
          checkedBytes += length
        }
        verification = { passed: failedOffset === undefined, checkedBytes, ...(failedOffset === undefined ? {} : { failedOffset }) }
        if (!verification.passed) return finish('FAILED', verification, 'Read-back verification failed')
      }
      return finish('SUCCESS', verification)
    } catch (error) {
      return finish(bytesWritten > 0 ? 'PARTIAL' : 'FAILED', null, error instanceof Error ? error.message : String(error))
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd) } catch { /* cleanup is best effort after operation failure */ }
      }
    }
  }
}

export async function quickEntropySnapshot(targetPath: string): Promise<{ entropy: number; bytesSampled: number }> {
  const target = resolveWipeTarget(targetPath)
  const fd = fs.openSync(target.resolvedPath, 'r')
  try {
    const sample = Buffer.alloc(Math.min(target.size || 0, 1024 * 1024))
    const bytesSampled = sample.length ? fs.readSync(fd, sample, 0, sample.length, 0) : 0
    const frequencies = new Uint32Array(256)
    for (let index = 0; index < bytesSampled; index += 1) frequencies[sample[index]] += 1
    let entropy = 0
    for (const count of frequencies) if (count) { const p = count / bytesSampled; entropy -= p * Math.log2(p) }
    return { entropy: Number.isFinite(entropy) ? entropy : 0, bytesSampled }
  } finally {
    fs.closeSync(fd)
  }
}
