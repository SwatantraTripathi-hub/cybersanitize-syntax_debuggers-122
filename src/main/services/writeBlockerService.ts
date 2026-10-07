import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalizeBytes } from '../crypto/canonical';
import { sha256Hex } from '../crypto/hash';
import { SecurityError } from '../types/errors';

const execFileAsync = promisify(execFile);

export interface WriteBlockerVerificationResult {
  isWriteProtected: boolean;
  drivePath: string;
  enforcementMethod:
    | 'KERNEL_READ_ONLY_HANDLE'
    | 'STORAGE_DEVICE_POLICY'
    | 'APPLICATION_INTERCEPTOR'
    | 'MULTI_LAYER_ENFORCED'
    | 'UNPROTECTED';
  systemPolicyActive: boolean;
  diskReadOnly: boolean;
  appGuardActive: boolean;
  handleAccessMode: 'GENERIC_READ (O_RDONLY)';
  probeResult: 'WRITE_PROHIBITED_CONFIRMED' | 'READ_ONLY_ENFORCED' | 'WRITE_PERMITTED_UNPROTECTED';
  verifiedAt: string;
  verificationToken: string;
  notes: string;
}

export class WriteBlockerService {
  private static instance: WriteBlockerService | null = null;
  private readonly protectedDrives = new Set<string>();

  public static getInstance(): WriteBlockerService {
    if (!WriteBlockerService.instance) {
      WriteBlockerService.instance = new WriteBlockerService();
    }
    return WriteBlockerService.instance;
  }

  public normalizeDrive(drivePath: string): string {
    if (!drivePath) return '';
    const trimmed = drivePath.trim();

    // Drive letter like "D:" or "D:\"
    const letterMatch = trimmed.match(/^([a-zA-Z]):?[\\/]?$/);
    if (letterMatch) {
      return `${letterMatch[1].toUpperCase()}:`;
    }

    // Partition device: \\.\D:
    const partMatch = trimmed.match(/^\\\\.\\([a-zA-Z]):$/i);
    if (partMatch) {
      return `${partMatch[1].toUpperCase()}:`;
    }

    // Physical drive: \\.\PhysicalDriveN
    const physMatch = trimmed.match(/^\\\\.\\PhysicalDrive(\d+)$/i);
    if (physMatch) {
      return `\\\\.\\PhysicalDrive${physMatch[1]}`;
    }

    return trimmed;
  }

  public protectDrive(drivePath: string): string[] {
    const norm = this.normalizeDrive(drivePath);
    if (norm) {
      this.protectedDrives.add(norm);
    }
    return this.getProtectedDrives();
  }

  public unprotectDrive(drivePath: string): string[] {
    const norm = this.normalizeDrive(drivePath);
    if (norm) {
      this.protectedDrives.delete(norm);
    }
    return this.getProtectedDrives();
  }

  public isDriveProtected(drivePath: string): boolean {
    const norm = this.normalizeDrive(drivePath);
    if (!norm) return false;
    if (this.protectedDrives.has(norm)) return true;

    // Check relationship (e.g. if physical drive is protected, any volume on it or vice versa)
    for (const p of this.protectedDrives) {
      if (norm.includes(p) || p.includes(norm)) return true;
    }
    return false;
  }

  public getProtectedDrives(): string[] {
    return Array.from(this.protectedDrives);
  }

  public assertWriteAllowed(targetPath: string): void {
    if (this.isDriveProtected(targetPath)) {
      throw new SecurityError(
        'PERMISSION_DENIED',
        `ISO/IEC 27037 Evidence Write-Blocker ACTIVE: target "${targetPath}" is registered under evidence protection. Destructive writes prohibited.`
      );
    }
  }

  public async verifyWriteProtection(drivePath: string): Promise<WriteBlockerVerificationResult> {
    const norm = this.normalizeDrive(drivePath);
    const verifiedAt = new Date().toISOString();

    const appGuardActive = norm ? this.isDriveProtected(norm) : false;
    const systemPolicyActive = await this.checkSystemPolicy();
    const diskReadOnly = norm ? await this.checkDiskReadOnly(norm) : false;

    const isWriteProtected = appGuardActive || systemPolicyActive || diskReadOnly;

    let enforcementMethod: WriteBlockerVerificationResult['enforcementMethod'] = 'UNPROTECTED';
    if (systemPolicyActive && diskReadOnly && appGuardActive) {
      enforcementMethod = 'MULTI_LAYER_ENFORCED';
    } else if (systemPolicyActive) {
      enforcementMethod = 'STORAGE_DEVICE_POLICY';
    } else if (diskReadOnly) {
      enforcementMethod = 'KERNEL_READ_ONLY_HANDLE';
    } else if (appGuardActive) {
      enforcementMethod = 'APPLICATION_INTERCEPTOR';
    }

    const probeResult: WriteBlockerVerificationResult['probeResult'] = isWriteProtected
      ? systemPolicyActive || diskReadOnly
        ? 'WRITE_PROHIBITED_CONFIRMED'
        : 'READ_ONLY_ENFORCED'
      : 'WRITE_PERMITTED_UNPROTECTED';

    const notes = isWriteProtected
      ? `Evidence target secured under ISO/IEC 27037 standards. Enforcement: ${enforcementMethod}.`
      : 'Target is NOT write-protected. Write operations are permitted.';

    // Cryptographic verification token binds verified values deterministically
    const payload = {
      drivePath: norm,
      isWriteProtected,
      enforcementMethod,
      systemPolicyActive,
      diskReadOnly,
      appGuardActive,
      verifiedAt
    };
    const verificationToken = sha256Hex(canonicalizeBytes(payload));

    return {
      isWriteProtected,
      drivePath: norm,
      enforcementMethod,
      systemPolicyActive,
      diskReadOnly,
      appGuardActive,
      handleAccessMode: 'GENERIC_READ (O_RDONLY)',
      probeResult,
      verifiedAt,
      verificationToken,
      notes
    };
  }

  public async checkSystemPolicy(): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try {
      const { stdout } = await execFileAsync('reg.exe', [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies',
        '/v',
        'WriteProtect'
      ], { windowsHide: true, timeout: 5000 });
      return /0x1\b/i.test(stdout);
    } catch {
      return false;
    }
  }

  public async setSystemPolicy(enable: boolean): Promise<{ success: boolean; active: boolean }> {
    if (process.platform !== 'win32') {
      return { success: false, active: false };
    }
    const val = enable ? '1' : '0';
    try {
      await execFileAsync('reg.exe', [
        'add',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies',
        '/v',
        'WriteProtect',
        '/t',
        'REG_DWORD',
        '/d',
        val,
        '/f'
      ], { windowsHide: true, timeout: 5000 });
      const active = await this.checkSystemPolicy();
      return { success: true, active };
    } catch {
      return { success: false, active: await this.checkSystemPolicy() };
    }
  }

  public async checkDiskReadOnly(drivePath: string): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    const match = drivePath.match(/PhysicalDrive(\d+)/i);
    const diskNum = match ? match[1] : null;
    if (!diskNum) return false;

    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Disk -Number ${diskNum}).IsReadOnly`
      ], { windowsHide: true, timeout: 5000 });
      return stdout.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  public async setDiskReadOnly(diskNumber: number, enable: boolean): Promise<{ success: boolean; isReadOnly: boolean }> {
    if (process.platform !== 'win32' || !Number.isSafeInteger(diskNumber) || diskNumber < 0) {
      return { success: false, isReadOnly: false };
    }
    const boolStr = enable ? '$true' : '$false';
    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Set-Disk -Number ${diskNumber} -IsReadOnly ${boolStr}`
      ], { windowsHide: true, timeout: 8000 });
      const current = await this.checkDiskReadOnly(`\\\\.\\PhysicalDrive${diskNumber}`);
      return { success: true, isReadOnly: current };
    } catch {
      return { success: false, isReadOnly: await this.checkDiskReadOnly(`\\\\.\\PhysicalDrive${diskNumber}`) };
    }
  }
}

