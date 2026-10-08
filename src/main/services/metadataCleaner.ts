import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class MetadataCleaner {
  async cleanMetadataTraces(filePath: string): Promise<string[]> {
    if (process.platform !== 'win32') return [];
    
    const cleaned: string[] = [];
    const fileName = path.basename(filePath);
    const fileNameNoExt = path.parse(fileName).name.toLowerCase();
    
    // Step 1: Fast native deletion of Recent shortcut files (.lnk)
    try {
      const recentPath = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
      if (fs.existsSync(recentPath)) {
        const entries = await fs.promises.readdir(recentPath);
        for (const entry of entries) {
          if (entry.toLowerCase().endsWith('.lnk') && entry.toLowerCase().includes(fileNameNoExt)) {
            try {
              await fs.promises.unlink(path.join(recentPath, entry));
            } catch (_) {}
          }
        }
        cleaned.push('Recent Files (.lnk)');
      }
    } catch (e) {
      console.warn('[MetadataCleaner] Recent files cleanup warning:', e);
    }
    
    // Step 2: Non-blocking Explorer RecentDocs MRU Registry clean
    try {
      const regCmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs" /f`;
      await execAsync(regCmd, { timeout: 3000, windowsHide: true }).catch(() => {});
      cleaned.push('Explorer MRU Cache');
    } catch (_) {}

    return cleaned;
  }
}
