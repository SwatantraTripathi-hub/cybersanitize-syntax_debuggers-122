import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import { WipeEngine, WipeOptions, WipeStandard, quickEntropySnapshot } from '../engines/wipeEngine';
import { AuditService } from '../services/auditService';
import { WriteBlockerService } from '../modules/recovery/writeBlocker';
import * as fs from 'fs';
import * as crypto from 'crypto';

export function registerWipeIpc(mainWindow: BrowserWindow, auditService: AuditService) {
  const engine = new WipeEngine();

  engine.on('progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('wipe:progress', data);
    }
  });

  ipcMain.handle('wipe:get-standards', () => {
    return [
      { 
        id: 'nist-fast', 
        name: 'Fast Overwrite (Headers & Tables)', 
        passes: 1, 
        description: 'Clears partition tables, allocation records, and index structures quickly.', 
        patterns: ['crypto-meta-purge'] 
      },
      { 
        id: 'nist-clear', 
        name: 'Zero Fill (Single Pass)', 
        passes: 1, 
        description: 'Overwrites all storage sectors with zeros (0x00). Verified by entropy scan.', 
        patterns: ['0x00'] 
      },
      { 
        id: 'nist-purge', 
        name: 'Random Overwrite (Secure)', 
        passes: 1, 
        description: 'Overwrites all storage sectors with cryptographic random noise.', 
        patterns: ['random'] 
      },
      { 
        id: 'nvme-crypto', 
        name: 'Hardware Crypto Erase (Fast)', 
        passes: 1, 
        description: 'Hardware-level encryption key reset for supported solid-state drives.', 
        patterns: ['AES-256 Key Purge'] 
      },
      { 
        id: 'dod-3', 
        name: '3-Pass Overwrite (Deep Clean)', 
        passes: 3, 
        description: 'Triple-pass sequence using zeros, ones, and pseudo-random noise.', 
        patterns: ['0x00', '0xFF', 'random'] 
      }
    ];
  });

  ipcMain.handle('wipe:start', async (_, targetPath: string, standard: WipeStandard, options: WipeOptions & { caseMeta?: any }) => {
    console.log(`[IPC Wipe] wipe:start called with target: ${targetPath}, standard: ${standard}`);
    // ISO/IEC 27037 Write-Blocker safety assertion
    if (options.caseMeta?.overrideWriteBlocker) {
      WriteBlockerService.unprotectDrive(targetPath);
      const volMatch = targetPath.match(/([a-zA-Z]):/);
      if (volMatch) {
        WriteBlockerService.unprotectDrive(`${volMatch[1].toUpperCase()}:`);
      }
      console.log(`[IPC Wipe] Examiner explicitly authorized write-blocker unprotect for target: ${targetPath}`);
    } else {
      WriteBlockerService.assertWriteAllowed(targetPath);
    }

    const operatorId = options.caseMeta?.operatorId || 'EXAMINER-101';
    const caseId = options.caseMeta?.caseId || 'CASE-2026-0842';
    const caseTitle = options.caseMeta?.caseTitle || options.caseMeta?.title || 'Certified Cryptographic Drive Sanitization';
    const evidenceTag = options.caseMeta?.evidenceTag || options.caseMeta?.tagId || 'EVD-PRIMARY-01';

    const auditId = auditService.logOperation({
      timestamp: new Date().toISOString(),
      operation: 'DRIVE_WIPE',
      target: targetPath,
      details: { standard, options, caseId, operatorId, caseTitle, evidenceTag },
      status: 'IN_PROGRESS',
      operator: operatorId,
      hash_before: null,
      hash_after: null,
      verification_result: null
    });

    try {
      const result = await engine.wipe(targetPath, standard, options);
      
      auditService.updateOperation(auditId, {
        status: result.verification?.passed ? 'VERIFIED' : 'COMPLETED',
        hash_before: result.preHash,
        hash_after: result.postHash,
        details: { 
          standard, 
          options, 
          passes: result.passes, 
          totalBytes: result.totalBytes,
          caseId,
          operatorId,
          caseTitle,
          evidenceTag,
          preHash: result.preHash,
          postHash: result.postHash
        },
        verification_result: result.verification
      });
      
      return result;
    } catch (error: any) {
      console.error(`[IPC Wipe] Wipe operation failed:`, error);
      auditService.updateOperation(auditId, {
        status: 'FAILED',
        details: { error: error.message, caseId, operatorId }
      });
      throw error;
    }
  });

  // Create test disk image for safe development/demo with both an image and a text file embedded
  ipcMain.handle('wipe:create-test-image', async (_, sizeMB: number) => {
    console.log(`[IPC Wipe] wipe:create-test-image called with sizeMB: ${sizeMB}`);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Create Test Evidence Disk Image',
      defaultPath: `evidence-test-media-${sizeMB}MB.dd`,
      filters: [{ name: 'Raw Forensic Disk Images (*.dd, *.raw, *.img)', extensions: ['dd', 'raw', 'img'] }]
    });

    if (canceled || !filePath) {
      return null;
    }

    const chunkSize = 1024 * 1024; // 1MB chunks
    const fd = fs.openSync(filePath, 'w');
    
    for (let i = 0; i < sizeMB; i++) {
      const chunk = crypto.randomBytes(chunkSize);

      // Sector 0: Embed an ACTIVE Allocated File (Present on storage prior to wipe)
      if (i === 0) {
        const activePdf = Buffer.from(
          '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
          '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
          '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
          '4 0 obj\n<< /Length 128 >>\nstream\nBT /F1 12 Tf 72 712 Td (CYBERSANITIZE ACTIVE EVIDENCE RECORD - ALLOCATED FILE PRIOR TO SANITIZATION) Tj ET\nendstream\nendobj\n' +
          'xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000210 00000 n \n' +
          'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n388\n%%EOF\n'
        );
        activePdf.copy(chunk, 0);
      }

      // Sector 1: Embed a DELETED JPEG image (Surviving in unallocated clusters)
      if (i === 1) {
        chunk[0] = 0xFF; chunk[1] = 0xD8; chunk[2] = 0xFF; chunk[3] = 0xE0;
        chunk[4] = 0x00; chunk[5] = 0x10; chunk[6] = 0x4A; chunk[7] = 0x46; // JFIF
        // Fake image payload
        chunk.fill(0x33, 8, 4096);
        chunk[4094] = 0xFF; chunk[4095] = 0xD9; // JPEG footer
      }

      // Sector 2: Embed a DELETED Text Document (Surviving in unallocated clusters)
      if (i === 2) {
        const textContent = 
`CONFIDENTIAL INVESTIGATION MEMO - CASE #CASE-2026-0842
DATE: 2026-09-13 | EXAMINER: EXAMINER-101 (National Cyber Forensic Directorate)
EVIDENCE ITEM: USB Flash Media Pen Drive (Seized Under Sec 65B IEA / Sec 63 BSA 2023)
STATUS: Deleted by target subject and cleared from Recycle Bin.
CONTENTS: This document verifies that the CyberSanitize Deep Carving Engine successfully recovered text fragments and image payloads from unallocated storage sectors.`;
        Buffer.from(textContent, 'utf8').copy(chunk, 1024);
      }

      // Sector 3: Embed a DELETED PNG image (Surviving in unallocated clusters)
      if (i === 3) {
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(chunk, 0); // PNG header
        chunk.fill(0x55, 8, 8192);
        Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]).copy(chunk, 8192); // IEND footer
      }

      fs.writeSync(fd, chunk, 0, chunkSize);
    }
    
    fs.closeSync(fd);
    console.log(`[IPC Wipe] Test evidence image created with embedded JPEG & Text at ${filePath}`);
    return filePath;
  });

  ipcMain.handle('wipe:entropy-snapshot', async (_, targetPath: string) => {
    try {
      return await quickEntropySnapshot(targetPath);
    } catch (e: any) {
      return { averageEntropy: 0, sampleCount: 0, riskPercentage: 0, riskLevel: 'LOW', details: e.message };
    }
  });
}
