import { ipcMain, BrowserWindow, dialog } from 'electron';
import { FileEraseService } from '../services/fileEraseService';
import { assertSafeText, assertString } from '../security/inputGuard';
import { SecurityError } from '../types/errors';

export function registerFileEraseIpc(
  mainWindow?: BrowserWindow | null,
  fileEraseService: FileEraseService = FileEraseService.getInstance()
): void {
  fileEraseService.on('progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-erase:progress', progress);
    }
  });

  ipcMain.handle('file-erase:files', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return [];
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Target Files for Forensic Shredding',
      properties: ['openFile', 'multiSelections']
    });
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle('file-erase:folder', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return [];
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Target Directory for Forensic Sanitization',
      properties: ['openDirectory']
    });
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle('file-erase:start', async (_, rawPaths: unknown, rawStandard?: unknown, caseMeta?: any) => {
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
      throw new SecurityError('INPUT_INVALID', 'paths must be a non-empty array of file paths');
    }

    const validatedPaths: string[] = [];
    for (let i = 0; i < rawPaths.length; i++) {
      const p = assertSafeText(rawPaths[i], `paths[${i}]`, 4096);
      validatedPaths.push(p);
    }

    const standard = rawStandard ? assertString(rawStandard, 'standard', 64) : 'nist-clear';
    return await fileEraseService.startFileErase(validatedPaths, standard, caseMeta);
  });
}

