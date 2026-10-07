/**
 * SHA-256 helpers. One algorithm, one format, one validation path.
 *
 * Hash values are always lowercase 64-char hex. Anything else is rejected
 * explicitly — a malformed hash must never be treated as an empty success.
 */

import * as nodeCrypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { SecurityError } from '../types/errors';

export const SHA256_HEX_LENGTH = 64;
const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;

export function sha256Hex(data: string | Uint8Array): string {
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_RE.test(value);
}

/** Validates and normalizes a hex SHA-256 string. Throws SecurityError if invalid. */
export function assertSha256Hex(value: unknown, label = 'hash'): string {
  if (typeof value !== 'string' || !SHA256_HEX_RE.test(value)) {
    throw new SecurityError(
      'HASH_FORMAT_INVALID',
      `${label} must be a ${SHA256_HEX_LENGTH}-character hex SHA-256 digest`
    );
  }
  return value.toLowerCase();
}

/** Streaming SHA-256 of a file. Never loads the whole file into memory. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let hash: nodeCrypto.Hash;
    try {
      hash = nodeCrypto.createHash('sha256');
    } catch (err) {
      reject(err);
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        new SecurityError(
          'INPUT_INVALID',
          `cannot read file for hashing "${filePath}": ${err.code ?? err.message}`
        )
      );
    });
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
