import { ipcMain } from 'electron';
import { DriveService } from '../services/driveService';
import { assertBoolean } from '../security/inputGuard';

export function registerDriveIpc(driveService: DriveService = DriveService.getInstance()): void {
  ipcMain.handle('drive:detect', async (_, forceRefresh?: unknown) => {
    const shouldForce = forceRefresh !== undefined && forceRefresh !== null
      ? assertBoolean(forceRefresh, 'forceRefresh')
      : false;
    return await driveService.detectDrives(shouldForce);
  });

  ipcMain.handle('drive:get-info', async (_, query: unknown) => {
    if (typeof query === 'number') {
      if (!Number.isSafeInteger(query)) {
        return null;
      }
      return await driveService.getDriveInfo(query);
    }
    if (typeof query === 'string' && query.trim().length > 0 && query.trim().length <= 512) {
      return await driveService.getDriveInfo(query.trim());
    }
    return null;
  });
}

