import { ipcMain, BrowserWindow, dialog } from 'electron';
import { CarvingEngine, SIGNATURES, detectPriorWipeAttempt } from '../engines/carvingEngine';
import { AuditService } from '../services/auditService';

export function registerCarveIpc(mainWindow: BrowserWindow, auditService: AuditService) {
  const engine = new CarvingEngine();

  engine.on('progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('carve:progress', data);
    }
  });

  ipcMain.handle('carve:select-source', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Evidence Disk Image (ISO/IEC 27037)',
      properties: ['openFile'],
      filters: [
        { name: 'Forensic Disk Images (*.dd, *.raw, *.img, *.iso)', extensions: ['dd', 'raw', 'img', 'iso'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });
    if (canceled) return null;
    return filePaths[0];
  });
  
  ipcMain.handle('carve:get-signatures', () => {
    return SIGNATURES.map(s => ({
      name: s.name,
      category: s.category,
      extensions: s.extensions,
      maxSize: s.maxSize
    }));
  });

  ipcMain.handle('carve:start', async (_, imagePath: string, outputDir: string, fileTypes: string[], size?: number, caseMeta?: any) => {
    const operatorId = caseMeta?.operatorId || 'EXAMINER-101';
    const caseId = caseMeta?.caseId || 'CASE-2026-0842';
    const caseTitle = caseMeta?.caseTitle || caseMeta?.title || 'Triple-Tier Deep File Carving & Evidence Acquisition';
    const evidenceTag = caseMeta?.evidenceTag || caseMeta?.tagId || 'EVD-PRIMARY-01';

    const auditId = auditService.logOperation({
      timestamp: new Date().toISOString(),
      operation: 'FILE_RECOVERY',
      target: imagePath,
      details: { outputDir, fileTypes, size, caseId, operatorId, caseTitle, evidenceTag },
      status: 'IN_PROGRESS',
      operator: operatorId,
      hash_before: null,
      hash_after: null,
      verification_result: null
    });

    try {
      const result = await engine.carveFromImage(imagePath, outputDir, fileTypes, size);
      
      auditService.updateOperation(auditId, {
        status: 'COMPLETED',
        details: { 
          outputDir, 
          fileTypes, 
          filesFound: result.filesFound.length, 
          totalBytesScanned: result.totalBytesScanned,
          durationMs: result.durationMs,
          caseId,
          operatorId,
          caseTitle,
          evidenceTag,
          recoveredSamples: result.filesFound.map(f => ({ name: f.name, type: f.type, sha256: f.sha256, confidence: f.confidence }))
        }
      });
      
      return result;
    } catch (error: any) {
      console.error('[IPC Carve] Carving error:', error);
      auditService.updateOperation(auditId, {
        status: 'FAILED',
        details: { error: error.message, caseId, operatorId }
      });
      throw error;
    }
  });

  ipcMain.handle('carve:detect-anti-forensics', async (_, imagePath: string) => {
    try {
      return await detectPriorWipeAttempt(imagePath);
    } catch (e: any) {
      return { detected: false, type: 'none', confidence: 0, details: e.message };
    }
  });
}
