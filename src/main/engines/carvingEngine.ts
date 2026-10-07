import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

export interface FileSignature {
  name: string
  category: 'Images' | 'Documents' | 'Archives' | 'Text' | 'Videos' | 'Databases'
  extensions: string[]
  header: Buffer
  footer?: Buffer
  maxSize: number
  minSize: number
}

export const SIGNATURES: readonly FileSignature[] = [
  { name: 'JPEG Image', category: 'Images', extensions: ['jpg', 'jpeg'], header: Buffer.from([0xff, 0xd8, 0xff]), footer: Buffer.from([0xff, 0xd9]), minSize: 64, maxSize: 25 * 1024 * 1024 },
  { name: 'PNG Image', category: 'Images', extensions: ['png'], header: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), footer: Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]), minSize: 64, maxSize: 25 * 1024 * 1024 },
  { name: 'PDF Document', category: 'Documents', extensions: ['pdf'], header: Buffer.from('%PDF-'), footer: Buffer.from('%%EOF'), minSize: 32, maxSize: 40 * 1024 * 1024 },
  { name: 'ZIP Archive', category: 'Archives', extensions: ['zip'], header: Buffer.from([0x50, 0x4b, 0x03, 0x04]), minSize: 30, maxSize: 50 * 1024 * 1024 },
  { name: 'SQLite Database', category: 'Databases', extensions: ['sqlite'], header: Buffer.from('SQLite format 3\0'), minSize: 100, maxSize: 100 * 1024 * 1024 }
]

export interface CarvedFile {
  name: string
  type: string
  category: FileSignature['category']
  extension: string
  offset: number
  size: number
  confidence: number
  outputPath: string
  sha256: string
  isVerified: boolean
  integrityStatus: 'VERIFIED_GENUINE' | 'PARTIAL_ARTIFACT' | 'REJECTED_NOISE'
}

export interface CarvingResult {
  filesFound: CarvedFile[]
  totalBytesScanned: number
  durationMs: number
}

function find(buffer: Buffer, needle: Buffer, start: number): number {
  return buffer.indexOf(needle, start)
}

export class CarvingEngine extends EventEmitter {
  private cancelled = false

  cancel(): void {
    this.cancelled = true
  }

  async carve(sourcePath: string, destinationPath: string): Promise<CarvingResult> {
    const started = Date.now()
    this.cancelled = false
    const source = path.resolve(sourcePath)
    const destination = path.resolve(destinationPath)
    const sourceStats = fs.lstatSync(source)
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) throw new Error('Carving source must be a regular file')
    if (source === destination || destination.startsWith(`${source}${path.sep}`) || source.startsWith(`${destination}${path.sep}`)) {
      throw new Error('Carving destination must not overlap the evidence source')
    }
    fs.mkdirSync(destination, { recursive: true })
    const fd = fs.openSync(source, 'r')
    const results: CarvedFile[] = []
    const seen = new Set<string>()
    const acceptedRanges: Array<{ start: number; end: number }> = []
    const chunkSize = 1024 * 1024
    const overlap = Math.max(...SIGNATURES.map((signature) => signature.header.length)) - 1
    let carry = Buffer.alloc(0)
    let scanned = 0
    try {
      while (scanned < sourceStats.size) {
        if (this.cancelled) break
        const length = Math.min(chunkSize, sourceStats.size - scanned)
        const chunk = Buffer.allocUnsafe(length)
        const read = fs.readSync(fd, chunk, 0, length, scanned)
        const data = Buffer.concat([carry, chunk.subarray(0, read)])
        const baseOffset = scanned - carry.length
        for (const signature of SIGNATURES) {
          let position = 0
          while ((position = find(data, signature.header, position)) !== -1) {
            const offset = baseOffset + position
            position += 1
            if (offset < 0 || seen.has(`${signature.name}:${offset}`)) continue
            const end = signature.footer ? find(data, signature.footer, position) : -1
            if (signature.footer && end === -1 && offset + data.length < sourceStats.size && data.length < signature.maxSize) continue
            const available = end === -1 ? Math.min(signature.maxSize, sourceStats.size - offset) : end + signature.footer.length - offset
            if (available < signature.minSize || available > signature.maxSize) continue
            if (acceptedRanges.some((range) => offset < range.end && offset + available > range.start)) continue
            seen.add(`${signature.name}:${offset}`)
            const outputName = `${offset}.${signature.extensions[0]}`
            const outputPath = path.join(destination, outputName)
            const outputFd = fs.openSync(outputPath, 'wx')
            const sourceFd = fs.openSync(source, 'r')
            const hash = createHash('sha256')
            try {
              let remaining = available
              let sourceOffset = offset
              const buffer = Buffer.alloc(Math.min(1024 * 1024, available))
              while (remaining > 0) {
                const amount = fs.readSync(sourceFd, buffer, 0, Math.min(buffer.length, remaining), sourceOffset)
                if (amount <= 0) throw new Error('Truncated source while carving')
                fs.writeSync(outputFd, buffer, 0, amount)
                hash.update(buffer.subarray(0, amount))
                sourceOffset += amount
                remaining -= amount
              }
            } finally {
              fs.closeSync(sourceFd)
              fs.closeSync(outputFd)
            }
            results.push({ name: outputName, type: signature.name, category: signature.category, extension: signature.extensions[0], offset, size: available, confidence: signature.footer ? 1 : 0.5, outputPath, sha256: hash.digest('hex'), isVerified: Boolean(signature.footer), integrityStatus: signature.footer ? 'VERIFIED_GENUINE' : 'PARTIAL_ARTIFACT' })
            acceptedRanges.push({ start: offset, end: offset + available })
          }
        }
        scanned += read
        carry = data.subarray(Math.max(0, data.length - overlap))
        this.emit('progress', { bytesScanned: scanned, totalBytes: sourceStats.size })
        if (read === 0) break
      }
    } finally {
      fs.closeSync(fd)
    }
    return { filesFound: results, totalBytesScanned: scanned, durationMs: Date.now() - started }
  }

  async carveFromImage(sourcePath: string, destinationPath: string): Promise<CarvingResult> {
    return this.carve(sourcePath, destinationPath)
  }
}
