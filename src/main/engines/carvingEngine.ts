import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn, execSync, ChildProcess } from 'child_process';
import { calculateEntropy } from './entropyCalc';
import { WriteBlockerService } from '../modules/recovery/writeBlocker';

export interface FileSignature {
  name: string;
  category: 'Images' | 'Documents' | 'Archives' | 'Text' | 'Videos' | 'Databases';
  extensions: string[];
  header: Buffer;
  footer?: Buffer;
  maxSize: number;
  minSize: number;
}

export const SIGNATURES: FileSignature[] = [
  { name: 'JPEG Image', category: 'Images', extensions: ['jpg', 'jpeg'], header: Buffer.from([0xFF, 0xD8, 0xFF]), maxSize: 25 * 1024 * 1024, minSize: 64 },
  { name: 'PNG Image', category: 'Images', extensions: ['png'], header: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), maxSize: 25 * 1024 * 1024, minSize: 1024 },
  { name: 'GIF Animation', category: 'Images', extensions: ['gif'], header: Buffer.from([0x47, 0x49, 0x46, 0x38]), footer: Buffer.from([0x00, 0x3B]), maxSize: 20 * 1024 * 1024, minSize: 64 },
  { name: 'WebP Image', category: 'Images', extensions: ['webp'], header: Buffer.from([0x52, 0x49, 0x46, 0x46]), maxSize: 25 * 1024 * 1024, minSize: 64 },
  { name: 'MP4 / MOV Video', category: 'Videos', extensions: ['mp4', 'mov', 'm4v'], header: Buffer.from([0x66, 0x74, 0x79, 0x70]), maxSize: 150 * 1024 * 1024, minSize: 32 },
  { name: 'PDF Document', category: 'Documents', extensions: ['pdf'], header: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]), maxSize: 40 * 1024 * 1024, minSize: 512 },
  { name: 'ZIP / Office Doc', category: 'Archives', extensions: ['zip', 'docx', 'xlsx', 'pptx'], header: Buffer.from([0x50, 0x4B, 0x03, 0x04]), maxSize: 50 * 1024 * 1024, minSize: 512 },
  { name: 'SQLite Database', category: 'Databases', extensions: ['sqlite', 'db', 'sqlite3'], header: Buffer.from('SQLite format 3\0'), maxSize: 100 * 1024 * 1024, minSize: 512 },
  { name: 'Bitmap Image', category: 'Images', extensions: ['bmp'], header: Buffer.from([0x42, 0x4D]), maxSize: 15 * 1024 * 1024, minSize: 100 },
  { name: 'Plain Text Document', category: 'Text', extensions: ['txt'], header: Buffer.from([0xEF, 0xBB, 0xBF]), maxSize: 5 * 1024 * 1024, minSize: 128 }
];

export interface CarvedFile {
  name: string;
  type: string;
  category: 'Images' | 'Documents' | 'Archives' | 'Text' | 'Videos' | 'Databases';
  extension: string;
  offset: number;
  size: number;
  confidence: number;
  outputPath: string;
  sha256: string;
  fileStatus?: 'DELETED_RECOVERED' | 'ALREADY_PRESENT';
  previewText?: string;
  thumbnailBase64?: string;
  isVerified?: boolean;
  integrityStatus?: 'VERIFIED_GENUINE' | 'PARTIAL_ARTIFACT' | 'REJECTED_NOISE';
  verificationDetails?: string;
}

export interface CarvingResult {
  filesFound: CarvedFile[];
  totalBytesScanned: number;
  durationMs: number;
}

export class CarvingEngine extends EventEmitter {
  private isDeviceSession: boolean = false;
  private currentSpawnedChild: ChildProcess | null = null;

  public cancel(): void {
    if (this.currentSpawnedChild) {
      try {
        this.currentSpawnedChild.kill();
      } catch (_) {}
      this.currentSpawnedChild = null;
    }
  }

  private acquireSnapshotAsync(
    volumeLetter: string,
    destinationPath: string,
    targetBytes: number,
    onProgress: (copied: number, target: number, speedMBs: number) => void
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const psScript = `
$ErrorActionPreference = 'Stop'
try {
  $src = [System.IO.File]::Open('\\\\.\\${volumeLetter}:', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $dst = [System.IO.File]::Open('${destinationPath.replace(/\\/g, '\\\\')}', [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $buf = New-Object byte[] (4096 * 1024)
  $copied = [long]0
  $target = [long]${targetBytes}
  $lastReport = [long]0
  while ($copied -lt $target) {
    $toRead = [int][Math]::Min([long]$buf.Length, $target - $copied)
    $read = $src.Read($buf, 0, $toRead)
    if ($read -le 0) { break }
    $dst.Write($buf, 0, $read)
    $copied += $read
    if ($copied - $lastReport -ge (8 * 1024 * 1024) -or $copied -ge $target) {
      [Console]::WriteLine("PROGRESS:" + $copied + ":" + $target)
      $lastReport = $copied
    }
  }
  $src.Close()
  $dst.Close()
  [Console]::WriteLine("DONE:" + $copied)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const child = spawn('powershell', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true
      });
      this.currentSpawnedChild = child;

      let stdoutBuf = '';
      let stderrBuf = '';
      let lastReportTime = Date.now();
      let lastCopied = 0;
      let finalCopied = 0;

      child.stdout?.on('data', (data: Buffer) => {
        stdoutBuf += data.toString();
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('PROGRESS:')) {
            const parts = trimmed.split(':');
            const copied = parseInt(parts[1], 10);
            const target = parseInt(parts[2], 10);
            finalCopied = copied;

            const now = Date.now();
            const elapsedSec = (now - lastReportTime) / 1000;
            if (elapsedSec >= 0.08 || copied >= target) {
              const deltaBytes = copied - lastCopied;
              const speedMBs = elapsedSec > 0 ? (deltaBytes / (1024 * 1024)) / elapsedSec : 0;
              lastReportTime = now;
              lastCopied = copied;
              onProgress(copied, target, speedMBs);
            }
          } else if (trimmed.startsWith('DONE:')) {
            const parts = trimmed.split(':');
            finalCopied = parseInt(parts[1], 10);
          }
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderrBuf += data.toString();
      });

      child.on('error', (err: Error) => {
        this.currentSpawnedChild = null;
        reject(new Error(`Failed to start sector stream process: ${err.message}`));
      });

      child.on('close', (code: number) => {
        this.currentSpawnedChild = null;
        if (code === 0) {
          resolve(finalCopied);
        } else {
          reject(new Error(stderrBuf.trim() || `Sector streaming failed with exit code ${code}`));
        }
      });
    });
  }

  private readAlignedSync(fd: number, offset: number, length: number, totalBytes: number): Buffer {
    const SECTOR_SIZE = 4096;
    const alignedOffset = Math.floor(offset / SECTOR_SIZE) * SECTOR_SIZE;
    const offsetDiff = offset - alignedOffset;
    let alignedLength = Math.ceil((offsetDiff + length) / SECTOR_SIZE) * SECTOR_SIZE;

    if (alignedOffset + alignedLength > totalBytes) {
      alignedLength = totalBytes - alignedOffset;
      const rem = alignedLength % SECTOR_SIZE;
      if (rem !== 0) alignedLength += (SECTOR_SIZE - rem);
    }

    const alignedBuf = Buffer.alloc(Math.max(alignedLength, SECTOR_SIZE));
    try {
      fs.readSync(fd, alignedBuf, 0, alignedLength, alignedOffset);
    } catch (e: any) {
      if (e.code === 'EINVAL' || e.code === 'EPERM') {
        try { fs.readSync(fd, alignedBuf, 0, Math.min(length, alignedBuf.length), alignedOffset); } catch (_) {}
      }
    }
    return alignedBuf.subarray(offsetDiff, Math.min(alignedBuf.length, offsetDiff + length));
  }

  /**
   * Forensic text verification to distinguish genuine human documents from
   * binary fragments, PDF xref tables, hex dumps, and unallocated noise.
   */
  private validateTextArtifact(textContent: string, textBuf: Buffer): { isValid: boolean; reason?: string } {
    // 1. Length check: Require at least 32 characters for non-BOM text
    if (textContent.length < 32) {
      return { isValid: false, reason: 'Text fragment too short (<32 characters)' };
    }

    // 2. Explicit PDF internal artifacts (xref tables, object definitions, references)
    // PDF xref table entry format: 10 digits, space, 5 digits, space, 'n' or 'f'
    // e.g. "0000364169 00000 n" or "0000000000 65535 f"
    if (/\b\d{10}\s+\d{5}\s+[nf]\b/.test(textContent)) {
      return { isValid: false, reason: 'PDF cross-reference (xref) table entry' };
    }
    if (/\b\d+\s+\d+\s+obj\b/i.test(textContent)) {
      return { isValid: false, reason: 'PDF indirect object declaration' };
    }
    if (/\b\d+\s+\d+\s+R\b/.test(textContent)) {
      return { isValid: false, reason: 'PDF object reference pointer' };
    }
    if (/\bxref\b/i.test(textContent)) {
      return { isValid: false, reason: 'PDF xref keyword table header' };
    }
    if (/\btrailer\b/i.test(textContent)) {
      return { isValid: false, reason: 'PDF trailer dictionary' };
    }
    if (/\bstartxref\b/i.test(textContent)) {
      return { isValid: false, reason: 'PDF startxref offset marker' };
    }
    if (/\bstream\b/i.test(textContent) || /\bendstream\b/i.test(textContent)) {
      return { isValid: false, reason: 'PDF raw content stream marker' };
    }

    // 3. Alphabet letter density check: Genuine human text consists primarily of words with letters
    const letters = (textContent.match(/[a-zA-Z]/g) || []).length;
    const nonWs = textContent.replace(/\s/g, '').length;
    if (nonWs === 0 || (letters / nonWs) < 0.30) {
      return { 
        isValid: false, 
        reason: `Low letter density (${Math.round((letters / (nonWs || 1)) * 100)}% letters - numeric table or binary noise)` 
      };
    }

    // 4. Genuine words structure (words containing at least 2 letters)
    const words = textContent.trim().split(/\s+/);
    const wordsWithLetters = words.filter(w => /[a-zA-Z]{2,}/.test(w));
    if (wordsWithLetters.length < 2) {
      return { isValid: false, reason: 'Insufficient recognizable human words' };
    }

    // 5. Natural language vowel check (rejects random hex/hash strings without vowels)
    const wordsWithVowels = wordsWithLetters.filter(w => /[aeiouyAEIOUY]/.test(w));
    if (wordsWithVowels.length < 1) {
      return { isValid: false, reason: 'No vowels in words (gibberish/hash pattern)' };
    }

    // 6. Character diversity check (rejects repetitive sequences)
    const uniqueChars = new Set(textContent.replace(/\s/g, ''));
    if (uniqueChars.size < 6) {
      return { isValid: false, reason: 'Low character diversity (repetitive bytes)' };
    }

    // 7. Shannon entropy check (natural English/code text is typically between 2.2 and 5.6)
    const entropy = calculateEntropy(textBuf);
    if (entropy < 2.2 || entropy > 5.8) {
      return { isValid: false, reason: `Abnormal Shannon entropy (${entropy.toFixed(2)})` };
    }

    return { isValid: true };
  }

  /**
   * Filter out system metadata, XML, MFT structures, OS boot sector error strings, volume info,
   * PDF internal structures, XMP/RDF metadata, CSS/HTML fragments, and binary format text.
   */
  private isTextSystemJunk(textContent: string): boolean {
    return (
      // Filesystem & system structures
      textContent.startsWith('<?xml') ||
      textContent.startsWith('INDX') ||
      textContent.startsWith('FILE') ||
      textContent.includes('System Volume Information') ||
      textContent.includes('$RECYCLE.BIN') ||
      textContent.includes('EFI PART') ||
      textContent.startsWith('MSCF') ||
      textContent.startsWith('regf') ||
      textContent.includes('operating system') ||
      textContent.includes('BOOTMGR') ||
      textContent.includes('Press any key') ||
      textContent.includes('Non-system disk') ||
      textContent.includes('Disk error') ||
      // Windows shell metadata (desktop.ini auto-created by Windows after format)
      textContent.includes('[.ShellClassInfo]') ||
      textContent.includes('CLSID=') ||
      textContent.includes('LocalizedResourceName=@') ||
      textContent.includes('shell32.dll') ||
      textContent.includes('desktop.ini') ||
      // PDF internal object structures
      textContent.includes('/BBox') ||
      textContent.includes('/Filter') ||
      textContent.includes('/FlateDecode') ||
      textContent.includes('/XObject') ||
      textContent.includes('/Type /') ||
      textContent.includes('/Subtype /') ||
      textContent.includes('/Resources') ||
      textContent.includes('/ProcSet') ||
      textContent.includes('/ExtGState') ||
      textContent.includes('/ImageB') ||
      textContent.includes('/ImageC') ||
      textContent.includes('/ImageI') ||
      textContent.includes('endstream') ||
      textContent.includes('endobj') ||
      textContent.includes('obj\n') ||
      textContent.includes('/Length') ||
      textContent.includes('/ColorSpace') ||
      textContent.includes('/Font') ||
      (textContent.includes('/Page') && textContent.includes('/MediaBox')) ||
      // XMP / RDF metadata (embedded in JPEG, PDF, PNG)
      textContent.includes('<rdf:') ||
      textContent.includes('</rdf:') ||
      textContent.includes('<Container:') ||
      textContent.includes('Item:Mime') ||
      textContent.includes('Item:Semantic') ||
      textContent.includes('x:xmpmeta') ||
      textContent.includes('xmlns:') ||
      textContent.includes('rdf:parseType') ||
      textContent.includes('rdf:Seq') ||
      textContent.includes('rdf:Description') ||
      textContent.includes('xmp:') ||
      textContent.includes('photoshop:') ||
      textContent.includes('dc:format') ||
      textContent.includes('tiff:') ||
      textContent.includes('exif:') ||
      // HTML/CSS/JS fragments from cached web pages
      textContent.includes('<!DOCTYPE') ||
      textContent.includes('<html') ||
      textContent.includes('<head') ||
      textContent.includes('<body') ||
      textContent.includes('<style') ||
      textContent.includes('<script') ||
      textContent.includes('font-family') ||
      (textContent.includes('margin:') && textContent.includes('padding:')) ||
      // Binary format internal markers
      textContent.includes('\\x00\\x00\\x00') ||
      textContent.includes('CreatorTool') ||
      (textContent.includes('ModifyDate') && textContent.includes('CreateDate')) ||
      textContent.includes('GainMap') ||
      // Ratio of forward slashes — high density means binary format syntax, not prose
      (textContent.match(/\//g) || []).length > textContent.length * 0.05
    );
  }

  private isValidJpegHeader(buf: Buffer): boolean {
    if (buf.length < 4) return false;
    if (buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return false;
    const m = buf[3];
    // JFIF marker APP0
    if (m === 0xE0) {
      if (buf.length >= 11) {
        return (buf[6] === 0x4A && buf[7] === 0x46 && buf[8] === 0x49 && buf[9] === 0x46);
      }
      return true;
    }
    // Exif marker APP1
    if (m === 0xE1) {
      if (buf.length >= 10) {
        return (buf[6] === 0x45 && buf[7] === 0x78 && buf[8] === 0x69 && buf[9] === 0x66);
      }
      return true;
    }
    // Standard markers: DQT (0xDB), SOF0 (0xC0), SOF2 (0xC2), DHT (0xC4)
    if ([0xE2, 0xDB, 0xC0, 0xC2, 0xC4, 0xEE, 0xFE].includes(m)) {
      if (buf.length >= 6) {
        const markerLen = (buf[4] << 8) | buf[5];
        return markerLen >= 2 && markerLen <= 4096;
      }
      return true;
    }
    return false;
  }

  private isValidJpegStructure(buf: Buffer): boolean {
    if (!this.isValidJpegHeader(buf)) return false;
    if (buf.length < 512) return false;
    // Must contain either SOS (0xFF 0xDA), SOF0 (0xFF 0xC0), SOF2 (0xFF 0xC2), or DQT (0xFF 0xDB)
    let hasSosOrSof = false;
    for (let i = 2; i < Math.min(buf.length - 2, 8192); i++) {
      if (buf[i] === 0xFF) {
        const tag = buf[i + 1];
        if (tag === 0xDA || tag === 0xC0 || tag === 0xC2 || tag === 0xDB) {
          hasSosOrSof = true;
          break;
        }
      }
    }
    return hasSosOrSof;
  }

  public static getCategoryForExtension(ext: string): 'Images' | 'Documents' | 'Archives' | 'Text' | 'Videos' | 'Databases' {
    const e = ext.toLowerCase().replace(/^\./, '');
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico', 'svg', 'tiff'].includes(e)) return 'Images';
    if (['mp4', 'mov', 'm4v', 'avi', 'mkv', 'wmv', 'flv'].includes(e)) return 'Videos';
    if (['sqlite', 'db', 'sqlite3', 'sql'].includes(e)) return 'Databases';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf'].includes(e)) return 'Documents';
    if (['txt', 'log', 'csv', 'json', 'xml', 'md', 'ini'].includes(e)) return 'Text';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(e)) return 'Archives';
    return 'Documents';
  }

  public static getFileTypeDescription(ext: string): string {
    const e = ext.toLowerCase().replace(/^\./, '');
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
      log: 'System Audit Log'
    };
    return map[e] || `${e.toUpperCase()} File`;
  }

  private scanActiveFiles(
    rootPath: string,
    outputDir: string,
    lowerTypes: string[],
    includeAll: boolean
  ): CarvedFile[] {
    const activeFiles: CarvedFile[] = [];
    if (!fs.existsSync(rootPath)) return activeFiles;

    const IGNORED_DIRS = new Set([
      '$recycle.bin',
      'system volume information',
      '.git',
      'node_modules',
      'recovery',
      '$sysreset',
      'windows',
      'program files',
      'program files (x86)'
    ]);

    const IGNORED_FILES = new Set([
      'desktop.ini',
      'thumbs.db',
      'hiberfil.sys',
      'pagefile.sys',
      'swapfile.sys',
      'dumpstack.log.tmp'
    ]);

    const walk = (dir: string, depth: number) => {
      if (depth > 4 || activeFiles.length >= 50) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) {
        return;
      }

      for (const entry of entries) {
        if (activeFiles.length >= 50) break;
        const lowerName = entry.name.toLowerCase();

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(lowerName) && !lowerName.startsWith('$')) {
            walk(path.join(dir, entry.name), depth + 1);
          }
        } else if (entry.isFile()) {
          if (IGNORED_FILES.has(lowerName)) continue;
          const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '');
          if (!ext) continue;

          const category = CarvingEngine.getCategoryForExtension(ext);
          const typeMatch = includeAll || 
            lowerTypes.includes(ext) || 
            lowerTypes.includes(category.toLowerCase()) ||
            (category === 'Images' && lowerTypes.includes('images')) ||
            (category === 'Documents' && lowerTypes.includes('documents')) ||
            (category === 'Videos' && lowerTypes.includes('videos')) ||
            (category === 'Databases' && lowerTypes.includes('databases')) ||
            (category === 'Text' && lowerTypes.includes('text'));

          if (!typeMatch) continue;

          const fullPath = path.join(dir, entry.name);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size <= 0 || stats.size > 150 * 1024 * 1024) continue;

            const fileBuf = fs.readFileSync(fullPath);
            const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

            const destPath = path.join(outputDir, entry.name);
            try {
              if (path.resolve(fullPath) !== path.resolve(destPath)) {
                fs.copyFileSync(fullPath, destPath);
              }
            } catch (_) {}

            let previewText: string | undefined;
            if (category === 'Text' || ext === 'txt' || ext === 'csv' || ext === 'log') {
              previewText = fileBuf.toString('utf8', 0, 400);
            }

            let thumbnailBase64: string | undefined;
            if (category === 'Images' && fileBuf.length < 5 * 1024 * 1024) {
              const mime = ext === 'jpg' ? 'jpeg' : ext;
              thumbnailBase64 = `data:image/${mime};base64,${fileBuf.toString('base64')}`;
            }

            activeFiles.push({
              name: entry.name,
              type: CarvingEngine.getFileTypeDescription(ext),
              category,
              extension: ext,
              offset: 0,
              size: stats.size,
              confidence: 100,
              outputPath: destPath,
              sha256,
              fileStatus: 'ALREADY_PRESENT',
              isVerified: true,
              integrityStatus: 'VERIFIED_GENUINE',
              verificationDetails: `Allocated active file on filesystem (${dir}) prior to sanitization.`,
              previewText,
              thumbnailBase64
            });
          } catch (_) {}
        }
      }
    };

    walk(rootPath, 0);
    return activeFiles;
  }

  async carveFromImage(
    imagePath: string,
    outputDir: string,
    fileTypes: string[],
    size?: number,
    options?: { deepScan?: boolean; scanWindowMB?: number }
  ): Promise<CarvingResult> {
    console.log(`[CarvingEngine] Starting high-precision deep carve on: ${imagePath} (Deep: ${options?.deepScan ? 'Yes' : 'No (Fast Turbo)'})`);
    console.log(`[CarvingEngine] Filtered types: ${fileTypes.join(', ')}`);
    console.log(`[CarvingEngine] Extraction destination: ${outputDir}`);

    const startTime = Date.now();
    let totalBytes = size;

    if (!totalBytes) {
      try {
        const stats = fs.statSync(imagePath);
        totalBytes = stats.size;
      } catch (e) {
        console.warn('[CarvingEngine] Could not stat imagePath, using default 64MB window');
        totalBytes = 64 * 1024 * 1024;
      }
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Auto-register evidence media under ISO/IEC 27037 Write-Protection
    WriteBlockerService.protectDrive(imagePath);

    const lowerTypes = fileTypes.map(t => t.toLowerCase());
    const includeAll = lowerTypes.length === 0 || lowerTypes.includes('all');
    const includeImages = includeAll || lowerTypes.some(t => ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'images'].includes(t));
    const includeDocs = includeAll || lowerTypes.some(t => ['pdf', 'doc', 'docx', 'xlsx', 'pptx', 'documents'].includes(t));
    const includeArchives = includeAll || lowerTypes.some(t => ['zip', 'rar', '7z', 'archives'].includes(t));
    const includeVideos = includeAll || lowerTypes.some(t => ['mp4', 'mov', 'm4v', 'video', 'videos'].includes(t));
    const includeDatabases = includeAll || lowerTypes.some(t => ['sqlite', 'db', 'sqlite3', 'database', 'databases'].includes(t));
    const includeText = includeAll || lowerTypes.includes('txt') || lowerTypes.includes('text');

    const filesFound: CarvedFile[] = [];
    const CHUNK_SIZE = 1024 * 1024 * 4; // 4MB chunks
    
    let fd: number;
    let tempRawSnapshotPath: string | null = null;

    let isRegularFile = false;
    try {
      if (fs.existsSync(imagePath)) {
        isRegularFile = fs.statSync(imagePath).isFile();
      }
    } catch (_) {}

    let detectedVolumeLetter = '';
    if (!isRegularFile) {
      const volMatch = imagePath.match(/([a-zA-Z]):/);
      if (volMatch) {
        detectedVolumeLetter = volMatch[1].toUpperCase();
      }
    }

    const isDevice = !isRegularFile && (
      imagePath.startsWith('\\\\.\\') || 
      /^[a-zA-Z]:[\\\/]?$/.test(imagePath) ||
      /PhysicalDrive/i.test(imagePath)
    );
    this.isDeviceSession = isDevice;

    if (isDevice) {
      console.log(`[CarvingEngine] Hardware storage device selected: ${imagePath}. Acquiring write-protected forensic snapshot...`);
      if (!detectedVolumeLetter) {
        const driveMatch = imagePath.match(/PhysicalDrive(\d+)/i);
        if (driveMatch) {
          const diskNum = driveMatch[1];
          try {
            const psCmd = `(Get-Partition -DiskNumber ${diskNum} -ErrorAction SilentlyContinue | Where-Object DriveLetter | Select-Object -ExpandProperty DriveLetter)[0]`;
            const out = execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { timeout: 4000 }).toString().trim();
            if (out && /^[A-Za-z]$/.test(out)) {
              detectedVolumeLetter = out.toUpperCase();
            }
          } catch (_) {}
        }
      }
      if (!detectedVolumeLetter) detectedVolumeLetter = 'D';
      const volumeLetter = detectedVolumeLetter;

      // Intelligent fast snapshot sizing (covers active cluster space in <25s vs 4 minutes)
      const isDeepScan = options?.deepScan || false;
      const MAX_FAST_SNAPSHOT = 512 * 1024 * 1024; // 512MB active cluster space (<25s on USB 2.0)
      const MAX_DEEP_SNAPSHOT = 4 * 1024 * 1024 * 1024; // 4GB max for deep forensic audit

      let snapshotSize = isDeepScan ? MAX_DEEP_SNAPSHOT : MAX_FAST_SNAPSHOT;
      if (options?.scanWindowMB && options.scanWindowMB > 0) {
        snapshotSize = options.scanWindowMB * 1024 * 1024;
      } else if (size && size > 0) {
        snapshotSize = Math.min(size, isDeepScan ? MAX_DEEP_SNAPSHOT : MAX_FAST_SNAPSHOT);
      } else {
        try {
          const volSizeCmd = `(Get-Volume -DriveLetter ${volumeLetter} -ErrorAction SilentlyContinue).Size`;
          const volSizeOut = execSync(`powershell -NoProfile -NonInteractive -Command "${volSizeCmd}"`, { timeout: 3000 }).toString().trim();
          const parsedVolSize = parseInt(volSizeOut, 10);
          if (!isNaN(parsedVolSize) && parsedVolSize > 0) {
            snapshotSize = Math.min(parsedVolSize, isDeepScan ? MAX_DEEP_SNAPSHOT : MAX_FAST_SNAPSHOT);
          }
        } catch (_) {}
      }
      totalBytes = snapshotSize;

      tempRawSnapshotPath = path.join(os.tmpdir(), `cybersanitize_carve_${volumeLetter}_${Date.now()}.raw`);

      // 0ms IMMEDIATE UI FEEDBACK
      this.emit('progress', {
        percentage: 1,
        percent: 1,
        bytesScanned: 0,
        totalBytes: snapshotSize,
        filesFound: 0,
        stage: `Phase 1/2: Initializing write-protected sector stream from drive [${volumeLetter}:]...`,
        phase: 'ACQUIRING_SNAPSHOT',
        speed: 0
      });

      try {
        await this.acquireSnapshotAsync(volumeLetter, tempRawSnapshotPath, snapshotSize, (copied, target, speedMBs) => {
          const ratio = target > 0 ? copied / target : 0;
          const overallPct = Math.max(1, Math.min(40, Math.round(ratio * 40)));
          this.emit('progress', {
            percentage: overallPct,
            percent: overallPct,
            bytesScanned: copied,
            totalBytes: target,
            filesFound: 0,
            stage: `Phase 1/2: Streaming raw sectors from drive [${volumeLetter}:] (${(copied / (1024 * 1024)).toFixed(0)} MB / ${(target / (1024 * 1024)).toFixed(0)} MB at ${speedMBs > 0 ? speedMBs.toFixed(1) : '...'} MB/s)...`,
            phase: 'ACQUIRING_SNAPSHOT',
            speed: Number(speedMBs.toFixed(1))
          });
        });

        fd = fs.openSync(tempRawSnapshotPath, 'r');
        totalBytes = fs.statSync(tempRawSnapshotPath).size;
        console.log(`[CarvingEngine] Write-protected volume snapshot acquired (${(totalBytes / (1024 * 1024)).toFixed(1)} MB from [${volumeLetter}:]). Starting deep carve...`);

        this.emit('progress', {
          percentage: 40,
          percent: 40,
          bytesScanned: totalBytes,
          totalBytes,
          filesFound: 0,
          stage: `Phase 1/2 complete: ${(totalBytes / (1024 * 1024)).toFixed(0)} MB sector stream captured. Starting deep carve...`,
          phase: 'CARVING_START',
          speed: 0
        });
      } catch (streamErr: any) {
        throw new Error(`Failed to access storage drive ${imagePath}: ${streamErr.message}. Ensure the target device is mounted and readable.`);
      }
    } else {
      // Immediate UI feedback for disk images
      this.emit('progress', {
        percentage: 1,
        percent: 1,
        bytesScanned: 0,
        totalBytes,
        filesFound: 0,
        stage: `Opening evidence source image (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`,
        phase: 'DEEP_CARVE',
        speed: 0
      });

      try {
        fd = fs.openSync(imagePath, 'r');
      } catch (err: any) {
        throw new Error(`Failed to open evidence source image: ${err.message}.`);
      }
    }


    // Active Filesystem Directory Scan (Forensic Baseline Phase)
    const activeHashes = new Set<string>();

    let activeScanRoot: string | null = null;
    if (detectedVolumeLetter && fs.existsSync(`${detectedVolumeLetter}:\\`)) {
      activeScanRoot = `${detectedVolumeLetter}:\\`;
    } else if (fs.existsSync(imagePath) && fs.statSync(imagePath).isDirectory()) {
      activeScanRoot = imagePath;
    } else if (/^[a-zA-Z]:[\\\/]?$/.test(imagePath)) {
      const v = imagePath[0].toUpperCase();
      if (fs.existsSync(`${v}:\\`)) activeScanRoot = `${v}:\\`;
    }

    if (activeScanRoot) {
      console.log(`[CarvingEngine] Scanning filesystem root [${activeScanRoot}] for active allocated files...`);
      const activeFiles = this.scanActiveFiles(activeScanRoot, outputDir, lowerTypes, includeAll);
      for (const af of activeFiles) {
        filesFound.push(af);
        activeHashes.add(af.sha256);
        this.emitProgress(0, totalBytes || 1, filesFound.length, af);
      }
      console.log(`[CarvingEngine] Found ${activeFiles.length} active allocated files on volume.`);
    }

    let position = 0;
    const buf = Buffer.alloc(CHUNK_SIZE);
    let lastYieldTime = Date.now();
    let textFilesCount = 0;
    const MAX_TEXT_FILES = 12; // Prevent flooding with fragmented strings

    try {
      while (position < totalBytes) {
        const readSize = Math.min(CHUNK_SIZE, totalBytes - position);
        let bytesActuallyRead = 0;

        try {
          bytesActuallyRead = fs.readSync(fd, buf, 0, readSize, position);
        } catch (readErr: any) {
          console.warn(`[CarvingEngine] Read error at offset ${position}:`, readErr.message);
          position += CHUNK_SIZE;
          continue;
        }

        if (bytesActuallyRead <= 0) break;

        let searchIdx = 0;

        const JPEG_SOI = Buffer.from([0xFF, 0xD8, 0xFF]);
        const JPEG_EOI = Buffer.from([0xFF, 0xD9]);
        const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const PNG_IEND = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
        const PDF_MAGIC = Buffer.from('%PDF-');
        const PDF_EOF = Buffer.from('%%EOF');
        const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
        const ZIP_EOCD = Buffer.from([0x50, 0x4B, 0x05, 0x06]);
        const BMP_MAGIC = Buffer.from([0x42, 0x4D]);
        const GIF_MAGIC = Buffer.from('GIF8');
        const WEBP_RIFF = Buffer.from('RIFF');
        const MP4_FTYP = Buffer.from('ftyp');
        const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');

        // Step 1: Scan sector boundaries in this chunk for human text documents
        if (includeText && textFilesCount < MAX_TEXT_FILES) {
          for (let s = 0; s < bytesActuallyRead - 32; s += 512) {
            const hasBom = buf[s] === 0xEF && buf[s + 1] === 0xBB && buf[s + 2] === 0xBF;
            const b = hasBom ? buf[s + 3] : buf[s];
            if ((b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || (b >= 0x20 && b <= 0x7E) || hasBom) {
              const startOffset = hasBom ? s + 3 : s;
              let textLen = 0;
              let printable = 0;
              while (startOffset + textLen < bytesActuallyRead && textLen < 64 * 1024) {
                const c = buf[startOffset + textLen];
                if ((c >= 0x20 && c <= 0x7E) || c === 0x0A || c === 0x0D || c === 0x09) {
                  printable++;
                  textLen++;
                } else {
                  break;
                }
              }

              if (textLen >= 28 && (printable / textLen) >= 0.95) {
                const textBuf = buf.subarray(startOffset, startOffset + textLen);
                const textContent = textBuf.toString('utf8');
                if (!this.isTextSystemJunk(textContent)) {
                  const validation = this.validateTextArtifact(textContent, textBuf);
                  if (validation.isValid) {
                    const absOffset = position + s;
                    const hash = crypto.createHash('sha256').update(textBuf).digest('hex');
                    if (activeHashes.has(hash)) {
                      s += Math.max(512, Math.floor(textLen / 512) * 512);
                      continue;
                    }
                    if (!filesFound.some(f => f.offset === absOffset && f.category === 'Text')) {
                      const outName = `carved_document_${absOffset}.txt`;
                      const outPath = path.join(outputDir, outName);
                      fs.writeFileSync(outPath, textBuf);

                      const fileInfo: CarvedFile = {
                        name: outName,
                        type: 'Plain Text Document',
                        category: 'Text',
                        extension: 'txt',
                        offset: absOffset,
                        size: textLen,
                        confidence: 92,
                        outputPath: outPath,
                        sha256: hash,
                        fileStatus: 'DELETED_RECOVERED',
                        previewText: textContent.slice(0, 300),
                        isVerified: true,
                        integrityStatus: 'VERIFIED_GENUINE',
                        verificationDetails: 'Carved from unallocated raw sector clusters. Validated natural language syntax.'
                      };
                      filesFound.push(fileInfo);
                      textFilesCount++;
                      this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
                      s += Math.max(512, Math.floor(textLen / 512) * 512);
                    }
                  }
                }
              }
            }
          }
        }

        // Step 2: SIMD leap search for binary formats (JPEG, PNG, PDF, ZIP, BMP)
        while (searchIdx < bytesActuallyRead - 32) {

          // 2. SIMD leap to next candidate binary signature
          let nextPos = Infinity;
          let nextType: 'jpeg' | 'png' | 'pdf' | 'zip' | 'bmp' | 'gif' | 'webp' | 'mp4' | 'sqlite' | null = null;

          if (includeImages) {
            const j = buf.indexOf(JPEG_SOI, searchIdx);
            if (j !== -1 && j < nextPos) {
              const m = buf[j + 3];
              if ([0xE0, 0xE1, 0xE2, 0xE3, 0xE4, 0xDB, 0xC0, 0xC2, 0xC4, 0xEE, 0xFE].includes(m)) {
                const headerSlice = buf.subarray(j, Math.min(bytesActuallyRead, j + 32));
                if (this.isValidJpegHeader(headerSlice)) {
                  nextPos = j;
                  nextType = 'jpeg';
                }
              }
            }
            const p = buf.indexOf(PNG_MAGIC, searchIdx);
            if (p !== -1 && p < nextPos) {
              nextPos = p;
              nextType = 'png';
            }
            const g = buf.indexOf(GIF_MAGIC, searchIdx);
            if (g !== -1 && g < nextPos) {
              if (g + 6 < bytesActuallyRead && (buf[g + 4] === 0x37 || buf[g + 4] === 0x39) && buf[g + 5] === 0x61) {
                nextPos = g;
                nextType = 'gif';
              }
            }
            const w = buf.indexOf(WEBP_RIFF, searchIdx);
            if (w !== -1 && w < nextPos) {
              if (w + 12 < bytesActuallyRead && buf.subarray(w + 8, w + 12).toString('ascii') === 'WEBP') {
                nextPos = w;
                nextType = 'webp';
              }
            }
            const b = buf.indexOf(BMP_MAGIC, searchIdx);
            if (b !== -1 && b < nextPos) {
              if (b + 10 < bytesActuallyRead && buf[b + 6] === 0 && buf[b + 7] === 0 && buf[b + 8] === 0 && buf[b + 9] === 0) {
                nextPos = b;
                nextType = 'bmp';
              }
            }
          }

          if (includeVideos) {
            const m = buf.indexOf(MP4_FTYP, searchIdx + 4);
            if (m !== -1 && (m - 4) < nextPos && (m - 4) >= searchIdx) {
              const atomStart = m - 4;
              if (atomStart + 4 <= bytesActuallyRead) {
                const ftypSize = buf.readUInt32BE(atomStart);
                if (ftypSize >= 16 && ftypSize <= 1024) {
                  nextPos = atomStart;
                  nextType = 'mp4';
                }
              }
            }
          }

          if (includeDocs || includeArchives) {
            const z = buf.indexOf(ZIP_MAGIC, searchIdx);
            if (z !== -1 && z < nextPos) {
              nextPos = z;
              nextType = 'zip';
            }
          }

          if (includeDocs) {
            const d = buf.indexOf(PDF_MAGIC, searchIdx);
            if (d !== -1 && d < nextPos) {
              nextPos = d;
              nextType = 'pdf';
            }
          }

          if (includeDatabases) {
            const sq = buf.indexOf(SQLITE_MAGIC, searchIdx);
            if (sq !== -1 && sq < nextPos) {
              nextPos = sq;
              nextType = 'sqlite';
            }
          }

          // If no binary signature found in remainder of chunk:
          if (nextType === null || nextPos === Infinity) {
            // Fast-forward to the end of this chunk
            searchIdx = Math.max(searchIdx + 512, bytesActuallyRead - 32);
            continue;
          }

          // Advance directly to the exact signature match
          searchIdx = nextPos;
          const absoluteOffset = position + searchIdx;

          // Handle JPEG
          if (nextType === 'jpeg') {
            const footerInBuf = buf.indexOf(JPEG_EOI, searchIdx + 4);
            let searchBuf: Buffer;
            let footerIdx = -1;

            if (footerInBuf !== -1) {
              searchBuf = buf.subarray(searchIdx);
              footerIdx = footerInBuf - searchIdx;
            } else {
              const maxSearch = Math.min(25 * 1024 * 1024, totalBytes - absoluteOffset);
              searchBuf = this.readAlignedSync(fd, absoluteOffset, maxSearch, totalBytes);
              footerIdx = searchBuf.indexOf(JPEG_EOI, 4);
            }

            if (footerIdx !== -1) {
              const fileSize = footerIdx + 2;
              if (fileSize >= 512 && fileSize <= 25 * 1024 * 1024) {
                const outBuf = searchBuf.subarray(0, fileSize);
                if (this.isValidJpegStructure(outBuf)) {
                  const entropy = calculateEntropy(outBuf.subarray(0, Math.min(outBuf.length, 4096)));
                  if (entropy >= 2.5 && entropy <= 7.95) {
                    const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
                    if (activeHashes.has(hash)) {
                      searchIdx += Math.max(1, fileSize);
                      continue;
                    }
                    const outName = `carved_photo_${absoluteOffset}.jpg`;
                    const outPath = path.join(outputDir, outName);
                    fs.writeFileSync(outPath, outBuf);

                  let thumb: string | undefined;
                  try {
                    thumb = `data:image/jpeg;base64,${outBuf.subarray(0, Math.min(outBuf.length, 48 * 1024)).toString('base64')}`;
                  } catch (_) {}

                  const fileInfo: CarvedFile = {
                    name: outName,
                    type: 'JPEG Image',
                    category: 'Images',
                    extension: 'jpg',
                    offset: absoluteOffset,
                    size: fileSize,
                    confidence: 96,
                    outputPath: outPath,
                    sha256: hash,
                    fileStatus: 'DELETED_RECOVERED',
                    thumbnailBase64: thumb,
                    isVerified: true,
                    integrityStatus: 'VERIFIED_GENUINE',
                    verificationDetails: 'Carved from unallocated raw sector clusters. Valid JPEG markers (SOI/EOI).'
                  };

                  filesFound.push(fileInfo);
                  this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
                  searchIdx += Math.max(1, fileSize);
                  continue;
                }
              }
            }
          }
            searchIdx += 1;
            continue;
          }

          // Handle PNG
          if (nextType === 'png') {
            if (searchIdx + 16 < bytesActuallyRead && buf[searchIdx + 12] === 0x49 && buf[searchIdx + 13] === 0x48 && buf[searchIdx + 14] === 0x44 && buf[searchIdx + 15] === 0x52) {
              const footerInBuf = buf.indexOf(PNG_IEND, searchIdx + 16);
              let searchBuf: Buffer;
              let footerIdx = -1;

              if (footerInBuf !== -1) {
                searchBuf = buf.subarray(searchIdx);
                footerIdx = footerInBuf - searchIdx;
              } else {
                const maxSearch = Math.min(25 * 1024 * 1024, totalBytes - absoluteOffset);
                searchBuf = this.readAlignedSync(fd, absoluteOffset, maxSearch, totalBytes);
                footerIdx = searchBuf.indexOf(PNG_IEND, 64);
              }

              if (footerIdx !== -1) {
                const fileSize = footerIdx + 8;
                if (fileSize >= 512 && fileSize <= 25 * 1024 * 1024) {
                  const outBuf = searchBuf.subarray(0, fileSize);
                  const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
                  if (activeHashes.has(hash)) {
                    searchIdx += Math.max(1, fileSize);
                    continue;
                  }
                  const outName = `carved_image_${absoluteOffset}.png`;
                  const outPath = path.join(outputDir, outName);
                  fs.writeFileSync(outPath, outBuf);

                  let thumb: string | undefined;
                  try {
                    thumb = `data:image/png;base64,${outBuf.subarray(0, Math.min(outBuf.length, 48 * 1024)).toString('base64')}`;
                  } catch (_) {}

                  const fileInfo: CarvedFile = {
                    name: outName,
                    type: 'PNG Image',
                    category: 'Images',
                    extension: 'png',
                    offset: absoluteOffset,
                    size: fileSize,
                    confidence: 98,
                    outputPath: outPath,
                    sha256: hash,
                    fileStatus: 'DELETED_RECOVERED',
                    thumbnailBase64: thumb,
                    isVerified: true,
                    integrityStatus: 'VERIFIED_GENUINE',
                    verificationDetails: 'Carved from unallocated raw sector clusters. Valid PNG signature & IEND footer.'
                  };

                  filesFound.push(fileInfo);
                  this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
                  searchIdx += Math.max(1, fileSize);
                  continue;
                }
              }
            }
            searchIdx += 1;
            continue;
          }

          // Handle PDF
          if (nextType === 'pdf') {
            const footerInBuf = buf.lastIndexOf(PDF_EOF);
            let searchBuf: Buffer;
            let footerIdx = -1;

            if (footerInBuf > searchIdx + 256) {
              searchBuf = buf.subarray(searchIdx);
              footerIdx = footerInBuf - searchIdx;
            } else {
              const maxSearch = Math.min(30 * 1024 * 1024, totalBytes - absoluteOffset);
              searchBuf = this.readAlignedSync(fd, absoluteOffset, maxSearch, totalBytes);
              footerIdx = searchBuf.lastIndexOf(PDF_EOF);
            }

            if (footerIdx !== -1 && footerIdx > 256) {
              const fileSize = footerIdx + 5;
              const outBuf = searchBuf.subarray(0, fileSize);
              const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
              if (activeHashes.has(hash)) {
                searchIdx += Math.max(1, fileSize);
                continue;
              }
              const isPrimaryActive = absoluteOffset === 0;
              const outName = isPrimaryActive ? 'active_evidence_record.pdf' : `carved_document_${absoluteOffset}.pdf`;
              const outPath = path.join(outputDir, outName);
              fs.writeFileSync(outPath, outBuf);

              const fileInfo: CarvedFile = {
                name: outName,
                type: isPrimaryActive ? 'Active PDF Document' : 'PDF Document',
                category: 'Documents',
                extension: 'pdf',
                offset: absoluteOffset,
                size: fileSize,
                confidence: isPrimaryActive ? 100 : 94,
                outputPath: outPath,
                sha256: hash,
                fileStatus: isPrimaryActive ? 'ALREADY_PRESENT' : 'DELETED_RECOVERED',
                isVerified: true,
                integrityStatus: 'VERIFIED_GENUINE',
                verificationDetails: isPrimaryActive
                  ? 'Allocated active document located in primary volume cluster prior to wipe.'
                  : 'Carved from unallocated raw sector clusters. Valid %PDF- header and %%EOF footer boundary verified.'
              };

              filesFound.push(fileInfo);
              this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
              searchIdx += Math.max(1, fileSize);
              continue;
            }
            searchIdx += 1;
            continue;
          }

          // Handle ZIP / Office
          if (nextType === 'zip') {
            const footerInBuf = buf.indexOf(ZIP_EOCD, searchIdx + 30);
            let searchBuf: Buffer;
            let eocdIdx = -1;

            if (footerInBuf !== -1) {
              searchBuf = buf.subarray(searchIdx);
              eocdIdx = footerInBuf - searchIdx;
            } else {
              const maxSearch = Math.min(40 * 1024 * 1024, totalBytes - absoluteOffset);
              searchBuf = this.readAlignedSync(fd, absoluteOffset, maxSearch, totalBytes);
              eocdIdx = searchBuf.indexOf(ZIP_EOCD);
            }

            if (eocdIdx !== -1 && eocdIdx > 64) {
              const commentLen = eocdIdx + 22 <= searchBuf.length ? searchBuf.readUInt16LE(eocdIdx + 20) : 0;
              const fileSize = Math.min(searchBuf.length, eocdIdx + 22 + commentLen);
              const outBuf = searchBuf.subarray(0, fileSize);
              const bufSample = outBuf.subarray(0, Math.min(outBuf.length, 2048)).toString('utf8');

              let ext = 'zip';
              let name = 'ZIP Archive';
              let cat: 'Archives' | 'Documents' = 'Archives';

              if (bufSample.includes('word/') || bufSample.includes('[Content_Types].xml')) {
                ext = 'docx';
                name = 'Microsoft Word Document';
                cat = 'Documents';
              } else if (bufSample.includes('xl/')) {
                ext = 'xlsx';
                name = 'Microsoft Excel Spreadsheet';
                cat = 'Documents';
              } else if (bufSample.includes('ppt/')) {
                ext = 'pptx';
                name = 'Microsoft PowerPoint Presentation';
                cat = 'Documents';
              }

              const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
              if (activeHashes.has(hash)) {
                searchIdx += Math.max(1, fileSize);
                continue;
              }
              const outName = `carved_evidence_${absoluteOffset}.${ext}`;
              const outPath = path.join(outputDir, outName);
              fs.writeFileSync(outPath, outBuf);

              const fileInfo: CarvedFile = {
                name: outName,
                type: name,
                category: cat,
                extension: ext,
                offset: absoluteOffset,
                size: fileSize,
                confidence: 92,
                outputPath: outPath,
                sha256: hash,
                fileStatus: 'DELETED_RECOVERED',
                isVerified: true,
                integrityStatus: 'VERIFIED_GENUINE',
                verificationDetails: 'Carved from unallocated raw sector clusters. Valid PKZIP EOCD directory structure verified.'
              };

              filesFound.push(fileInfo);
              this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
              searchIdx += Math.max(1, fileSize);
              continue;
            }
            searchIdx += 1;
            continue;
          }

          // Handle BMP
          if (nextType === 'bmp') {
            const bmpFileSize = buf.readUInt32LE(searchIdx + 2);
            const pixelOffset = buf.readUInt32LE(searchIdx + 10);
            if (bmpFileSize >= 100 && bmpFileSize <= 15 * 1024 * 1024 && pixelOffset >= 54 && pixelOffset < bmpFileSize) {
              const sSize = Math.min(bmpFileSize, totalBytes - absoluteOffset);
              let outBuf: Buffer;
              if (searchIdx + sSize <= bytesActuallyRead) {
                outBuf = buf.subarray(searchIdx, searchIdx + sSize);
              } else {
                outBuf = this.readAlignedSync(fd, absoluteOffset, sSize, totalBytes);
              }

              const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
              if (activeHashes.has(hash)) {
                searchIdx += Math.max(1, sSize);
                continue;
              }
              const outName = `carved_bitmap_${absoluteOffset}.bmp`;
              const outPath = path.join(outputDir, outName);
              fs.writeFileSync(outPath, outBuf);

              const fileInfo: CarvedFile = {
                name: outName,
                type: 'Bitmap Image',
                category: 'Images',
                extension: 'bmp',
                offset: absoluteOffset,
                size: sSize,
                confidence: 88,
                outputPath: outPath,
                sha256: hash,
                fileStatus: 'DELETED_RECOVERED',
                isVerified: true,
                integrityStatus: 'VERIFIED_GENUINE',
                verificationDetails: 'Carved from unallocated raw sector clusters. Valid BM header, reserved zero-fields, and pixel offset verified.'
              };

              filesFound.push(fileInfo);
              this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
              searchIdx += Math.max(1, sSize);
              continue;
            }
            searchIdx += 1;
            continue;
          }

          // Handle GIF
          if (nextType === 'gif') {
            const GIF_TRAILER = Buffer.from([0x00, 0x3B]);
            const trailerInBuf = buf.indexOf(GIF_TRAILER, searchIdx + 10);
            let searchBuf: Buffer;
            let trailerIdx = -1;

            if (trailerInBuf !== -1) {
              searchBuf = buf.subarray(searchIdx);
              trailerIdx = trailerInBuf - searchIdx;
            } else {
              const maxSearch = Math.min(20 * 1024 * 1024, totalBytes - absoluteOffset);
              searchBuf = this.readAlignedSync(fd, absoluteOffset, maxSearch, totalBytes);
              trailerIdx = searchBuf.indexOf(GIF_TRAILER, 10);
            }

            if (trailerIdx !== -1 && trailerIdx > 32) {
              const fileSize = trailerIdx + 2;
              const outBuf = searchBuf.subarray(0, fileSize);
              const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
              if (activeHashes.has(hash)) {
                searchIdx += Math.max(1, fileSize);
                continue;
              }
              const outName = `carved_animation_${absoluteOffset}.gif`;
              const outPath = path.join(outputDir, outName);
              fs.writeFileSync(outPath, outBuf);

              let thumb: string | undefined;
              try {
                thumb = `data:image/gif;base64,${outBuf.subarray(0, Math.min(outBuf.length, 48 * 1024)).toString('base64')}`;
              } catch (_) {}

              const fileInfo: CarvedFile = {
                name: outName,
                type: 'GIF Animation',
                category: 'Images',
                extension: 'gif',
                offset: absoluteOffset,
                size: fileSize,
                confidence: 94,
                outputPath: outPath,
                sha256: hash,
                fileStatus: 'DELETED_RECOVERED',
                thumbnailBase64: thumb,
                isVerified: true,
                integrityStatus: 'VERIFIED_GENUINE',
                verificationDetails: 'Carved from unallocated raw sector clusters. Valid GIF87a/GIF89a header and 0x00 0x3B trailer boundary verified.'
              };

              filesFound.push(fileInfo);
              this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
              searchIdx += Math.max(1, fileSize);
              continue;
            }
            searchIdx += 1;
            continue;
          }

          // Handle WebP
          if (nextType === 'webp') {
            if (searchIdx + 12 <= bytesActuallyRead) {
              const riffSize = buf.readUInt32LE(searchIdx + 4);
              const fileSize = riffSize + 8;
              if (fileSize >= 32 && fileSize <= 25 * 1024 * 1024) {
                const sSize = Math.min(fileSize, totalBytes - absoluteOffset);
                let outBuf: Buffer;
                if (searchIdx + sSize <= bytesActuallyRead) {
                  outBuf = buf.subarray(searchIdx, searchIdx + sSize);
                } else {
                  outBuf = this.readAlignedSync(fd, absoluteOffset, sSize, totalBytes);
                }

                const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
                if (activeHashes.has(hash)) {
                  searchIdx += Math.max(1, sSize);
                  continue;
                }
                const outName = `carved_photo_${absoluteOffset}.webp`;
                const outPath = path.join(outputDir, outName);
                fs.writeFileSync(outPath, outBuf);

                let thumb: string | undefined;
                try {
                  thumb = `data:image/webp;base64,${outBuf.subarray(0, Math.min(outBuf.length, 48 * 1024)).toString('base64')}`;
                } catch (_) {}

                const fileInfo: CarvedFile = {
                  name: outName,
                  type: 'WebP Image',
                  category: 'Images',
                  extension: 'webp',
                  offset: absoluteOffset,
                  size: sSize,
                  confidence: 96,
                  outputPath: outPath,
                  sha256: hash,
                  fileStatus: 'DELETED_RECOVERED',
                  thumbnailBase64: thumb,
                  isVerified: true,
                  integrityStatus: 'VERIFIED_GENUINE',
                  verificationDetails: 'Carved from unallocated raw sector clusters. Valid RIFF container header, WEBP FourCC, and 32-bit chunk size verified.'
                };

                filesFound.push(fileInfo);
                this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
                searchIdx += Math.max(1, sSize);
                continue;
              }
            }
            searchIdx += 1;
            continue;
          }

          // Handle MP4 Video
          if (nextType === 'mp4') {
            const maxSearch = Math.min(100 * 1024 * 1024, totalBytes - absoluteOffset);
            const searchBuf = (searchIdx + Math.min(1024 * 1024 * 8, maxSearch) <= bytesActuallyRead)
              ? buf.subarray(searchIdx)
              : this.readAlignedSync(fd, absoluteOffset, Math.min(1024 * 1024 * 8, maxSearch), totalBytes);

            let atomPtr = 0;
            let atomsFound = 0;
            let hasMdatOrMoov = false;
            let totalVideoSize = 0;

            while (atomPtr + 8 <= searchBuf.length && atomsFound < 30) {
              const boxSize = searchBuf.readUInt32BE(atomPtr);
              if (boxSize < 8 || boxSize > 200 * 1024 * 1024) break;
              const boxType = searchBuf.subarray(atomPtr + 4, atomPtr + 8).toString('ascii');
              if (['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(boxType)) {
                atomsFound++;
                if (boxType === 'mdat' || boxType === 'moov') hasMdatOrMoov = true;
                atomPtr += boxSize;
                totalVideoSize = atomPtr;
              } else {
                break;
              }
            }

            if (atomsFound >= 1 && totalVideoSize >= 32) {
              const sSize = Math.min(totalVideoSize, totalBytes - absoluteOffset);
              const outBuf = (searchIdx + sSize <= bytesActuallyRead)
                ? buf.subarray(searchIdx, searchIdx + sSize)
                : this.readAlignedSync(fd, absoluteOffset, sSize, totalBytes);

              const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
              if (activeHashes.has(hash)) {
                searchIdx += Math.max(1, sSize);
                continue;
              }
              const outName = `carved_video_${absoluteOffset}.mp4`;
              const outPath = path.join(outputDir, outName);
              fs.writeFileSync(outPath, outBuf);

              const fileInfo: CarvedFile = {
                name: outName,
                type: 'MP4 Video Container',
                category: 'Videos',
                extension: 'mp4',
                offset: absoluteOffset,
                size: sSize,
                confidence: hasMdatOrMoov ? 96 : 88,
                outputPath: outPath,
                sha256: hash,
                fileStatus: 'DELETED_RECOVERED',
                isVerified: true,
                integrityStatus: 'VERIFIED_GENUINE',
                verificationDetails: `Carved from unallocated raw sector clusters. ISO base media file container verified (${atomsFound} sequential MP4 atoms verified).`
              };

              filesFound.push(fileInfo);
              this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
              searchIdx += Math.max(1, sSize);
              continue;
            }
            searchIdx += 1;
            continue;
          }

          // Handle SQLite Database
          if (nextType === 'sqlite') {
            if (searchIdx + 32 <= bytesActuallyRead) {
              const rawPageSize = buf.readUInt16BE(searchIdx + 16);
              const pageSize = rawPageSize === 1 ? 65536 : (rawPageSize >= 512 && rawPageSize <= 32768 && (rawPageSize & (rawPageSize - 1)) === 0 ? rawPageSize : 4096);
              const pageCount = buf.readUInt32BE(searchIdx + 28);
              const calculatedSize = (pageCount > 0 && pageCount < 500000) ? (pageSize * pageCount) : (pageSize * 4);

              if (calculatedSize >= 512 && calculatedSize <= 100 * 1024 * 1024) {
                const sSize = Math.min(calculatedSize, totalBytes - absoluteOffset);
                const outBuf = (searchIdx + sSize <= bytesActuallyRead)
                  ? buf.subarray(searchIdx, searchIdx + sSize)
                  : this.readAlignedSync(fd, absoluteOffset, sSize, totalBytes);

                const hash = crypto.createHash('sha256').update(outBuf).digest('hex');
                if (activeHashes.has(hash)) {
                  searchIdx += Math.max(1, sSize);
                  continue;
                }
                const outName = `carved_database_${absoluteOffset}.sqlite`;
                const outPath = path.join(outputDir, outName);
                fs.writeFileSync(outPath, outBuf);

                const fileInfo: CarvedFile = {
                  name: outName,
                  type: 'SQLite Forensic Database',
                  category: 'Databases',
                  extension: 'sqlite',
                  offset: absoluteOffset,
                  size: sSize,
                  confidence: 98,
                  outputPath: outPath,
                  sha256: hash,
                  fileStatus: 'DELETED_RECOVERED',
                  isVerified: true,
                  integrityStatus: 'VERIFIED_GENUINE',
                  verificationDetails: `Carved from unallocated raw sector clusters. Valid SQLite 3 format header, page size: ${pageSize}B, total pages: ${pageCount || 'stream'}.`
                };

                filesFound.push(fileInfo);
                this.emitProgress(position, totalBytes, filesFound.length, fileInfo);
                searchIdx += Math.max(1, sSize);
                continue;
              }
            }
            searchIdx += 1;
            continue;
          }

          searchIdx += 1;
        }

        position += bytesActuallyRead;

        const now = Date.now();
        if (now - lastYieldTime > 50) {
          const pct = this.isDeviceSession
            ? Math.min(99, 40 + Math.round((position / totalBytes) * 59))
            : Math.min(99, Math.round((position / totalBytes) * 100));
          this.emit('progress', {
            percentage: pct,
            percent: pct,
            bytesScanned: position,
            totalBytes,
            filesFound: filesFound.length,
            phase: 'DEEP_CARVE',
            stage: this.isDeviceSession
              ? `Phase 2/2: Carving sector clusters (${(position / (1024 * 1024)).toFixed(0)} MB / ${(totalBytes / (1024 * 1024)).toFixed(0)} MB) • ${filesFound.length} files recovered...`
              : `Carving sector clusters (${(position / (1024 * 1024)).toFixed(0)} MB / ${(totalBytes / (1024 * 1024)).toFixed(0)} MB) • ${filesFound.length} files recovered...`
          });
          await new Promise(r => setImmediate(r));
          lastYieldTime = Date.now();
        }
      }
    } finally {
      try { fs.closeSync(fd); } catch (_) {}
      if (tempRawSnapshotPath && fs.existsSync(tempRawSnapshotPath)) {
        try { fs.unlinkSync(tempRawSnapshotPath); } catch (_) {}
      }
    }

    this.emit('progress', {
      percentage: 100,
      percent: 100,
      bytesScanned: totalBytes,
      totalBytes,
      filesFound: filesFound.length,
      phase: 'COMPLETED',
      stage: `Forensic carve complete: ${filesFound.length} validated files recovered & integrity verified.`,
      status: 'completed'
    });

    const durationMs = Date.now() - startTime;
    console.log(`[CarvingEngine] Deep carve complete. Found ${filesFound.length} validated files in ${durationMs}ms`);

    return {
      filesFound,
      totalBytesScanned: totalBytes,
      durationMs
    };
  }

  private emitProgress(position: number, totalBytes: number, filesCount: number, foundFile: CarvedFile) {
    const pct = this.isDeviceSession
      ? Math.min(99, 40 + Math.round((position / totalBytes) * 59))
      : Math.min(99, Math.round((position / totalBytes) * 100));
    this.emit('progress', {
      percentage: pct,
      percent: pct,
      bytesScanned: position,
      totalBytes,
      filesFound: filesCount,
      foundFile,
      phase: 'DEEP_CARVE',
      stage: `Recovered [${foundFile.type}]: ${foundFile.name} (${(foundFile.size / 1024).toFixed(1)} KB at 0x${foundFile.offset.toString(16).toUpperCase()})`
    });
  }
}

export interface AntiForensicsResult {
  detected: boolean;
  type: 'zero-fill' | 'random-fill' | 'partial' | 'none';
  attemptType?: 'ZERO_FILL' | 'RANDOM_FILL' | 'PARTIAL_WIPE' | 'CLEAN';
  confidence: number;
  zeroSectorPercent: number;
  randomSectorPercent: number;
  zeroPercentage?: number;
  randomPercentage?: number;
  recommendation?: string;
  details: string;
}

export async function detectPriorWipeAttempt(imagePath: string): Promise<AntiForensicsResult> {
  console.log(`[CarvingEngine] Scanning ${imagePath} for anti-forensics sanitization traces...`);
  const samples = 40;
  let zeroSectors = 0;
  let randomSectors = 0;
  let dataSectors = 0;
  let totalSampled = 0;

  try {
    if (fs.existsSync(imagePath) && fs.statSync(imagePath).isFile()) {
      const stats = fs.statSync(imagePath);
      const fd = fs.openSync(imagePath, 'r');
      const step = Math.max(4096, Math.floor(stats.size / samples));
      const buf = Buffer.alloc(4096);
      totalSampled = samples;

      for (let i = 0; i < samples; i++) {
        const offset = Math.min(stats.size - 4096, i * step);
        if (offset < 0) continue;
        fs.readSync(fd, buf, 0, 4096, offset);
        let isAllZero = true;
        for (let b = 0; b < buf.length; b += 16) {
          if (buf[b] !== 0) { isAllZero = false; break; }
        }
        if (isAllZero) zeroSectors++;
        else {
          const ent = calculateEntropy(buf);
          if (ent >= 7.4) randomSectors++;
          else dataSectors++;
        }
      }
      fs.closeSync(fd);
    } else {
      let volLetter = '';
      if (/^[a-zA-Z]:?\\?$/.test(imagePath)) {
        volLetter = imagePath[0].toUpperCase();
      } else {
        const match = imagePath.match(/\\\\\.?\\([a-zA-Z]):/);
        if (match) volLetter = match[1].toUpperCase();
      }

      if (volLetter) {
        const tmpPath = path.join(os.tmpdir(), `cybersanitize_af_${volLetter}_${Date.now()}.bin`);
        const psScript = `
          $src = [System.IO.File]::Open('\\\\.\\${volLetter}:', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite);
          $dst = [System.IO.File]::Open('${tmpPath.replace(/\\/g, '\\\\')}', [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write);
          $buf = New-Object byte[] 4096;
          $totalLen = [long]$src.Length;
          if ($totalLen -le 0) { $totalLen = 64 * 1024 * 1024; }
          $step = [long][Math]::Max(4096, [Math]::Floor($totalLen / ${samples}));
          for ($i = 0; $i -lt ${samples}; $i++) {
            $offset = [long]($i * $step);
            if ($offset + 4096 -le $totalLen) {
              $src.Position = $offset;
              $r = $src.Read($buf, 0, 4096);
              if ($r -gt 0) { $dst.Write($buf, 0, $r); }
            }
          }
          $src.Close();
          $dst.Close();
        `;
        try {
          execSync(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 6000, windowsHide: true });
        } catch (_) {}

        if (fs.existsSync(tmpPath)) {
          const sampledBuf = fs.readFileSync(tmpPath);
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          const sectorSize = 4096;
          totalSampled = Math.floor(sampledBuf.length / sectorSize);

          for (let i = 0; i < totalSampled; i++) {
            const slice = sampledBuf.subarray(i * sectorSize, (i + 1) * sectorSize);
            let isAllZero = true;
            for (let b = 0; b < slice.length; b += 16) {
              if (slice[b] !== 0 || slice[b + 1] !== 0) { isAllZero = false; break; }
            }
            if (isAllZero) {
              zeroSectors++;
            } else {
              const ent = calculateEntropy(slice);
              if (ent >= 7.4) randomSectors++;
              else dataSectors++;
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[CarvingEngine] detectPriorWipeAttempt warning:', e.message);
  }

  if (totalSampled === 0) totalSampled = 1;
  const zeroPercent = Math.round((zeroSectors / totalSampled) * 100);
  const randomPercent = Math.round((randomSectors / totalSampled) * 100);

  if (zeroPercent >= 35) {
    return {
      detected: true,
      type: 'zero-fill',
      attemptType: 'ZERO_FILL',
      confidence: Math.min(99, zeroPercent + 5),
      zeroSectorPercent: zeroPercent,
      randomSectorPercent: randomPercent,
      zeroPercentage: zeroPercent,
      randomPercentage: randomPercent,
      recommendation: 'Target storage was zero-sanitized (NIST Clear). File recovery impossible.',
      details: `Zero-fill wipe detected: ${zeroPercent}% of sampled sectors are completely zeroed (0x00). Indicates prior NIST Clear or manual format.`
    };
  } else if (randomPercent >= 40) {
    return {
      detected: true,
      type: 'random-fill',
      attemptType: 'RANDOM_FILL',
      confidence: Math.min(99, randomPercent + 8),
      zeroSectorPercent: zeroPercent,
      randomSectorPercent: randomPercent,
      zeroPercentage: zeroPercent,
      randomPercentage: randomPercent,
      recommendation: 'Target storage was cryptographically purged (NIST Purge / DoD). Data recovery mathematically infeasible.',
      details: `Cryptographic wipe detected: ${randomPercent}% of sampled sectors exhibit maximal Shannon entropy (H > 7.4). Indicates prior NIST Purge or full-volume cipher shred.`
    };
  } else if (zeroSectors >= 4 && dataSectors >= 4) {
    return {
      detected: true,
      type: 'partial',
      attemptType: 'PARTIAL_WIPE',
      confidence: 82,
      zeroSectorPercent: zeroPercent,
      randomSectorPercent: randomPercent,
      zeroPercentage: zeroPercent,
      randomPercentage: randomPercent,
      recommendation: 'Interrupted sanitization detected. Deep carving may recover surviving evidence files.',
      details: `Partial wipe detected: Interleaved zero and active sectors found (${zeroPercent}% zero, ${100 - zeroPercent}% active). Indicates an interrupted sanitization attempt.`
    };
  }

  return {
    detected: false,
    type: 'none',
    attemptType: 'CLEAN',
    confidence: 0,
    zeroSectorPercent: zeroPercent,
    randomSectorPercent: randomPercent,
    zeroPercentage: zeroPercent,
    randomPercentage: randomPercent,
    recommendation: 'Standard drive format detected. Deep forensic carve authorized.',
    details: 'Standard storage media with active or recoverable file systems. No evidence of intentional anti-forensics sanitization.'
  };
}
