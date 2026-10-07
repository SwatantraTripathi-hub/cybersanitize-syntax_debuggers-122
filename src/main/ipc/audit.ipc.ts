import { ipcMain, dialog } from 'electron';
import { AuditService } from '../services/auditService';
import {
  assertNonNegativeInteger,
  assertSafeText,
  assertCaseId
} from '../security/inputGuard';

export function registerAuditIpc(auditService: AuditService = AuditService.getInstance()): void {
  ipcMain.handle('audit:get-logs', async (_, rawLimit?: unknown, rawOffset?: unknown, filter?: any) => {
    const limit = rawLimit !== undefined && rawLimit !== null
      ? Math.min(10_000, assertNonNegativeInteger(rawLimit, 'limit'))
      : 50;
    const offset = rawOffset !== undefined && rawOffset !== null
      ? assertNonNegativeInteger(rawOffset, 'offset')
      : 0;

    return await auditService.getLogs(limit, offset, filter);
  });

  ipcMain.handle('audit:get-stats', async (_, rawCaseId?: unknown) => {
    const caseId = rawCaseId && typeof rawCaseId === 'string' && rawCaseId.trim().length > 0
      ? assertCaseId(rawCaseId.trim())
      : undefined;
    return await auditService.getStats(caseId);
  });

  ipcMain.handle('audit:clear-logs', async () => {
    return await auditService.clearLogs();
  });

  ipcMain.handle('audit:export-csv', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Cryptographic Audit Trail (CSV)',
      defaultPath: `Audit_Ledger_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Export canceled' };
    }

    return await auditService.exportCsv(filePath);
  });

  ipcMain.handle('audit:verify-chain', async () => {
    return await auditService.verifyChain();
  });

  ipcMain.handle('audit:repair-chain', async () => {
    return await auditService.repairChain();
  });

  ipcMain.handle('audit:export-bundle', async (_, rawCaseId?: unknown) => {
    const caseId = rawCaseId && typeof rawCaseId === 'string' && rawCaseId.trim().length > 0
      ? assertCaseId(rawCaseId.trim())
      : undefined;

    const safeCase = (caseId || 'ALL').replace(/[^a-zA-Z0-9_-]/g, '_');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Sealed Forensic Evidence Bundle',
      defaultPath: `Evidence_Bundle_${safeCase}_${new Date().toISOString().slice(0, 10)}.forensic`,
      filters: [
        { name: 'Forensic Evidence Bundle', extensions: ['forensic'] },
        { name: 'CyberSanitize Evidence Container', extensions: ['csev'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Export canceled' };
    }

    return await auditService.exportBundle(caseId, filePath);
  });

  ipcMain.handle('audit:import-verify-bundle', async (_, rawBundlePath?: unknown) => {
    let targetPath: string | undefined;

    if (rawBundlePath && typeof rawBundlePath === 'string' && rawBundlePath.trim().length > 0) {
      targetPath = assertSafeText(rawBundlePath.trim(), 'bundlePath', 4096);
    } else {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import & Verify Forensic Evidence Bundle',
        filters: [
          { name: 'Forensic Evidence Bundle', extensions: ['forensic', 'csev'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (canceled || filePaths.length === 0) {
        return { success: false, message: 'No file selected' };
      }
      targetPath = filePaths[0];
    }

    return await auditService.verifyBundle(targetPath);
  });

  ipcMain.handle('audit:get-public-key', () => {
    return auditService.getPublicKey();
  });
}

