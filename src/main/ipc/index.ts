import { app, BrowserWindow, ipcMain } from 'electron';
import { registerDriveIpc } from './drive.ipc';
import { registerWriteBlockerIpc } from './writeBlocker.ipc';
import { registerWipeIpc } from './wipe.ipc';
import { registerFileEraseIpc } from './fileErase.ipc';
import { registerCarveIpc } from './carve.ipc';
import { registerAuditIpc } from './audit.ipc';
import { registerReportIpc } from './report.ipc';

export * from './drive.ipc';
export * from './writeBlocker.ipc';
export * from './wipe.ipc';
export * from './fileErase.ipc';
export * from './carve.ipc';
export * from './audit.ipc';
export * from './report.ipc';

export function registerAllIpc(mainWindow?: BrowserWindow | null): void {
  // App utility
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  registerDriveIpc();
  registerWriteBlockerIpc();
  registerWipeIpc(mainWindow);
  registerFileEraseIpc(mainWindow);
  registerCarveIpc(mainWindow);
  registerAuditIpc();
  registerReportIpc();
}

