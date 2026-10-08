import { ipcMain, dialog } from 'electron';
import { AuditService } from '../services/auditService';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export function registerAuditIpc(auditService: AuditService) {
  ipcMain.handle('audit:get-logs', (_, limit: number, offset: number, filter?: any) => {
    return auditService.getOperations(limit, offset, filter);
  });

  ipcMain.handle('audit:get-stats', (_, caseId?: string) => {
    return auditService.getStats(caseId);
  });

  ipcMain.handle('audit:clear-logs', () => {
    auditService.clearLogs();
    return { success: true };
  });

  ipcMain.handle('audit:export-csv', async (_, caseId?: string) => {
    const logs = auditService.getOperations(10000, 0, caseId ? { caseId } : undefined);
    if (logs.length === 0) return { success: false, message: 'No logs to export' };

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Cryptographic Audit Trail (CSV)',
      defaultPath: `Audit_Ledger_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { success: false, message: 'Export canceled' };

    const csv = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const header = 'ID,Timestamp,Operation,Target,Status,Operator,Hash_Before,Hash_After,Prev_Hash,Entry_Hash,Ed25519_Signature\n';
    const rows = logs.map(l => [
      l.id,
      l.timestamp,
      l.operation,
      l.target,
      l.status,
      l.operator,
      l.hash_before,
      l.hash_after,
      (l as any).prev_hash,
      (l as any).entry_hash,
      (l as any).signature
    ].map(csv).join(',')).join('\n');

    fs.writeFileSync(filePath, header + rows, 'utf8');
    return { success: true, filePath };
  });

  ipcMain.handle('audit:export-chain', async (_, caseId?: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Signed Audit Chain',
      defaultPath: `Audit_Chain_${(caseId || 'ALL').replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.cschain`,
      filters: [{ name: 'CyberSanitize Chain Export', extensions: ['cschain', 'json'] }]
    });
    if (canceled || !filePath) return { success: false, message: 'Export canceled' };
    return auditService.exportChain(filePath, caseId);
  });

  ipcMain.handle('audit:verify-chain-file', async (_, chainPath?: string) => {
    let targetPath = chainPath;
    if (!targetPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Verify Signed Audit Chain',
        filters: [{ name: 'CyberSanitize Chain Export', extensions: ['cschain', 'json'] }, { name: 'All Files', extensions: ['*'] }],
        properties: ['openFile']
      });
      if (canceled || filePaths.length === 0) return { isValid: false, errors: ['No chain export selected.'] };
      targetPath = filePaths[0];
    }
    return auditService.verifyChainExport(targetPath);
  });

  ipcMain.handle('audit:verify-chain', async () => {
    return auditService.verifyLedgerIntegrity();
  });

  ipcMain.handle('audit:repair-chain', async () => {
    return auditService.repairChain();
  });

  ipcMain.handle('audit:export-bundle', async (_, caseId?: string) => {
    const reportsDir = path.join(app.getPath('userData'), 'reports');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Sealed Forensic Evidence Bundle',
      defaultPath: `Evidence_Bundle_${(caseId || 'ALL').replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.forensic`,
      filters: [
        { name: 'Forensic Evidence Bundle', extensions: ['forensic'] },
        { name: 'CyberSanitize Evidence Container', extensions: ['csev'] }
      ]
    });
    if (canceled || !filePath) return { success: false, message: 'Export canceled' };

    try {
      const { bundlePath, manifestHash } = await auditService.exportForensicBundle(caseId, reportsDir);
      // Copy generated bundle to user-chosen path
      fs.copyFileSync(bundlePath, filePath);
      try { fs.unlinkSync(bundlePath); } catch (_) {}
      return { success: true, filePath, manifestHash };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  });

  ipcMain.handle('audit:import-verify-bundle', async (_, bundlePath?: string) => {
    let targetPath = bundlePath;
    if (!targetPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import & Verify Forensic Evidence Bundle',
        filters: [
          { name: 'Forensic Evidence Bundle', extensions: ['forensic', 'csev'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (canceled || filePaths.length === 0) return { success: false, message: 'No file selected' };
      targetPath = filePaths[0];
    }
    try {
      const result = await auditService.verifyForensicBundle(targetPath);
      return { success: true, ...result };
    } catch (e: any) {
      return { success: false, isValid: false, errors: [e.message] };
    }
  });

  ipcMain.handle('audit:get-public-key', () => {
    return auditService.getPublicKey();
  });
}
