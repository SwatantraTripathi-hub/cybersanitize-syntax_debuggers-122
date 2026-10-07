/**
 * Ed25519 signing and verification (TweetNaCl).
 *
 * Contract rules:
 *  - verify* functions NEVER return true unless real cryptographic
 *    verification succeeded;
 *  - verify* functions return false (instead of throwing) for malformed
 *    attacker-controlled input such as bad hex or wrong lengths;
 *  - sign* functions throw on malformed key material — they never fall back
 *    to empty or fabricated signatures.
 *
 * Key generation, storage (keystore.ts), signing and verification are kept
 * as separate concerns.
 */

import nacl from 'tweetnacl';
import { SecurityError } from '../types/errors';

export const ED25519_PUBLIC_KEY_HEX_LENGTH = 64;
export const ED25519_SECRET_KEY_HEX_LENGTH = 128;
export const ED25519_SIGNATURE_HEX_LENGTH = 128;

export interface Ed25519KeyPairHex {
  publicKeyHex: string;
  secretKeyHex: string;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

export function generateEd25519KeyPair(): Ed25519KeyPairHex {
  const pair = nacl.sign.keyPair();
  return {
    publicKeyHex: Buffer.from(pair.publicKey).toString('hex'),
    secretKeyHex: Buffer.from(pair.secretKey).toString('hex')
  };
}

function isHexOfLength(value: unknown, length: number): value is string {
  return typeof value === 'string' && value.length === length && HEX_RE.test(value);
}

/** True only when key material is well-formed hex of the right length. */
export function isValidEd25519PublicKeyHex(value: unknown): boolean {
  return isHexOfLength(value, ED25519_PUBLIC_KEY_HEX_LENGTH);
}

export function isValidEd25519SecretKeyHex(value: unknown): boolean {
  return isHexOfLength(value, ED25519_SECRET_KEY_HEX_LENGTH);
}

export function isValidSignatureHex(value: unknown): boolean {
  return isHexOfLength(value, ED25519_SIGNATURE_HEX_LENGTH);
}

export function signDetached(message: Uint8Array, secretKeyHex: string): string {
  if (!isValidEd25519SecretKeyHex(secretKeyHex)) {
    throw new SecurityError('KEY_UNAVAILABLE', 'signing failed: secret key is missing or malformed');
  }
  const secretKey = new Uint8Array(Buffer.from(secretKeyHex, 'hex'));
  const signature = nacl.sign.detached(message, secretKey);
  return Buffer.from(signature).toString('hex');
}

/**
 * Real verification. Returns false for malformed signature/key input or a
 * cryptographic mismatch — it can only return true when nacl.verify
 * succeeded on well-formed bytes.
 */
export function verifyDetached(
  message: Uint8Array,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  if (!isValidSignatureHex(signatureHex) || !isValidEd25519PublicKeyHex(publicKeyHex)) {
    return false;
  }
  try {
    const signature = new Uint8Array(Buffer.from(signatureHex, 'hex'));
    const publicKey = new Uint8Array(Buffer.from(publicKeyHex, 'hex'));
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Entry signatures are detached signatures over the raw 32 bytes of the
 * entry's SHA-256 digest (not over its hex text).
 */
export function signEntryDigest(entryHashHex: string, secretKeyHex: string): string {
  if (!isHexOfLength(entryHashHex, 64)) {
    throw new SecurityError('HASH_FORMAT_INVALID', 'cannot sign: entry digest is not a SHA-256 hex string');
  }
  return signDetached(new Uint8Array(Buffer.from(entryHashHex, 'hex')), secretKeyHex);
}

export function verifyEntryDigest(
  entryHashHex: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  if (!isHexOfLength(entryHashHex, 64)) return false;
  return verifyDetached(new Uint8Array(Buffer.from(entryHashHex, 'hex')), signatureHex, publicKeyHex);
}
