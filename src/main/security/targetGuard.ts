/**
 * Target authorization guard (backend-side, independent of UI and engines).
 *
 * Hard rules:
 *  - A filename can NEVER become a device. Only the exact Windows device
 *    syntax `\\.\PhysicalDriveN` classifies as PHYSICAL_DRIVE. There is no
 *    broad pattern, no fuzzy match and no dangerous fallback.
 *  - Missing, ambiguous or unclassifiable targets are explicit errors.
 *  - The running system volume / boot volume / OS disk is protected. There is
 *    NO override flag anywhere in this API - the destructive engine fails
 *    closed.
 *  - If system-disk mapping cannot be determined, PHYSICAL_DRIVE and VOLUME
 *    targets are denied as TARGET_PROTECTION_UNVERIFIABLE (fail closed).
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { SecurityError } from '../types/errors';
import { SecurityDecision, SecurityErrorCode } from '../types/security';
import { safeEcho } from './inputGuard';

const execFileAsync = promisify(execFile);

export type TargetKind =
  | 'REGULAR_FILE'
  | 'DISK_IMAGE'
  | 'VOLUME'
  | 'PARTITION'
  | 'PHYSICAL_DRIVE'
  | 'UNSUPPORTED';

export interface ClassifiedTarget {
  kind: TargetKind;
  raw: string;
  normalized: string;
  filePath?: string;
  extension?: string;
  volumeLetter?: string;
  diskNumber?: number;
  reason?: string;
}

export interface SystemInfoResolver {
  /** Letters of the running OS/boot volumes, or null when unknown. */
  getSystemVolumeLetters(): Promise<string[] | null>;
  /** Disk numbers containing system/boot partitions, or null when unknown. */
  getSystemDiskNumbers(): Promise<number[] | null>;
}

const DISK_IMAGE_EXTENSIONS = new Set([
  '.dd',
  '.img',
  '.raw',
  '.bin',
  '.iso',
  '.dmg',
  '.e01',
  '.ad1',
  '.vhd',
  '.vhdx'
]);

const PHYSICAL_PREFIX = '\\\\.\\PhysicalDrive';

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function classifyDeviceSyntax(text: string): ClassifiedTarget {
  const upper = text.toUpperCase();
  if (upper.startsWith(PHYSICAL_PREFIX.toUpperCase())) {
    const digits = text.slice(PHYSICAL_PREFIX.length);
    if (/^[0-9]{1,4}$/.test(digits)) {
      const diskNumber = Number.parseInt(digits, 10);
      if (!Number.isSafeInteger(diskNumber) || diskNumber < 0) {
        throw new SecurityError('TARGET_AMBIGUOUS', `ambiguous device target: ${safeEcho(text)}`);
      }
      return {
        kind: 'PHYSICAL_DRIVE',
        raw: text,
        normalized: `\\\\.\\PhysicalDrive${diskNumber}`,
        diskNumber
      };
    }
    // `\\.\PhysicalDrive` with a missing/malformed number: never guess.
    throw new SecurityError('TARGET_AMBIGUOUS', `ambiguous physical drive target: ${safeEcho(text)}`);
  }
  if (text.startsWith('\\\\.\\"')) {
    throw new SecurityError('TARGET_UNSUPPORTED', `unsupported device namespace: ${safeEcho(text)}`);
  }
  if (text.startsWith('\\\\.\\"') === false && text.startsWith('\\\\.\\')) {
    const letter = text.slice(4);
    if (/^[A-Za-z]:$/.test(letter)) {
      const upperLetter = letter[0].toUpperCase();
      return {
        kind: 'PARTITION',
        raw: text,
        normalized: `\\\\.\\${upperLetter}:`,
        volumeLetter: upperLetter
      };
    }
    throw new SecurityError('TARGET_UNSUPPORTED', `unsupported device path: ${safeEcho(text)}`);
  }
  if (text.startsWith('\\\\')) {
    throw new SecurityError(
      'TARGET_UNSUPPORTED',
      `UNC/long-path targets are not supported for destructive operations: ${safeEcho(text)}`
    );
  }
  throw new SecurityError('TARGET_UNSUPPORTED', `unclassifiable target: ${safeEcho(text)}`);
}

/**
 * Classifies a raw target string (device syntax or filesystem path).
 * Throws SecurityError for missing/ambiguous/unsupported targets.
 */
export async function classifyTarget(raw: unknown): Promise<ClassifiedTarget> {
  if (raw === null || raw === undefined) {
    throw new SecurityError('TARGET_MISSING', 'target is required');
  }
  if (typeof raw !== 'string') {
    throw new SecurityError('INPUT_INVALID', 'target must be a string');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SecurityError('TARGET_MISSING', 'target must not be empty');
  }
  if (trimmed.length > 4096) {
    throw new SecurityError('INPUT_TOO_LARGE', 'target exceeds 4096 characters');
  }
  if (hasControlChars(trimmed)) {
    throw new SecurityError('INPUT_INVALID', 'target contains control characters');
  }

  if (trimmed.startsWith('\\\\.\\')) {
    return classifyDeviceSyntax(trimmed);
  }

  if (trimmed.startsWith('\\\\')) {
    throw new SecurityError(
      'TARGET_UNSUPPORTED',
      `UNC/long-path targets are not supported for destructive operations: ${safeEcho(trimmed)}`
    );
  }

  if (/^[A-Za-z]:[\\/]?$/.test(trimmed)) {
    const letter = trimmed[0].toUpperCase();
    return { kind: 'VOLUME', raw: trimmed, normalized: `${letter}:`, volumeLetter: letter };
  }

  // Filesystem path: lstat so symlinks/reparse points are visible.
  const filePath = path.normalize(trimmed);
  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new SecurityError('TARGET_MISSING', `target does not exist: ${safeEcho(filePath)}`);
    }
    throw new SecurityError(
      'TARGET_UNSUPPORTED',
      `target cannot be accessed (${code ?? 'unknown error'}): ${safeEcho(filePath)}`
    );
  }

  if (stats.isSymbolicLink()) {
    throw new SecurityError('TARGET_UNSUPPORTED', 'symlink/reparse-point targets are rejected');
  }
  if (stats.isDirectory()) {
    throw new SecurityError('TARGET_UNSUPPORTED', 'directories are not valid wipe targets');
  }
  if (!stats.isFile()) {
    throw new SecurityError('TARGET_UNSUPPORTED', 'target is not a regular file');
  }

  const extension = path.extname(filePath).toLowerCase();
  const kind: TargetKind = DISK_IMAGE_EXTENSIONS.has(extension) ? 'DISK_IMAGE' : 'REGULAR_FILE';
  const resolved = path.resolve(filePath);
  return { kind, raw: trimmed, normalized: resolved, filePath: resolved, extension };
}

const SYSTEM_INFO_TTL_MS = 30_000;

/**
 * System-disk resolver for Windows. Uses fixed, static PowerShell commands
 * executed via execFile (no shell interpolation). Non-Windows platforms
 * return null (unknown) - which fails closed in the guard.
 */
export function createSystemInfoResolver(): SystemInfoResolver {
  let cachedLetters: { at: number; value: string[] | null } | null = null;
  let cachedDisks: { at: number; value: number[] | null } | null = null;
  let diskInflight: Promise<number[] | null> | null = null;

  async function runPowerShell(command: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 }
      );
      return (stdout ?? '').trim();
    } catch {
      return null;
    }
  }

  return {
    async getSystemVolumeLetters(): Promise<string[] | null> {
      if (process.platform !== 'win32') return null;
      if (cachedLetters && Date.now() - cachedLetters.at < SYSTEM_INFO_TTL_MS) return cachedLetters.value;

      const letters = new Set<string>();
      const envDrive = process.env.SystemDrive;
      if (envDrive && /^[A-Za-z]:$/.test(envDrive.trim())) {
        letters.add(envDrive.trim()[0].toUpperCase());
      }

      const out = await runPowerShell(
        "(Get-Partition | Where-Object { $_.IsBoot -or $_.IsSystem } | Where-Object { $_.DriveLetter } | Select-Object -ExpandProperty DriveLetter) -join ','"
      );
      if (out) {
        for (const part of out.split(',')) {
          const letter = part.trim().toUpperCase();
          if (/^[A-Z]$/.test(letter)) letters.add(letter);
        }
      }

      const value = letters.size > 0 ? Array.from(letters) : null;
      cachedLetters = { at: Date.now(), value };
      return value;
    },

    async getSystemDiskNumbers(): Promise<number[] | null> {
      if (process.platform !== 'win32') return null;
      if (cachedDisks && Date.now() - cachedDisks.at < SYSTEM_INFO_TTL_MS) return cachedDisks.value;
      if (diskInflight) return diskInflight;

      diskInflight = (async () => {
        const out = await runPowerShell(
          "(Get-Partition | Where-Object { $_.IsBoot -or $_.IsSystem } | Select-Object -ExpandProperty DiskNumber | Sort-Object -Unique) -join ','"
        );
        if (!out) {
          cachedDisks = { at: Date.now(), value: null };
          return null;
        }
        const numbers: number[] = [];
        for (const part of out.split(',')) {
          const n = Number.parseInt(part.trim(), 10);
          if (Number.isSafeInteger(n) && n >= 0) numbers.push(n);
        }
        const value = numbers.length > 0 ? Array.from(new Set(numbers)) : null;
        cachedDisks = { at: Date.now(), value };
        return value;
      })().finally(() => {
        diskInflight = null;
      });

      return diskInflight;
    }
  };
}

export interface AuthorizeTargetOptions {
  resolver?: SystemInfoResolver;
}

/**
 * Backend authorization for a destructive wipe/erase target.
 * Returns an explicit decision; never throws for untrusted input.
 * There is no override path for protected system targets.
 */
export async function authorizeDestructiveTarget(
  raw: unknown,
  options: AuthorizeTargetOptions = {}
): Promise<SecurityDecision<ClassifiedTarget>> {
  let target: ClassifiedTarget;
  try {
    target = await classifyTarget(raw);
  } catch (err) {
    if (err instanceof SecurityError) {
      return {
        allowed: false,
        code: err.code as SecurityErrorCode,
        message: err.message
      };
    }
    throw err;
  }

  if (target.kind === 'UNSUPPORTED') {
    return {
      allowed: false,
      code: 'TARGET_UNSUPPORTED',
      message: target.reason ?? 'target kind is not supported for destructive operations'
    };
  }

  const resolver = options.resolver ?? createSystemInfoResolver();

  if (target.kind === 'PHYSICAL_DRIVE') {
    let systemDisks: number[] | null;
    try {
      systemDisks = await resolver.getSystemDiskNumbers();
    } catch {
      systemDisks = null;
    }
    if (systemDisks === null) {
      return {
        allowed: false,
        code: 'TARGET_PROTECTION_UNVERIFIABLE',
        message:
          'cannot determine which disk holds the running operating system; refusing to authorize a physical drive wipe (fail closed)'
      };
    }
    if (target.diskNumber !== undefined && systemDisks.includes(target.diskNumber)) {
      return {
        allowed: false,
        code: 'TARGET_SYSTEM_PROTECTED',
        message: `PhysicalDrive${target.diskNumber} contains the running operating system and is protected`
      };
    }
    return { allowed: true, value: target };
  }

  if (target.kind === 'VOLUME' || target.kind === 'PARTITION') {
    let systemLetters: string[] | null;
    try {
      systemLetters = await resolver.getSystemVolumeLetters();
    } catch {
      systemLetters = null;
    }
    if (systemLetters === null) {
      return {
        allowed: false,
        code: 'TARGET_PROTECTION_UNVERIFIABLE',
        message:
          'cannot determine the running operating system volume; refusing to authorize a volume wipe (fail closed)'
      };
    }
    const letter = target.volumeLetter ?? '';
    if (systemLetters.includes(letter)) {
      return {
        allowed: false,
        code: 'TARGET_SYSTEM_PROTECTED',
        message: `volume ${letter}: is the running operating system volume and is protected`
      };
    }
    return { allowed: true, value: target };
  }

  // REGULAR_FILE / DISK_IMAGE: an ordinary file cannot be the running OS.
  return { allowed: true, value: target };
}
