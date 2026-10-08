import { ipcMain, BrowserWindow } from 'electron';
import { WriteBlockerService } from '../modules/recovery/writeBlocker';
import { AuditService } from '../services/auditService';

export function registerWriteBlockerIpc(_mainWindow: BrowserWindow, auditService: AuditService) {
  // 1. Verify write protection for a specific drive or partition
  ipcMain.handle('writeblocker:verify', async (_, drivePath: string, caseMeta?: any) => {
    console.log(`[IPC WriteBlocker] Running forensic verification on: ${drivePath}`);
    const result = await WriteBlockerService.verifyWriteProtection(drivePath);

    // Record verification into immutable audit ledger
    if (auditService) {
      const operatorId = caseMeta?.operatorId || 'EXAMINER-101';
      const caseId = caseMeta?.caseId || 'CASE-2026-0842';
      const caseTitle = caseMeta?.caseTitle || caseMeta?.title || 'Forensic Evidence Write-Blocker Integrity Attestation';
      const evidenceTag = caseMeta?.evidenceTag || caseMeta?.tagId || 'EVD-PRIMARY-01';

      try {
        const auditId = auditService.logOperation({
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
            operatorId,
            caseTitle,
            evidenceTag
          },
          status: 'COMPLETED',
          operator: operatorId,
          hash_before: null,
          hash_after: result.verificationToken,
          verification_result: {
            isWriteProtected: result.isWriteProtected,
            token: result.verificationToken,
            method: result.enforcementMethod
          }
        });

        auditService.updateOperation(auditId, {
          status: 'VERIFIED',
          hash_after: result.verificationToken
        });
      } catch (err) {
        console.warn('[IPC WriteBlocker] Could not record verification audit event:', err);
      }
    }

    return result;
  });

  // 2. Get current status without recording new audit log
  ipcMain.handle('writeblocker:get-status', async (_, drivePath?: string) => {
    return await WriteBlockerService.verifyWriteProtection(drivePath || '');
  });

  // 3. Protect a specific drive/partition
  ipcMain.handle('writeblocker:protect', (_, drivePath: string) => {
    WriteBlockerService.protectDrive(drivePath);
    return { success: true, protectedDrives: WriteBlockerService.getProtectedDrives() };
  });

  // 4. Unprotect a drive/partition
  ipcMain.handle('writeblocker:unprotect', (_, drivePath: string) => {
    WriteBlockerService.unprotectDrive(drivePath);
    return { success: true, protectedDrives: WriteBlockerService.getProtectedDrives() };
  });

  // 5. Get list of all protected drives
  ipcMain.handle('writeblocker:get-protected-drives', () => {
    return WriteBlockerService.getProtectedDrives();
  });

  // 6. Toggle Windows OS StorageDevicePolicies registry policy
  ipcMain.handle('writeblocker:set-system-policy', async (_, enable: boolean) => {
    console.log(`[IPC WriteBlocker] Toggling Windows StorageDevicePolicies WriteProtect to: ${enable}`);
    return await WriteBlockerService.setSystemPolicy(enable);
  });

  // 7. Toggle physical disk attribute to READONLY
  ipcMain.handle('writeblocker:set-disk-readonly', async (_, diskNumber: number, enable: boolean) => {
    console.log(`[IPC WriteBlocker] Toggling PhysicalDisk ${diskNumber} IsReadOnly to: ${enable}`);
    return await WriteBlockerService.setDiskReadOnly(diskNumber, enable);
  });
}
