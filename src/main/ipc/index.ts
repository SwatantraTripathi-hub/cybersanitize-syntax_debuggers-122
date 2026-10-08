import { app, BrowserWindow, ipcMain } from 'electron';
import { registerDriveIpc } from './drive.ipc';
import { registerWriteBlockerIpc } from './writeBlocker.ipc';
import { registerWipeIpc } from './wipe.ipc';
import { registerFileEraseIpc } from './fileErase.ipc';
import { registerCarveIpc } from './carve.ipc';
import { registerAuditIpc } from './audit.ipc';
import { registerReportIpc } from './report.ipc';
import { registerFleetIpc } from './fleet.ipc';
import { AuditService } from '../services/auditService';

export * from './drive.ipc';
export * from './writeBlocker.ipc';
export * from './wipe.ipc';
export * from './fileErase.ipc';
export * from './carve.ipc';
export * from './audit.ipc';
export * from './report.ipc';
export * from './fleet.ipc';

let globalAuditService: AuditService | null = null;

export function getAuditService(): AuditService {
  if (!globalAuditService) {
    try {
      globalAuditService = new AuditService();
    } catch (e) {
      console.warn('[IPC Index] Fallback to in-memory audit service:', e);
      globalAuditService = new AuditService(':memory:');
    }
  }
  return globalAuditService;
}

export function registerAllIpc(mainWindow?: BrowserWindow | null): void {
  const auditService = getAuditService();

  // App utility
  try {
    ipcMain.removeHandler('app:get-version');
  } catch (_) {}
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  registerDriveIpc();
  if (mainWindow) {
    registerWriteBlockerIpc(mainWindow, auditService);
    registerWipeIpc(mainWindow, auditService);
    registerFileEraseIpc(mainWindow, auditService);
    registerCarveIpc(mainWindow, auditService);
    registerFleetIpc(mainWindow, auditService);
  }
  registerAuditIpc(auditService);
  registerReportIpc(auditService);
}
