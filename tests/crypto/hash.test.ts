import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSha256Hex, sha256File, sha256Hex } from '../../src/main/crypto/hash';

describe('sha256Hex', () => {
  it('matches the known SHA-256 digest of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('returns a lowercase 64-hex string', () => {
    expect(sha256Hex('')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes bytes and strings identically', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex(Buffer.from('hello', 'utf8')));
  });
});

describe('isSha256Hex', () => {
  it('accepts exactly 64 hex chars', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true);
    expect(isSha256Hex('A'.repeat(64))).toBe(true);
  });

  it('rejects wrong length, non-hex and non-strings', () => {
    expect(isSha256Hex('a'.repeat(63))).toBe(false);
    expect(isSha256Hex('a'.repeat(65))).toBe(false);
    expect(isSha256Hex('z'.repeat(64))).toBe(false);
    expect(isSha256Hex('')).toBe(false);
    expect(isSha256Hex(null)).toBe(false);
    expect(isSha256Hex(123)).toBe(false);
    expect(isSha256Hex('GENESIS')).toBe(false);
  });
});

describe('sha256File', () => {
  it('hashes file content the same way as sha256Hex', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-hash-'));
    const file = path.join(dir, 'sample.bin');
    const content = 'forensic sample content';
    fs.writeFileSync(file, content);
    try {
      expect(await sha256File(file)).toBe(sha256Hex(content));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a missing file with a clear error', async () => {
    await expect(sha256File(path.join(os.tmpdir(), 'definitely-missing-file.bin'))).rejects.toThrow();
  });
});
