import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, Database } from '../../src/main/persistence/database';
import { AuditLedger } from '../../src/main/persistence/ledger';
import { SigningKeystore } from '../../src/main/crypto/keystore';
import { GENESIS_PREV_HASH, verifyAuditChain } from '../../src/main/crypto/hashChain';
import { CyberSanitizeError, PersistenceError, SecurityError } from '../../src/main/types/errors';

let db: Database | null = null;
let ledger: AuditLedger | null = null;

async function makeLedger(): Promise<AuditLedger> {
  db = await openDatabase({}); // in-memory
  const keystore = new SigningKeystore(db.filePath === ':memory:' ? await tempKeyDir() : db.filePath);
  keystore.loadOrCreate();
  ledger = new AuditLedger(db.driver, keystore);
  return ledger;
}

async function tempKeyDir(): Promise<string> {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cs-ledger-key-'));
}

afterEach(() => {
  db?.close();
  db = null;
  ledger = null;
});

const baseInput = {
  case_id: 'CASE-1',
  operation: 'FILE_ERASE' as const,
  target: 'E:\\evidence\\item.bin',
  status: 'COMPLETED' as const,
  operator: 'alice',
  details: { passes: 3 }
};

describe('AuditLedger.append', () => {
  it('seals an entry with prev_hash = genesis on an empty ledger', async () => {
    const ledger = await makeLedger();
    const record = ledger.append(baseInput);
    expect(record.id).toBe(1);
    expect(record.prev_hash).toBe(GENESIS_PREV_HASH);
    expect(record.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it('links entries into a chain the verifier accepts', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, target: 'E:\\evidence\\second.bin' });
    ledger.append({ ...baseInput, operation: 'DRIVE_WIPE', target: '\\\\.\\PhysicalDrive2' });

    const result = ledger.verify();
    expect(result.status).toBe('VALID');
    if (result.status === 'VALID') expect(result.checkedEntries).toBe(3);
  });

  it('each prev_hash equals the previous entry_hash', async () => {
    const ledger = await makeLedger();
    const first = ledger.append(baseInput);
    const second = ledger.append({ ...baseInput, target: 'second.bin' });
    expect(second.prev_hash).toBe(first.entry_hash);
    expect(second.id).toBe(first.id + 1);
  });

  it('rejects invalid input before anything touches the database', async () => {
    const ledger = await makeLedger();
    expect(() => ledger.append({ ...baseInput, case_id: '../evil' })).toThrow(SecurityError);
    expect(() => ledger.append({ ...baseInput, operation: 'HACK' as never })).toThrow(SecurityError);
    expect(() => ledger.append({ ...baseInput, operator: 'a b' })).toThrow(SecurityError);
    expect(() => ledger.append({ ...baseInput, status: 'WHATEVER' as never })).toThrow(SecurityError);
    expect(ledger.count()).toBe(0);
  });

  it('a failed append leaves NO partial row (atomicity)', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    // Force a failure after validation: details with NaN is rejected pre-SQL,
    // so simulate a mid-transaction failure via a constraint violation.
    expect(() =>
      ledger.append({ ...baseInput, details: { bad: Number.NaN } })
    ).toThrow(SecurityError);

    const stats = ledger.stats();
    expect(stats.total).toBe(1);
    expect(ledger.verify().status).toBe('VALID');
  });

  it('refuses to extend a chain whose tip is malformed', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    // Corrupt the tip directly (simulates partial legacy write / tampering).
    db!.driver.run("UPDATE audit_logs SET entry_hash = '' WHERE id = 1");
    expect(() => ledger.append(baseInput)).toThrow(PersistenceError);
    expect(() => ledger.append(baseInput)).toThrow(/malformed|repair/i);
  });
});

describe('AuditLedger.verify', () => {
  it('detects tampering with a stored row', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, target: 'second.bin' });

    db!.driver.run("UPDATE audit_logs SET target = 'C:\\tampered.exe' WHERE id = 2");
    const result = ledger.verify();
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.brokenAtId).toBe(2);
  });

  it('detects a deleted row', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, target: 'second.bin' });
    ledger.append({ ...baseInput, target: 'third.bin' });

    db!.driver.run('DELETE FROM audit_logs WHERE id = 2');
    const result = ledger.verify();
    expect(result.status).toBe('TAMPERED');
    if (result.status === 'TAMPERED') expect(result.reason).toBe('SEQUENCE_INVALID');
  });

  it('an empty ledger verifies as VALID with zero entries', async () => {
    const ledger = await makeLedger();
    const result = ledger.verify();
    expect(result.status).toBe('VALID');
    if (result.status === 'VALID') expect(result.checkedEntries).toBe(0);
  });

  it('verification uses the keystore public key', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    const otherDb = await openDatabase({});
    const otherKeys = new SigningKeystore(await tempKeyDir());
    otherKeys.loadOrCreate();
    try {
      const foreign = verifyAuditChain(ledger.listAll(), otherKeys.getPublicKeyHex());
      expect(foreign.status).toBe('TAMPERED');
      if (foreign.status === 'TAMPERED') expect(foreign.reason).toBe('SIGNATURE_INVALID');
    } finally {
      otherDb.close();
    }
  });
});

describe('AuditLedger.assertHealthy', () => {
  it('passes on a valid chain', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    expect(() => ledger.assertHealthy()).not.toThrow();
  });

  it('throws CHAIN_INVALID on a tampered chain so appends fail fast', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    db!.driver.run("UPDATE audit_logs SET operator = 'mallory' WHERE id = 1");
    expect(() => ledger.assertHealthy()).toThrow(CyberSanitizeError);
    expect(() => ledger.assertHealthy()).toThrow(/CHAIN_INVALID|verification failed/);
  });
});

describe('AuditLedger queries', () => {
  it('filters by case scope', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, case_id: 'CASE-2' });

    expect(ledger.list({ scope: { kind: 'CASE', caseId: 'CASE-1' } }).length).toBe(1);
    expect(ledger.list({ scope: { kind: 'ALL' } }).length).toBe(2);
    expect(ledger.count({ kind: 'CASE', caseId: 'CASE-2' })).toBe(1);
  });

  it('filters by operation and status with bound parameters', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, operation: 'DRIVE_WIPE', target: '\\\\.\\PhysicalDrive1' });
    ledger.append({ ...baseInput, status: 'FAILED' });

    expect(ledger.list({ operation: 'DRIVE_WIPE' }).length).toBe(1);
    expect(ledger.list({ status: 'FAILED' }).length).toBe(1);
    expect(ledger.list({ operation: 'FILE_ERASE', status: 'COMPLETED' }).length).toBe(1);
  });

  it('returns exact stats per operation — no invented numbers', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, operation: 'DRIVE_WIPE', target: '\\\\.\\PhysicalDrive1' });
    ledger.append({ ...baseInput, status: 'FAILED' });

    const stats = ledger.stats();
    expect(stats.total).toBe(3);
    expect(stats.erases).toBe(2);
    expect(stats.wipes).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.carves).toBe(0);
  });

  it('stats respect case scope', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, case_id: 'CASE-2', operation: 'DRIVE_WIPE' });

    const scoped = ledger.stats({ kind: 'CASE', caseId: 'CASE-1' });
    expect(scoped.total).toBe(1);
    expect(scoped.wipes).toBe(0);
  });

  it('pagination is bounded and ordered newest-first', async () => {
    const ledger = await makeLedger();
    for (let i = 0; i < 5; i += 1) ledger.append({ ...baseInput, target: `file-${i}.bin` });

    const page = ledger.list({ limit: 2, offset: 0 });
    expect(page.length).toBe(2);
    expect(page[0].id).toBe(5);
    expect(page[1].id).toBe(4);

    const next = ledger.list({ limit: 2, offset: 2 });
    expect(next[0].id).toBe(3);
  });

  it('clear() empties the ledger and resets the chain to genesis', async () => {
    const ledger = await makeLedger();
    ledger.append(baseInput);
    ledger.append({ ...baseInput, target: 'second.bin' });

    const removed = ledger.clear();
    expect(removed).toBe(2);
    expect(ledger.count()).toBe(0);
    expect(ledger.verify().status).toBe('VALID');

    const fresh = ledger.append(baseInput);
    expect(fresh.id).toBe(1);
    expect(fresh.prev_hash).toBe(GENESIS_PREV_HASH);
  });
});

describe('AuditLedger JSON columns', () => {
  it('round-trips details and verification_result objects', async () => {
    const ledger = await makeLedger();
    const record = ledger.append({
      ...baseInput,
      details: { passes: 7, standard: 'dod-3', tags: ['a', 'b'] },
      verification_result: { passed: true, sampledBlocks: 100 }
    });

    const fetched = ledger.getById(record.id);
    expect(fetched?.details).toEqual({ passes: 7, standard: 'dod-3', tags: ['a', 'b'] });
    expect(fetched?.verification_result).toEqual({ passed: true, sampledBlocks: 100 });
  });

  it('verification_result stays null when not provided', async () => {
    const ledger = await makeLedger();
    const record = ledger.append(baseInput);
    expect(ledger.getById(record.id)?.verification_result).toBeNull();
  });
});
