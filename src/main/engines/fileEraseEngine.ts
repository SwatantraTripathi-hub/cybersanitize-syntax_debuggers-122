import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { WipeStandard } from './wipeEngine'

export interface FileEraseResult {
  state: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  success: boolean
  filesProcessed: number
  totalBytes: number
  metadataCleaned: string[]
  error?: string
}

export interface FileEraseProgress {
  percent: number
  currentFile: string
  filesProcessed: number
  totalFiles: number
  totalBytes: number
  status: 'running' | 'completed' | 'failed'
}

export class FileEraseEngine extends EventEmitter {
  async secureDeleteFile(filePath: string, _standard: WipeStandard): Promise<FileEraseResult> {
    let stats: fs.Stats
    try {
      stats = fs.lstatSync(filePath)
      if (!stats.isFile()) throw new Error('Only regular files can be securely deleted')
      const fd = fs.openSync(filePath, 'r+')
      try {
        const buffer = Buffer.alloc(1024 * 1024)
        let offset = 0
        while (offset < stats.size) {
          const length = Math.min(buffer.length, stats.size - offset)
          let written = 0
          while (written < length) {
            const result = fs.writeSync(fd, buffer, written, length - written, offset + written)
            if (result <= 0) throw new Error('Write returned no progress')
            written += result
          }
          offset += written
        }
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      fs.unlinkSync(filePath)
      return { state: 'SUCCESS', success: true, filesProcessed: 1, totalBytes: stats.size, metadataCleaned: ['file contents overwritten', 'directory entry unlinked'] }
    } catch (error) {
      return { state: 'FAILED', success: false, filesProcessed: 0, totalBytes: 0, metadataCleaned: [], error: error instanceof Error ? error.message : String(error) }
    }
  }

  async secureDeleteFolder(folderPath: string, standard: WipeStandard): Promise<FileEraseResult> {
    let stats: fs.Stats
    try {
      stats = fs.lstatSync(folderPath)
      if (!stats.isDirectory()) throw new Error('Target is not a directory')
      const root = path.resolve(folderPath)
      let filesProcessed = 0
      let totalBytes = 0
      const visit = async (directory: string): Promise<void> => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const child = path.join(directory, entry.name)
          if (entry.isSymbolicLink()) continue
          if (entry.isDirectory()) await visit(child)
          else {
            const result = await this.secureDeleteFile(child, standard)
            if (!result.success) throw new Error(result.error || `Could not erase ${child}`)
            filesProcessed += result.filesProcessed
            totalBytes += result.totalBytes
          }
        }
      }
      await visit(root)
      fs.rmdirSync(root)
      return { state: 'SUCCESS', success: true, filesProcessed, totalBytes, metadataCleaned: ['file contents overwritten', 'directory entries unlinked'] }
    } catch (error) {
      return { state: 'PARTIAL', success: false, filesProcessed: 0, totalBytes: 0, metadataCleaned: [], error: error instanceof Error ? error.message : String(error) }
    }
  }
}
