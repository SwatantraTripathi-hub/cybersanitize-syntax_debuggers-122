import { ipcMain, BrowserWindow } from 'electron';
import { WipeService, WipeOptions } from '../services/wipeService';
import {
  assertSafeText,
  assertString,
  assertPositiveInteger
} from '../security/inputGuard';

export function registerWipeIpc(
  mainWindow?: BrowserWindow | null,
  wipeService: WipeService = WipeService.getInstance()
): void {
  // Relay progress events to renderer without raw data buffers
  wipeService.on('progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('wipe:progress', progress);
    }
  });

  ipcMain.handle('wipe:get-standards', () => {
    return wipeService.getStandards();
  });

  ipcMain.handle('wipe:start', async (_, targetPath: unknown, standard: unknown, options?: unknown) => {
    const validTarget = assertSafeText(targetPath, 'targetPath', 4096);
    const validStandard = assertString(standard, 'standard', 64);

    const safeOptions: WipeOptions = {};
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      const opts = options as Record<string, unknown>;
      if (typeof opts.dryRun === 'boolean') safeOptions.dryRun = opts.dryRun;
      if (typeof opts.verify === 'boolean') safeOptions.verify = opts.verify;
      if (typeof opts.blockSize === 'number' && Number.isSafeInteger(opts.blockSize) && opts.blockSize > 0) {
        safeOptions.blockSize = opts.blockSize;
      }
      if (typeof opts.size === 'number' && Number.isSafeInteger(opts.size) && opts.size > 0) {
        safeOptions.size = opts.size;
      }
      if (opts.caseMeta && typeof opts.caseMeta === 'object') {
        safeOptions.caseMeta = opts.caseMeta as any;
      }
    }

    return await wipeService.startWipe(validTarget, validStandard, safeOptions);
  });

  ipcMain.handle('wipe:entropy-snapshot', async (_, targetPath: unknown) => {
    const validTarget = assertSafeText(targetPath, 'targetPath', 4096);
    return await wipeService.getEntropySnapshot(validTarget);
  });

  ipcMain.handle('wipe:create-test-image', async (_, sizeMB: unknown) => {
    const mb = assertPositiveInteger(sizeMB, 'sizeMB');
    return await wipeService.createTestImage(mb);
  });
}

