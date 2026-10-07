import { ipcMain } from 'electron';
import { WriteBlockerService } from '../services/writeBlockerService';
import { AuditService } from '../services/auditService';
import {
  assertBoolean,
  assertSafeText,
  assertNonNegativeInteger
} from '../security/inputGuard';

export function registerWriteBlockerIpc(
  writeBlockerService: WriteBlockerService = WriteBlockerService.getInstance(),
  auditService: AuditService = AuditService.getInstance()
): void {
  ipcMain.handle('writeblocker:verify', async (_, drivePath: unknown, caseMeta?: any) => {
    const validPath = assertSafeText(drivePath, 'drivePath', 512);
    const result = await writeBlockerService.verifyWriteProtection(validPath);

    // Record verification event into immutable audit ledger
    const operatorId = caseMeta?.operatorId || 'EXAMINER-101';
    const caseId = caseMeta?.caseId || 'CASE-GENERAL';

    await auditService.recordOperation({
      case_id: caseId,
      timestamp: result.verifiedAt,
      operation: 'WRITE_BLOCKER_VERIFIED',
      target: result.drivePath,
      details: {
        verificationToken: result.verificationToken,
        enforcementMethod: result.enforcementMethod,
        systemPolicyActive: result.systemPolicyActive,
        diskReadOnly: result.diskReadOnly,
        appGuardActive: result.appGuardActive,
        probeResult: result.probeResult,
        notes: result.notes,
        caseId,
        operatorId
      },
      status: result.isWriteProtected ? 'VERIFIED' : 'COMPLETED',
      operator: operatorId,
      hash_before: null,
      hash_after: result.verificationToken,
      verification_result: {
        isWriteProtected: result.isWriteProtected,
        token: result.verificationToken,
        method: result.enforcementMethod
      }
    });

    return result;
  });

  ipcMain.handle('writeblocker:get-status', async (_, drivePath?: unknown) => {
    const validPath = drivePath ? assertSafeText(drivePath, 'drivePath', 512) : '';
    return await writeBlockerService.verifyWriteProtection(validPath);
  });

  ipcMain.handle('writeblocker:protect', (_, drivePath: unknown) => {
    const validPath = assertSafeText(drivePath, 'drivePath', 512);
    const protectedDrives = writeBlockerService.protectDrive(validPath);
    return { success: true, protectedDrives };
  });

  ipcMain.handle('writeblocker:unprotect', (_, drivePath: unknown) => {
    const validPath = assertSafeText(drivePath, 'drivePath', 512);
    const protectedDrives = writeBlockerService.unprotectDrive(validPath);
    return { success: true, protectedDrives };
  });

  ipcMain.handle('writeblocker:get-protected-drives', () => {
    return writeBlockerService.getProtectedDrives();
  });

  ipcMain.handle('writeblocker:set-system-policy', async (_, enable: unknown) => {
    const isEnabled = assertBoolean(enable, 'enable');
    return await writeBlockerService.setSystemPolicy(isEnabled);
  });

  ipcMain.handle('writeblocker:set-disk-readonly', async (_, diskNumber: unknown, enable: unknown) => {
    const disk = assertNonNegativeInteger(diskNumber, 'diskNumber');
    const isEnabled = assertBoolean(enable, 'enable');
    return await writeBlockerService.setDiskReadOnly(disk, isEnabled);
  });
}

