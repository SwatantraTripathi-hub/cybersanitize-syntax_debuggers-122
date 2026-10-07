import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class MetadataCleaner {
  public async cleanMetadataTraces(filePath: string): Promise<string[]> {
    if (process.platform !== 'win32') return [];

    const cleaned: string[] = [];
    const fileName = path.basename(filePath);
    const fileNameNoExt = path.parse(fileName).name.toLowerCase();

    // Step 1: Native deletion of Recent shortcut files (.lnk)
    try {
      const recentPath = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
      if (fs.existsSync(recentPath)) {
        const entries = await fs.promises.readdir(recentPath);
        for (const entry of entries) {
          if (entry.toLowerCase().endsWith('.lnk') && entry.toLowerCase().includes(fileNameNoExt)) {
            try {
              await fs.promises.unlink(path.join(recentPath, entry));
            } catch {
              // best-effort cleanup
            }
          }
        }
        cleaned.push('Recent Files (.lnk)');
      }
    } catch {
      // Non-fatal
    }

    // Step 2: Non-blocking Explorer RecentDocs MRU Registry clean
    try {
      await execFileAsync('reg.exe', [
        'delete',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs',
        '/f'
      ], { timeout: 3000, windowsHide: true });
      cleaned.push('Explorer MRU Cache');
    } catch {
      // Non-fatal
    }

    return cleaned;
  }
}

