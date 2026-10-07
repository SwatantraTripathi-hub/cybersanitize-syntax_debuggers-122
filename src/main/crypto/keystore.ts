/**
 * Signing keystore: key generation, storage and load are separated from
 * signing/verification logic (sign.ts).
 *
 * Safety rules:
 *  - a missing key file is created atomically with owner-only permissions;
 *  - a CORRUPT key file throws KEY_CORRUPT — it is never silently replaced,
 *    because silently generating a fresh key would make every historical
 *    signature unverifiable while still "verifying" new entries;
 *  - the secret key is never logged and never returned by public accessors;
 *  - loaded key pairs are cross-checked: the public half derived from the
 *    stored secret key must match the stored public key.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import nacl from 'tweetnacl';
import { SecurityError } from '../types/errors';
import {
  Ed25519KeyPairHex,
  generateEd25519KeyPair,
  isValidEd25519PublicKeyHex,
  isValidEd25519SecretKeyHex,
  signDetached,
  signEntryDigest
} from './sign';

export const KEYSTORE_FORMAT_VERSION = 1;
export const KEYSTORE_FILE_NAME = 'audit_signing_key.json';

interface KeystoreFile {
  version: number;
  algorithm: 'ed25519';
  publicKey: string;
  secretKey: string;
  createdAt: string;
}

export class SigningKeystore {
  private readonly filePath: string;
  private keys: Ed25519KeyPairHex | null = null;

  constructor(directory: string) {
    this.filePath = path.join(directory, KEYSTORE_FILE_NAME);
  }

  get path(): string {
    return this.filePath;
  }

  get loaded(): boolean {
    return this.keys !== null;
  }

  /**
   * Loads the existing key file or creates one.
   * Throws SecurityError(KEY_CORRUPT) if the file exists but is unusable.
   */
  loadOrCreate(): { created: boolean; publicKeyHex: string } {
    if (fs.existsSync(this.filePath)) {
      this.keys = this.readExisting();
      return { created: false, publicKeyHex: this.keys.publicKeyHex };
    }

    const fresh = generateEd25519KeyPair();
    const payload: KeystoreFile = {
      version: KEYSTORE_FORMAT_VERSION,
      algorithm: 'ed25519',
      publicKey: fresh.publicKeyHex,
      secretKey: fresh.secretKeyHex,
      createdAt: new Date().toISOString()
    };

    const tmpPath = `${this.filePath}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
      try {
        fs.chmodSync(tmpPath, 0o600);
      } catch {
        // chmod is best-effort on non-POSIX filesystems; the write itself succeeded.
      }
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup failure
      }
      throw new SecurityError(
        'KEY_UNAVAILABLE',
        `cannot create signing key store at "${this.filePath}": ${(err as Error).message}`
      );
    }

    this.keys = fresh;
    return { created: true, publicKeyHex: fresh.publicKeyHex };
  }

  private readExisting(): Ed25519KeyPairHex {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      throw new SecurityError('KEY_UNAVAILABLE', `cannot read signing key store: ${(err as Error).message}`);
    }

    let parsed: KeystoreFile;
    try {
      parsed = JSON.parse(raw) as KeystoreFile;
    } catch {
      throw new SecurityError(
        'KEY_CORRUPT',
        `signing key store "${this.filePath}" is not valid JSON; refusing to regenerate it ` +
          '(regenerating would silently invalidate all historical signatures)'
      );
    }

    if (parsed === null || typeof parsed !== 'object') {
      throw new SecurityError(
        'KEY_CORRUPT',
        `signing key store "${this.filePath}" has an unsupported or malformed structure`
      );
    }

    const anyParsed = parsed as any;
    const publicKeyHexRaw = anyParsed.publicKey;
    const secretKeyHexRaw = anyParsed.secretKey;

    if (!isValidEd25519PublicKeyHex(publicKeyHexRaw) || !isValidEd25519SecretKeyHex(secretKeyHexRaw)) {
      throw new SecurityError(
        'KEY_CORRUPT',
        `signing key store "${this.filePath}" has an unsupported or malformed structure`
      );
    }

    const publicKeyHex = String(publicKeyHexRaw).toLowerCase();
    const secretKeyHex = String(secretKeyHexRaw).toLowerCase();

    // Cross-check: the public key implied by the secret key must match.
    const derived = nacl.sign.keyPair.fromSecretKey(new Uint8Array(Buffer.from(secretKeyHex, 'hex')));
    if (Buffer.from(derived.publicKey).toString('hex') !== publicKeyHex) {
      throw new SecurityError(
        'KEY_CORRUPT',
        `signing key store "${this.filePath}" is internally inconsistent (public/secret key mismatch)`
      );
    }

    // Accept if canonical fields present; also accept legacy files missing version/algorithm.
    const hasCanonical = anyParsed.version === KEYSTORE_FORMAT_VERSION && anyParsed.algorithm === 'ed25519';
    if (!hasCanonical) {
      // Legacy format: valid keys present and consistent - preserve existing identity (do not regenerate).
      // Still enforce cryptographic validity above.
    }

    return { publicKeyHex, secretKeyHex };
  }

  getPublicKeyHex(): string {
    if (!this.keys) {
      throw new SecurityError('KEY_UNAVAILABLE', 'signing keystore has not been loaded');
    }
    return this.keys.publicKeyHex;
  }

  /** Signs raw message bytes. Never logs or returns key material. */
  sign(message: Uint8Array): string {
    if (!this.keys) {
      throw new SecurityError('KEY_UNAVAILABLE', 'signing keystore has not been loaded');
    }
    return signDetached(message, this.keys.secretKeyHex);
  }

  /** Signs a 32-byte SHA-256 entry digest. */
  signEntryDigest(entryHashHex: string): string {
    if (!this.keys) {
      throw new SecurityError('KEY_UNAVAILABLE', 'signing keystore has not been loaded');
    }
    return signEntryDigest(entryHashHex, this.keys.secretKeyHex);
  }

  /** Safe description: public data only. */
  describe(): { publicKeyHex: string; loaded: boolean; path: string } {
    return {
      publicKeyHex: this.keys ? this.keys.publicKeyHex : '',
      loaded: this.keys !== null,
      path: this.filePath
    };
  }
}
