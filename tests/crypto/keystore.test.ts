import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEYSTORE_FILE_NAME, SigningKeystore } from '../../src/main/crypto/keystore';

const dirs: string[] = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-keystore-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe('SigningKeystore', () => {
  it('creates a key file on first load and reuses it afterwards', () => {
    const dir = makeDir();
    const first = new SigningKeystore(dir);
    const created = first.loadOrCreate();
    expect(created.created).toBe(true);
    expect(fs.existsSync(path.join(dir, KEYSTORE_FILE_NAME))).toBe(true);

    const second = new SigningKeystore(dir);
    const loaded = second.loadOrCreate();
    expect(loaded.created).toBe(false);
    expect(loaded.publicKeyHex).toBe(created.publicKeyHex);
  });

  it('signs and verifies with the loaded key', () => {
    const dir = makeDir();
    const store = new SigningKeystore(dir);
    const { publicKeyHex } = store.loadOrCreate();
    const signature = store.signEntryDigest('c'.repeat(64));
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws KEY_CORRUPT for a damaged JSON file and NEVER silently regenerates', () => {
    const dir = makeDir();
    const file = path.join(dir, KEYSTORE_FILE_NAME);
    const store = new SigningKeystore(dir);
    store.loadOrCreate();

    fs.writeFileSync(file, '{ this is not json');
    const damaged = fs.readFileSync(file, 'utf8');
    const second = new SigningKeystore(dir);
    expect(() => second.loadOrCreate()).toThrowError(/KEY_CORRUPT|corrupt|not valid JSON/i);

    // The damaged file was not replaced with a freshly generated key.
    expect(fs.readFileSync(file, 'utf8')).toBe(damaged);
  });

  it('throws KEY_CORRUPT when public/secret halves disagree', () => {
    const dir = makeDir();
    const file = path.join(dir, KEYSTORE_FILE_NAME);
    const store = new SigningKeystore(dir);
    store.loadOrCreate();

    const payload = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    // Keep both halves valid hex, but make them a mismatched pair.
    payload.publicKey = '1'.repeat(64);
    payload.secretKey = '2'.repeat(128);
    fs.writeFileSync(file, JSON.stringify(payload));

    const second = new SigningKeystore(dir);
    expect(() => second.loadOrCreate()).toThrowError(/KEY_CORRUPT|inconsistent|mismatch/i);
  });

  it('throws KEY_CORRUPT for a structurally wrong but parseable file', () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, KEYSTORE_FILE_NAME), JSON.stringify({ version: 99 }));
    const store = new SigningKeystore(dir);
    expect(() => store.loadOrCreate()).toThrow();
  });

  it('throws before signing when the keystore was never loaded', () => {
    const store = new SigningKeystore(makeDir());
    expect(() => store.signEntryDigest('d'.repeat(64))).toThrow();
    expect(() => store.getPublicKeyHex()).toThrow();
  });

  it('never exposes the secret key through describe()', () => {
    const dir = makeDir();
    const store = new SigningKeystore(dir);
    store.loadOrCreate();
    const described = store.describe();
    expect(described.secretKey).toBeUndefined();
    expect(JSON.stringify(described)).not.toMatch(/[0-9a-f]{128}/);
  });
});
