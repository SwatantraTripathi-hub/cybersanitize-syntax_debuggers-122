import { ipcMain, BrowserWindow, dialog } from 'electron';
import { FileEraseEngine } from '../engines/fileEraseEngine';
import { WipeStandard } from '../engines/wipeEngine';
import { AuditService } from '../services/auditService';
import { MetadataCleaner } from '../services/metadataCleaner';
import { WriteBlockerService } from '../modules/recovery/writeBlocker';

export function registerFileEraseIpc(mainWindow: BrowserWindow, auditService: AuditService) {
  const engine = new FileEraseEngine();
  const cleaner = new MetadataCleaner();

  engine.on('progress', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-erase:progress', data);
    }
  });

  ipcMain.handle('file-erase:files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Target Files for Forensic Shredding',
      properties: ['openFile', 'multiSelections']
    });
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle('file-erase:folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Target Directory for Forensic Sanitization',
      properties: ['openDirectory']
    });
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle('file-erase:start', async (_, paths: string[], standard: WipeStandard, caseMeta?: any) => {
    // Assert all target files are permitted for deletion
    for (const p of paths) {
      if (WriteBlockerService.isDriveProtected(p) && !caseMeta?.overrideWriteBlocker) {
        WriteBlockerService.assertWriteAllowed(p);
      }
    }

    const operatorId = caseMeta?.operatorId || 'EXAMINER-101';
    const caseId = caseMeta?.caseId || 'CASE-2026-0842';
    const caseTitle = caseMeta?.caseTitle || caseMeta?.title || 'Certified Targeted File Shredding & Trace Sanitization';
    const evidenceTag = caseMeta?.evidenceTag || caseMeta?.tagId || 'EVD-PRIMARY-01';

    const auditId = auditService.logOperation({
      timestamp: new Date().toISOString(),
      operation: 'FILE_ERASE',
      target: paths.join(', '),
      details: { standard, paths, caseId, operatorId, caseTitle, evidenceTag },
      status: 'IN_PROGRESS',
      operator: operatorId,
      hash_before: null,
      hash_after: null,
      verification_result: null
    });

    try {
      let totalProcessed = 0;
      let totalBytes = 0;
      const metadataCleaned: string[] = [];

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        try {
          const stats = require('fs').statSync(p);
          let res;
          if (stats.isDirectory()) {
            res = await engine.secureDeleteFolder(p, standard);
          } else {
            res = await engine.secureDeleteFile(p, standard);
          }
          totalProcessed += res.filesProcessed;
          totalBytes += res.totalBytes;
          
          if (caseMeta?.cleanMetadata !== false) {
            const cleaned = await cleaner.cleanMetadataTraces(p);
            metadataCleaned.push(...cleaned);
          }
        } catch (err: any) {
          console.error(`[FileEraseIPC] Error processing target ${p}:`, err.message);
          throw err;
        }
      }

      auditService.updateOperation(auditId, {
        status: 'COMPLETED',
        details: { 
          standard, 
          paths, 
          totalProcessed, 
          totalBytes, 
          metadataCleaned,
          caseId,
          operatorId,
          caseTitle,
          evidenceTag
        }
      });

      mainWindow.webContents.send('file-erase:progress', {
        percent: 100,
        percentage: 100,
        currentStep: 4,
        stepName: 'Forensic Shredding Complete',
        status: 'completed',
        filesProcessed: totalProcessed,
        totalFiles: paths.length,
        totalBytes
      });

      return { success: true, filesProcessed: totalProcessed, totalBytes, metadataCleaned };
    } catch (error: any) {
      auditService.updateOperation(auditId, {
        status: 'FAILED',
        details: { error: error.message, caseId, operatorId }
      });
      mainWindow.webContents.send('file-erase:progress', {
        status: 'failed',
        error: error.message
      });
      throw error;
    }
  });
}
