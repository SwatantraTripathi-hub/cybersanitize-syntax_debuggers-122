/**
 * Audit hash chain: canonical entry hashing, chaining and verification.
 *
 * Every entry binds:
 *
 *   entry_hash = SHA-256(canonical_json({ v: 1, ...fields, prev_hash }))
 *   signature  = Ed25519 detached signature over entry_hash bytes
 *
 * Genesis prev_hash is 64 zero hex characters — used consistently everywhere
 * (the reference implementation mixed 'GENESIS' with zero hashes, which made
 * two different chain formats that could not verify each other).
 *
 * Verification is evidence-backed: it recomputes every entry hash from the
 * canonical record, checks strict id sequencing (detects reorders, duplicates
 * and deleted entries), checks prev_hash linkage and performs real Ed25519
 * verification. It never reports VALID without performing those checks.
 */

import { AuditRecord, ChainBreakReason, ChainVerificationResult } from '../types/audit';
import { SecurityError } from '../types/errors';
import { canonicalizeBytes } from './canonical';
import { isSha256Hex, sha256Hex } from './hash';
import { verifyEntryDigest } from './sign';

export const CHAIN_VERSION = 1;
export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface AuditEntryHashInput {
  id: number;
  case_id: string;
  timestamp: string;
  operation: string;
  target: string;
  status: string;
  operator: string;
  details: Record<string, unknown>;
  hash_before: string | null;
  hash_after: string | null;
  verification_result: Record<string, unknown> | null;
  prev_hash: string;
}

/**
 * Deterministic entry hash. Independent of property insertion order because
 * canonicalization sorts keys.
 */
export function computeAuditEntryHash(entry: AuditEntryHashInput): string {
  const payload = {
    v: CHAIN_VERSION,
    id: entry.id,
    case_id: entry.case_id,
    timestamp: entry.timestamp,
    operation: entry.operation,
    target: entry.target,
    status: entry.status,
    operator: entry.operator,
    details: entry.details === null || entry.details === undefined ? {} : entry.details,
    hash_before: entry.hash_before ?? null,
    hash_after: entry.hash_after ?? null,
    verification_result: entry.verification_result ?? null,
    prev_hash: entry.prev_hash
  };
  return sha256Hex(canonicalizeBytes(payload));
}

function tampered(
  checked: number,
  index: number,
  entry: AuditRecord | undefined,
  reason: ChainBreakReason,
  detail: string
): ChainVerificationResult {
  return {
    status: 'TAMPERED',
    checkedEntries: checked,
    brokenAtId: entry && Number.isInteger(entry.id) ? entry.id : null,
    brokenAtIndex: index,
    reason,
    detail
  };
}

/**
 * Verifies a FULL ledger from genesis (id === 1) to the tip.
 *
 * Case-scoped subsets must NOT be passed here: partial chains cannot prove
 * global sequencing. Callers must fetch the complete ordered ledger.
 */
export function verifyAuditChain(
  entries: readonly AuditRecord[],
  publicKeyHex: string
): ChainVerificationResult {
  if (entries.length === 0) {
    return { status: 'VALID', checkedEntries: 0, tipHash: GENESIS_PREV_HASH };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (!Number.isInteger(entry.id) || entry.id !== i + 1) {
      return tampered(
        i,
        i,
        entry,
        'SEQUENCE_INVALID',
        `entry sequence broken at index ${i}: expected id ${i + 1}, found ${String(entry.id)}. ` +
          'An entry was deleted, reordered or inserted out of order.'
      );
    }

    if (!isSha256Hex(entry.entry_hash) || !isSha256Hex(entry.prev_hash) || typeof entry.signature !== 'string') {
      return tampered(i, i, entry, 'HASH_FORMAT_INVALID', `entry #${entry.id} has malformed hash or missing fields`);
    }

    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : entries[i - 1].entry_hash;
    if (i === 0 && entry.prev_hash !== GENESIS_PREV_HASH) {
      return tampered(i, i, entry, 'GENESIS_MISMATCH', `entry #${entry.id} does not start from the genesis hash`);
    }
    if (i > 0 && entry.prev_hash !== expectedPrev) {
      return tampered(
        i,
        i,
        entry,
        'PREV_HASH_MISMATCH',
        `entry #${entry.id} prev_hash does not match entry #${entry.id - 1} entry_hash`
      );
    }

    const recomputed = computeAuditEntryHash(entry);
    if (recomputed !== entry.entry_hash) {
      return tampered(
        i,
        i,
        entry,
        'ENTRY_HASH_MISMATCH',
        `entry #${entry.id} content hash mismatch — the record was modified after sealing, ` +
          'or it was produced by an incompatible chain version'
      );
    }

    if (entry.signature.length === 0) {
      return tampered(i, i, entry, 'SIGNATURE_MISSING', `entry #${entry.id} is unsigned`);
    }
    if (!verifyEntryDigest(entry.entry_hash, entry.signature, publicKeyHex)) {
      return tampered(
        i,
        i,
        entry,
        'SIGNATURE_INVALID',
        `entry #${entry.id} failed Ed25519 signature verification`
      );
    }
  }

  return { status: 'VALID', checkedEntries: entries.length, tipHash: entries[entries.length - 1].entry_hash };
}

/** Guards against extending a chain whose stored tip hash is malformed. */
export function assertExtensibleTipHash(prevHash: string): void {
  if (!isSha256Hex(prevHash)) {
    throw new SecurityError('CHAIN_INVALID', 'refusing to append: current chain tip hash is malformed');
  }
}
