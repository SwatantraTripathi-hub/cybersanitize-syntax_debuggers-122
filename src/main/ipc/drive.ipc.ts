import { ipcMain } from 'electron';
import { DriveService } from '../services/driveService';

export function registerDriveIpc(driveService: DriveService = DriveService.getInstance()): void {
  ipcMain.handle('drive:detect', async (_, forceRefresh = false) => {
    return await driveService.detectDrives(Boolean(forceRefresh));
  });

  ipcMain.handle('drive:get-info', async (_, query: any) => {
    if (query === null || query === undefined) return null;
    return await driveService.getDriveInfo(query);
  });
}
