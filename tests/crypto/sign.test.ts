import { describe, expect, it } from 'vitest';
import {
  generateEd25519KeyPair,
  isValidEd25519PublicKeyHex,
  isValidSignatureHex,
  signDetached,
  signEntryDigest,
  verifyDetached,
  verifyEntryDigest
} from '../../src/main/crypto/sign';

const message = new TextEncoder().encode('operation payload');

describe('generateEd25519KeyPair', () => {
  it('produces 64-hex public and 128-hex secret keys', () => {
    const pair = generateEd25519KeyPair();
    expect(pair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(pair.secretKeyHex).toMatch(/^[0-9a-f]{128}$/);
    expect(isValidEd25519PublicKeyHex(pair.publicKeyHex)).toBe(true);
  });

  it('produces a distinct key pair each time', () => {
    expect(generateEd25519KeyPair().publicKeyHex).not.toBe(generateEd25519KeyPair().publicKeyHex);
  });
});

describe('signDetached / verifyDetached', () => {
  const pair = generateEd25519KeyPair();

  it('round-trips: signature verifies with the public key', () => {
    const sig = signDetached(message, pair.secretKeyHex);
    expect(isValidSignatureHex(sig)).toBe(true);
    expect(verifyDetached(message, sig, pair.publicKeyHex)).toBe(true);
  });

  it('rejects a tampered message', () => {
    const sig = signDetached(message, pair.secretKeyHex);
    const tampered = new TextEncoder().encode('operation payloaD');
    expect(verifyDetached(tampered, sig, pair.publicKeyHex)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = generateEd25519KeyPair();
    const sig = signDetached(message, other.secretKeyHex);
    expect(verifyDetached(message, sig, pair.publicKeyHex)).toBe(false);
  });

  it('returns false (never throws) for malformed hex input', () => {
    expect(verifyDetached(message, 'not-hex', pair.publicKeyHex)).toBe(false);
    expect(verifyDetached(message, 'ab', pair.publicKeyHex)).toBe(false);
    expect(verifyDetached(message, 'z'.repeat(128), pair.publicKeyHex)).toBe(false);
    expect(verifyDetached(message, 'a'.repeat(128), 'short')).toBe(false);
    expect(verifyDetached(message, 'a'.repeat(128), 'z'.repeat(64))).toBe(false);
  });

  it('signDetached throws on a missing/malformed secret key instead of fabricating a signature', () => {
    expect(() => signDetached(message, '')).toThrow();
    expect(() => signDetached(message, 'deadbeef')).toThrow();
    expect(() => signDetached(message, 'z'.repeat(128))).toThrow();
  });
});

describe('signEntryDigest / verifyEntryDigest', () => {
  const pair = generateEd25519KeyPair();
  const digest = 'a'.repeat(64);

  it('round-trips on a well-formed digest', () => {
    const sig = signEntryDigest(digest, pair.secretKeyHex);
    expect(verifyEntryDigest(digest, sig, pair.publicKeyHex)).toBe(true);
  });

  it('verification fails for a different digest', () => {
    const sig = signEntryDigest(digest, pair.secretKeyHex);
    expect(verifyEntryDigest('b'.repeat(64), sig, pair.publicKeyHex)).toBe(false);
  });

  it('returns false for malformed digests instead of throwing', () => {
    expect(verifyEntryDigest('short', 'a'.repeat(128), pair.publicKeyHex)).toBe(false);
    expect(verifyEntryDigest('z'.repeat(64), 'a'.repeat(128), pair.publicKeyHex)).toBe(false);
  });

  it('signEntryDigest throws for a malformed digest', () => {
    expect(() => signEntryDigest('short', pair.secretKeyHex)).toThrow();
  });
});
