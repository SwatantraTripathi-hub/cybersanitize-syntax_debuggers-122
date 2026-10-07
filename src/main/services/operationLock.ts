import * as path from 'node:path';
import { CyberSanitizeError } from '../types/errors';

export interface ActiveOperationInfo {
  id: string;
  target: string;
  normalizedTarget: string;
  type: string;
  startedAt: string;
}

export class OperationLockService {
  private static instance: OperationLockService | null = null;
  private readonly activeLocks = new Map<string, ActiveOperationInfo>();

  public static getInstance(): OperationLockService {
    if (!OperationLockService.instance) {
      OperationLockService.instance = new OperationLockService();
    }
    return OperationLockService.instance;
  }

  public normalizeTarget(target: string): string {
    if (!target) return '';
    const trimmed = target.trim();

    // Physical drive: \\.\PhysicalDrive0
    const physMatch = trimmed.match(/^\\\\.\\PhysicalDrive(\d+)$/i);
    if (physMatch) {
      return `PHYSICAL_DRIVE_${physMatch[1]}`;
    }

    // Partition device: \\.\D:
    const partMatch = trimmed.match(/^\\\\.\\([a-zA-Z]):$/i);
    if (partMatch) {
      return `VOLUME_${partMatch[1].toUpperCase()}`;
    }

    // Volume root: D: or D:\ or D:/
    const volMatch = trimmed.match(/^([a-zA-Z]):[\\/]?$/i);
    if (volMatch) {
      return `VOLUME_${volMatch[1].toUpperCase()}`;
    }

    // Regular filesystem path
    try {
      return path.resolve(trimmed).toLowerCase();
    } catch {
      return trimmed.toLowerCase();
    }
  }

  public isLocked(target: string): boolean {
    const norm = this.normalizeTarget(target);
    return this.activeLocks.has(norm);
  }

  public acquireLock(target: string, operationType: string): { release: () => void } {
    const norm = this.normalizeTarget(target);
    if (this.activeLocks.has(norm)) {
      const active = this.activeLocks.get(norm)!;
      throw new CyberSanitizeError(
        'PERSISTENCE_BUSY',
        `Target "${target}" is busy: an active ${active.type} operation started at ${active.startedAt}`
      );
    }

    const lockInfo: ActiveOperationInfo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      target,
      normalizedTarget: norm,
      type: operationType,
      startedAt: new Date().toISOString()
    };

    this.activeLocks.set(norm, lockInfo);

    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          this.activeLocks.delete(norm);
        }
      }
    };
  }

  public getActiveLocks(): ActiveOperationInfo[] {
    return Array.from(this.activeLocks.values());
  }

  public clearAllLocks(): void {
    this.activeLocks.clear();
  }
}

