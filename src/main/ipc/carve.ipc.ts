import { ipcMain, BrowserWindow, dialog } from 'electron';
import { CarveService } from '../services/carveService';
import { assertSafeText, assertString } from '../security/inputGuard';

export function registerCarveIpc(
  mainWindow?: BrowserWindow | null,
  carveService: CarveService = CarveService.getInstance()
): void {
  carveService.on('progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('carve:progress', progress);
    }
  });

  ipcMain.handle('carve:select-source', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Evidence Disk Image (ISO/IEC 27037)',
      properties: ['openFile'],
      filters: [
        { name: 'Forensic Disk Images (*.dd, *.raw, *.img, *.iso)', extensions: ['dd', 'raw', 'img', 'iso'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('carve:get-signatures', () => {
    return carveService.getSignatures();
  });

  ipcMain.handle(
    'carve:start',
    async (_, sourcePath: unknown, outputDir: unknown, fileTypes: unknown, size?: unknown, caseMeta?: any) => {
      const validSource = assertSafeText(sourcePath, 'sourcePath', 4096);
      const validOutputDir = assertSafeText(outputDir, 'outputDir', 4096);

      const validTypes: string[] = [];
      if (Array.isArray(fileTypes)) {
        for (let i = 0; i < fileTypes.length; i++) {
          validTypes.push(assertString(fileTypes[i], `fileTypes[${i}]`, 32));
        }
      }

      let validSize: number | undefined;
      if (typeof size === 'number' && Number.isSafeInteger(size) && size > 0) {
        validSize = size;
      }

      return await carveService.startCarving(validSource, validOutputDir, validTypes, validSize, caseMeta);
    }
  );

  ipcMain.handle('carve:detect-anti-forensics', async (_, imagePath: unknown) => {
    const validPath = assertSafeText(imagePath, 'imagePath', 4096);
    return await carveService.detectAntiForensics(validPath);
  });
}

