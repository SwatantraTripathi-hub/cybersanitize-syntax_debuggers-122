import { describe, expect, it } from 'vitest';
import {
  assertExtensibleTipHash,
  computeAuditEntryHash,
  GENESIS_PREV_HASH,
  verifyAuditChain
} from '../../src/main/crypto/hashChain';
import { generateEd25519KeyPair, signEntryDigest } from '../../src/main/crypto/sign';
import { AuditRecord } from '../../src/main/types/audit';

const keys = generateEd25519KeyPair();

interface BuildOptions {
  id?: number;
  prevHash?: string;
  caseId?: string;
  operation?: string;
}

function buildEntry(options: BuildOptions = {}, previous?: AuditRecord): AuditRecord {
  const id = options.id ?? (previous ? previous.id + 1 : 1);
  const prevHash = options.prevHash ?? (previous ? previous.entry_hash : GENESIS_PREV_HASH);
  const base = {
    id,
    case_id: options.caseId ?? 'CASE-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    operation: options.operation ?? 'FILE_ERASE',
    target: 'E:\\evidence\\item.bin',
    details: { passes: 3 },
    status: 'COMPLETED',
    operator: 'alice',
    hash_before: 'a'.repeat(64),
    hash_after: 'b'.repeat(64),
    verification_result: null,
    prev_hash: prevHash
  } as const;
  const entryHash = computeAuditEntryHash(base);
  return {
    ...base,
    operation: base.operation as AuditRecord['operation'],
    status: base.status as AuditRecord['status'],
    entry_hash: entryHash,
    signature: signEntryDigest(entryHash, keys.secretKeyHex)
  };
}

function buildChain(length: number): AuditRecord[] {
  const chain: AuditRecord[] = [];
  for (let i = 0; i < length; i += 1) {
    chain.push(buildEntry({}, chain[chain.length - 1]));
  }
  return chain;
}

describe('computeAuditEntryHash', () => {
  it('is deterministic and independent of property order', () => {
    const entry = {
      id: 1,
      case_id: 'C1',
      timestamp: 't',
      operation: 'FILE_ERASE',
      target: 'x',
      status: 'COMPLETED',
      operator: 'op',
      details: { a: 1, b: 2 },
      hash_before: null,
      hash_after: null,
      verification_result: null,
      prev_hash: GENESIS_PREV_HASH
    };
    const reordered = {
      prev_hash: GENESIS_PREV_HASH,
      verification_result: null,
      hash_after: null,
      hash_before: null,
      details: { b: 2, a: 1 },
      operator: 'op',
      status: 'COMPLETED',
      target: 'x',
      operation: 'FILE_ERASE',
      timestamp: 't',
      case_id: 'C1',
      id: 1
    };
    expect(computeAuditEntryHash(entry)).toBe(computeAuditEntryHash(reordered));
  });

  it('changes when any bound field changes', () => {
    const base = {
      id: 1,
      case_id: 'C1',
      timestamp: 't',
      operation: 'FILE_ERASE',
      target: 'x',
      status: 'COMPLETED',
      operator: 'op',
      details: {},
      hash_before: null,
      hash_after: null,
      verification_result: null,
      prev_hash: GENESIS_PREV_HASH
    };
    const original = computeAuditEntryHash(base);
    expect(computeAuditEntryHash({ ...base, target: 'y' })).not.toBe(original);
    expect(computeAuditEntryHash({ ...base, details: { changed: true } })).not.toBe(original);
    expect(computeAuditEntryHash({ ...base, id: 2 })).not.toBe(original);
  });
});

describe('verifyAuditChain', () => {
  it('returns VALID for an empty ledger', () => {
    const result = verifyAuditChain([], keys.publicKeyHex);
    expect(result.status).toBe('VALID');
    if (result.status === 'VALID') expect(result.tipHash).toBe(GENESIS_PREV_HASH);
  });

  it('verifies a properly built chain', () => {
    const result = verifyAuditChain(buildChain(5), keys.publicKeyHex);
    expect(result.status).toBe('VALID');
    if (result.status === 'VALID') expect(result.checkedEntries).toBe(5);
  });

  it('rejects an empty chain when given a public key it was not signed with', () => {
    const other = generateEd25519KeyPair();
    const result = verifyAuditChain(buildChain(3), other.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
  });

  it('detects modified content (entry hash mismatch)', () => {
    const chain = buildChain(3);
    chain[1] = { ...chain[1], target: 'C:\\evil.exe' };
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') {
      expect(result.reason).toBe('ENTRY_HASH_MISMATCH');
      expect(result.brokenAtId).toBe(2);
    }
  });

  it('detects a deleted entry via strict id sequencing', () => {
    const chain = buildChain(4);
    chain.splice(1, 1);
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.reason).toBe('SEQUENCE_INVALID');
  });

  it('detects broken prev_hash linkage', () => {
    const chain = buildChain(3);
    chain[2] = { ...chain[2], prev_hash: 'f'.repeat(64) };
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.reason).toBe('PREV_HASH_MISMATCH');
  });

  it('detects a genesis that is not the zero hash', () => {
    const chain = buildChain(2);
    chain[0] = { ...chain[0], prev_hash: 'GENESIS' };
    // prev_hash malformed as hex is caught first as HASH_FORMAT_INVALID or
    // GENESIS_MISMATCH depending on shape; either way it must not be VALID.
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
  });

  it('detects unsigned entries', () => {
    const chain = buildChain(2);
    chain[1] = { ...chain[1], signature: '' };
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.reason).toBe('SIGNATURE_MISSING');
  });

  it('detects malformed hash fields without crashing', () => {
    const chain = buildChain(2);
    chain[0] = { ...chain[0], entry_hash: 'not-a-hash' };
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.reason).toBe('HASH_FORMAT_INVALID');
  });

  it('detects an entry re-signed with a foreign key', () => {
    const chain = buildChain(2);
    const attacker = generateEd25519KeyPair();
    // entry_hash still matches content, but the signature is not the keeper's.
    chain[1] = {
      ...chain[1],
      signature: signEntryDigest(chain[1].entry_hash, attacker.secretKeyHex)
    };
    const result = verifyAuditChain(chain, keys.publicKeyHex);
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.reason).toBe('SIGNATURE_INVALID');
  });
});

describe('assertExtensibleTipHash', () => {
  it('accepts a well-formed hash', () => {
    expect(() => assertExtensibleTipHash('a'.repeat(64))).not.toThrow();
  });

  it('rejects malformed tips so a broken chain cannot be extended', () => {
    expect(() => assertExtensibleTipHash('')).toThrow();
    expect(() => assertExtensibleTipHash('GENESIS')).toThrow();
    expect(() => assertExtensibleTipHash('z'.repeat(64))).toThrow();
  });
});
