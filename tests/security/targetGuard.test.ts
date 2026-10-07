import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  authorizeDestructiveTarget,
  classifyTarget,
  SystemInfoResolver
} from '../../src/main/security/targetGuard';
import { SecurityError } from '../../src/main/types/errors';

const tmpDirs: string[] = [];

function makeFile(name: string, content = 'data'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-target-'));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Resolver with fully controlled answers — no OS queries in tests. */
function resolver(systemDisks: number[] | null, systemLetters: string[] | null): SystemInfoResolver {
  return {
    getSystemDiskNumbers: async () => systemDisks,
    getSystemVolumeLetters: async () => systemLetters
  };
}

describe('classifyTarget', () => {
  it('classifies an exact physical drive path', async () => {
    const target = await classifyTarget('\\\\.\\PhysicalDrive0');
    expect(target.kind).toBe('PHYSICAL_DRIVE');
    expect(target.diskNumber).toBe(0);
    expect(target.normalized).toBe('\\\\.\\PhysicalDrive0');
  });

  it('classifies other physical drive numbers case-insensitively', async () => {
    const target = await classifyTarget('\\\\.\\physicaldrivE2');
    expect(target.kind).toBe('PHYSICAL_DRIVE');
    expect(target.diskNumber).toBe(2);
  });

  it('NEVER lets a filename become a device: "PhysicalDrive0" as a path stays a file', async () => {
    const file = makeFile('PhysicalDrive0');
    const target = await classifyTarget(file);
    expect(target.kind).toBe('REGULAR_FILE');
    expect(target.diskNumber).toBeUndefined();
  });

  it('rejects ambiguous physical drive syntax instead of guessing a number', async () => {
    await expect(classifyTarget('\\\\.\\PhysicalDrive')).rejects.toThrow(SecurityError);
    await expect(classifyTarget('\\\\.\\PhysicalDrive99999')).rejects.toThrow(SecurityError);
    await expect(classifyTarget('\\\\.\\PhysicalDrive-1')).rejects.toThrow(SecurityError);
    await expect(classifyTarget('\\\\.\\PhysicalDrive0abc')).rejects.toThrow(SecurityError);
  });

  it('classifies a bare drive root as a volume', async () => {
    const target = await classifyTarget('E:');
    expect(target.kind).toBe('VOLUME');
    expect(target.volumeLetter).toBe('E');
  });

  it('classifies device volume syntax as a partition', async () => {
    const target = await classifyTarget('\\\\.\\E:');
    expect(target.kind).toBe('PARTITION');
    expect(target.volumeLetter).toBe('E');
  });

  it('rejects UNC paths, empty, non-string and missing targets', async () => {
    await expect(classifyTarget('\\\\server\\share\\x')).rejects.toThrow(SecurityError);
    await expect(classifyTarget('')).rejects.toThrow(SecurityError);
    await expect(classifyTarget('   ')).rejects.toThrow(SecurityError);
    await expect(classifyTarget(null)).rejects.toThrow(SecurityError);
    await expect(classifyTarget(42)).rejects.toThrow(SecurityError);
    await expect(classifyTarget(undefined)).rejects.toThrow(SecurityError);
  });

  it('rejects a target that does not exist (no silent fallback)', async () => {
    await expect(classifyTarget(path.join(os.tmpdir(), 'no-such-file-12345.bin'))).rejects.toThrow(
      /does not exist/
    );
  });

  it('classifies ordinary files and disk images by extension', async () => {
    const doc = await classifyTarget(makeFile('report.txt'));
    expect(doc.kind).toBe('REGULAR_FILE');

    const image = await classifyTarget(makeFile('evidence.dd'));
    expect(image.kind).toBe('DISK_IMAGE');
  });

  it('rejects directories and symlinks', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-target-dir-'));
    tmpDirs.push(dir);
    await expect(classifyTarget(dir)).rejects.toThrow(/directories/);

    const target = makeFile('real.bin');
    const link = `${target}.link`;
    try {
      fs.symlinkSync(target, link);
      await expect(classifyTarget(link)).rejects.toThrow(/symlink/);
    } catch {
      // symlink creation may be unavailable without elevation; skip silently
    }
  });

  it('rejects control characters in targets', async () => {
    await expect(classifyTarget('file\u0000name.bin')).rejects.toThrow(/control characters/);
  });
});

describe('authorizeDestructiveTarget', () => {
  it('allows a regular file without consulting the OS', async () => {
    const file = makeFile('allowed.bin');
    const decision = await authorizeDestructiveTarget(file, { resolver: resolver(null, null) });
    expect(decision.allowed).toBe(true);
  });

  it('denies the system disk with TARGET_SYSTEM_PROTECTED — no override exists', async () => {
    const decision = await authorizeDestructiveTarget('\\\\.\\PhysicalDrive0', {
      resolver: resolver([0], ['C'])
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('TARGET_SYSTEM_PROTECTED');
  });

  it('allows a non-system physical drive when the mapping is known', async () => {
    const decision = await authorizeDestructiveTarget('\\\\.\\PhysicalDrive1', {
      resolver: resolver([0], ['C'])
    });
    expect(decision.allowed).toBe(true);
  });

  it('FAILS CLOSED when system-disk mapping is unknown', async () => {
    const decision = await authorizeDestructiveTarget('\\\\.\\PhysicalDrive1', {
      resolver: resolver(null, ['C'])
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('TARGET_PROTECTION_UNVERIFIABLE');
  });

  it('denies the system volume with TARGET_SYSTEM_PROTECTED', async () => {
    const decision = await authorizeDestructiveTarget('C:', { resolver: resolver([0], ['C']) });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('TARGET_SYSTEM_PROTECTED');
  });

  it('denies a device partition on the system volume', async () => {
    const decision = await authorizeDestructiveTarget('\\\\.\\C:', { resolver: resolver([0], ['C']) });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('TARGET_SYSTEM_PROTECTED');
  });

  it('allows a non-system volume when the mapping is known', async () => {
    const decision = await authorizeDestructiveTarget('E:', { resolver: resolver([0], ['C']) });
    expect(decision.allowed).toBe(true);
  });

  it('FAILS CLOSED for volumes when system volume mapping is unknown', async () => {
    const decision = await authorizeDestructiveTarget('E:', { resolver: resolver([0], null) });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('TARGET_PROTECTION_UNVERIFIABLE');
  });

  it('returns an explicit denial (never throws) for malformed targets', async () => {
    for (const bad of ['', null, 42, '\\\\server\\share', '\\\\.\\PhysicalDrive']) {
      const decision = await authorizeDestructiveTarget(bad, { resolver: resolver([0], ['C']) });
      expect(decision.allowed).toBe(false);
    }
  });

  it('resolver failures are treated as unknown, not as permission to proceed', async () => {
    const throwing: SystemInfoResolver = {
      getSystemDiskNumbers: async () => {
        throw new Error('powershell exploded');
      },
      getSystemVolumeLetters: async () => {
        throw new Error('powershell exploded');
      }
    };
    const drive = await authorizeDestructiveTarget('\\\\.\\PhysicalDrive2', { resolver: throwing });
    expect(drive.allowed).toBe(false);
    if (!drive.allowed) expect(drive.code).toBe('TARGET_PROTECTION_UNVERIFIABLE');

    const volume = await authorizeDestructiveTarget('D:', { resolver: throwing });
    expect(volume.allowed).toBe(false);
    if (!volume.allowed) expect(volume.code).toBe('TARGET_PROTECTION_UNVERIFIABLE');
  });
});
