/**
 * Audit ledger repository.
 *
 * The append path is the critical fix over the reference implementation:
 * everything that must happen together — id allocation, chain tip read,
 * entry hashing, signing and the INSERT — occurs inside ONE transaction
 * (BEGIN IMMEDIATE). The reference inserted a row and then updated its hash
 * in a second statement, which could crash halfway and leave an unhashed,
 * unverified row in an "immutable" ledger.
 *
 * All SQL uses bound parameters; column names never come from input.
 */

import {
  AuditOperationType,
  AuditRecord,
  AuditRecordStatus,
  AuditStats
} from '../../types/audit';
import { CaseScope } from '../../types/case';
import { PersistenceError } from '../../types/errors';
import {
  assertAuditOperation,
  assertAuditStatus,
  assertCaseId,
  assertDetailsObject,
  assertNonNegativeInteger,
  assertOperatorId,
  assertOptionalSha256,
  assertTargetText,
  assertTimestamp
} from '../../security/inputGuard';
import {
  assertExtensibleTipHash,
  computeAuditEntryHash,
  GENESIS_PREV_HASH
} from '../../crypto/hashChain';
import { isSha256Hex } from '../../crypto/hash';
import { SigningKeystore } from '../../crypto/keystore';
import type { Driver } from '../driver';

export interface AppendAuditInput {
  case_id: string;
  timestamp?: string;
  operation: AuditOperationType;
  target: string;
  details?: Record<string, unknown>;
  status: AuditRecordStatus;
  operator: string;
  hash_before?: string | null;
  hash_after?: string | null;
  verification_result?: Record<string, unknown> | null;
}

export interface AuditQuery {
  scope?: CaseScope;
  operation?: AuditOperationType;
  status?: AuditRecordStatus;
  caseId?: string;
  limit?: number;
  offset?: number;
}

interface AuditRow {
  id: number;
  case_id: string;
  timestamp: string;
  operation: string;
  target: string;
  details: string;
  status: string;
  operator: string;
  hash_before: string | null;
  hash_after: string | null;
  verification_result: string | null;
  prev_hash: string;
  entry_hash: string;
  signature: string;
}

const MAX_PAGE_SIZE = 10_000;

function parseJsonObject(text: string | null, label: string): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through to explicit error below
  }
  throw new PersistenceError('PERSISTENCE_INTEGRITY', `${label} column contains non-object JSON`);
}

function rowToRecord(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    case_id: row.case_id,
    timestamp: row.timestamp,
    operation: row.operation as AuditOperationType,
    target: row.target,
    details: parseJsonObject(row.details, 'details') ?? {},
    status: row.status as AuditRecordStatus,
    operator: row.operator,
    hash_before: row.hash_before,
    hash_after: row.hash_after,
    verification_result: parseJsonObject(row.verification_result, 'verification_result'),
    prev_hash: row.prev_hash,
    entry_hash: row.entry_hash,
    signature: row.signature
  };
}

const SELECT_COLUMNS =
  'id, case_id, timestamp, operation, target, details, status, operator, ' +
  'hash_before, hash_after, verification_result, prev_hash, entry_hash, signature';

export class AuditRepository {
  constructor(
    private readonly driver: Driver,
    private readonly keystore: SigningKeystore
  ) {}

  /**
   * Appends and seals one ledger entry atomically.
   * Input is validated backend-side (renderer payloads are never trusted).
   */
  append(input: AppendAuditInput): AuditRecord {
    const caseId = assertCaseId(input.case_id);
    const operation = assertAuditOperation(input.operation);
    const status = assertAuditStatus(input.status);
    const target = assertTargetText(input.target);
    const operator = assertOperatorId(input.operator);
    const timestamp =
      input.timestamp === undefined ? new Date().toISOString() : assertTimestamp(input.timestamp);
    const details = assertDetailsObject(input.details, 'details');
    const hashBefore = assertOptionalSha256(input.hash_before, 'hash_before');
    const hashAfter = assertOptionalSha256(input.hash_after, 'hash_after');
    const verificationResult =
      input.verification_result === undefined || input.verification_result === null
        ? null
        : assertDetailsObject(input.verification_result, 'verification_result');

    return this.driver.transaction(() => {
      const nextId = this.nextId();
      const prevHash = this.tipHash();
      assertExtensibleTipHash(prevHash);

      const entryHash = computeAuditEntryHash({
        id: nextId,
        case_id: caseId,
        timestamp,
        operation,
        target,
        status,
        operator,
        details,
        hash_before: hashBefore,
        hash_after: hashAfter,
        verification_result: verificationResult,
        prev_hash: prevHash
      });
      const signature = this.keystore.signEntryDigest(entryHash);

      this.driver.run(
        `INSERT INTO audit_logs (
           id, case_id, timestamp, operation, target, details, status, operator,
           hash_before, hash_after, verification_result, prev_hash, entry_hash, signature
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        nextId,
        caseId,
        timestamp,
        operation,
        target,
        JSON.stringify(details),
        status,
        operator,
        hashBefore,
        hashAfter,
        verificationResult === null ? null : JSON.stringify(verificationResult),
        prevHash,
        entryHash,
        signature
      );

      return {
        id: nextId,
        case_id: caseId,
        timestamp,
        operation,
        target,
        details,
        status,
        operator,
        hash_before: hashBefore,
        hash_after: hashAfter,
        verification_result: verificationResult,
        prev_hash: prevHash,
        entry_hash: entryHash,
        signature
      };
    });
  }

  /** Highest stored id, or 0 when the ledger is empty. */
  private nextId(): number {
    const row = this.driver.get<{ next_id: number | null }>(
      'SELECT MAX(id) AS next_id FROM audit_logs'
    );
    const max = row?.next_id ?? 0;
    return Number(max ?? 0) + 1;
  }

  /**
   * Chain tip hash. Rows with a malformed or empty entry_hash are surfaced as
   * PERSISTENCE_INTEGRITY — the reference implementation silently used the
   * genesis hash for those, which made a broken chain look extendable.
   */
  tipHash(): string {
    const row = this.driver.get<{ entry_hash: string }>(
      'SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1'
    );
    if (!row) return GENESIS_PREV_HASH;
    if (!isSha256Hex(row.entry_hash)) {
      throw new PersistenceError(
        'PERSISTENCE_INTEGRITY',
        'chain tip entry_hash is missing or malformed; refusing to append until the ledger is repaired'
      );
    }
    return row.entry_hash;
  }

  /** Full ordered ledger (id ASC). Chain verification needs the whole set. */
  listAll(): AuditRecord[] {
    const rows = this.driver.all<AuditRow>(`SELECT ${SELECT_COLUMNS} FROM audit_logs ORDER BY id ASC`);
    return rows.map(rowToRecord);
  }

  /** Filtered, paginated read. All predicates are bound parameters. */
  list(query: AuditQuery = {}): AuditRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const scopeCase =
      query.scope?.kind === 'CASE' ? query.scope.caseId : (query.caseId ?? undefined);
    if (scopeCase !== undefined) {
      conditions.push('case_id = ?');
      params.push(scopeCase);
    }
    if (query.operation !== undefined) {
      conditions.push('operation = ?');
      params.push(assertAuditOperation(query.operation));
    }
    if (query.status !== undefined) {
      conditions.push('status = ?');
      params.push(assertAuditStatus(query.status));
    }

    const limit = Math.min(
      query.limit === undefined ? 500 : assertNonNegativeInteger(query.limit, 'limit'),
      MAX_PAGE_SIZE
    );
    const offset = query.offset === undefined ? 0 : assertNonNegativeInteger(query.offset, 'offset');

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.driver.all<AuditRow>(
      `SELECT ${SELECT_COLUMNS} FROM audit_logs${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...params,
      limit,
      offset
    );
    return rows.map(rowToRecord);
  }

  getById(id: number): AuditRecord | null {
    const numericId = assertNonNegativeInteger(id, 'id');
    const row = this.driver.get<AuditRow>(
      `SELECT ${SELECT_COLUMNS} FROM audit_logs WHERE id = ?`,
      numericId
    );
    return row ? rowToRecord(row) : null;
  }

  /** Count matching rows (used by stats and export planning). */
  count(scope?: CaseScope): number {
    const params: unknown[] = [];
    let where = '';
    if (scope?.kind === 'CASE') {
      where = ' WHERE case_id = ?';
      params.push(scope.caseId);
    }
    const row = this.driver.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs${where}`, ...params);
    return Number(row?.n ?? 0);
  }

  /**
   * Aggregated statistics. Exact counts from SQL — no client-side guessing
   * and no fields invented when a query returns nothing.
   */
  stats(scope?: CaseScope): AuditStats {
    const params: unknown[] = [];
    let where = '';
    if (scope?.kind === 'CASE') {
      where = ' WHERE case_id = ?';
      params.push(scope.caseId);
    }

    const rows = this.driver.all<{ operation: string; status: string; n: number }>(
      `SELECT operation, status, COUNT(*) AS n FROM audit_logs${where} GROUP BY operation, status`,
      ...params
    );

    const stats: AuditStats = {
      total: 0,
      wipes: 0,
      erases: 0,
      carves: 0,
      writeBlockerVerifications: 0,
      evidenceImports: 0,
      failed: 0
    };

    for (const row of rows) {
      const n = Number(row.n);
      stats.total += n;
      if (row.status === 'FAILED') stats.failed += n;
      switch (row.operation) {
        case 'DRIVE_WIPE':
          stats.wipes += n;
          break;
        case 'FILE_ERASE':
          stats.erases += n;
          break;
        case 'FILE_RECOVERY':
          stats.carves += n;
          break;
        case 'WRITE_BLOCKER_VERIFIED':
          stats.writeBlockerVerifications += n;
          break;
        case 'EVIDENCE_IMPORT':
          stats.evidenceImports += n;
          break;
        default:
          break;
      }
    }
    return stats;
  }

  /**
   * Deletes every ledger entry. This is deliberately destructive and should
   * only be reachable behind a FULL-permission audit-clear flow; the chain
   * restarts from genesis afterwards.
   *
   * There is deliberately no deleteById/updateStatus: sealed entries are
   * hash-bound, so mutating or removing a single row would break the chain.
   * Corrections are appended as new entries, never by rewriting history.
   */
  clear(): number {
    return this.driver.transaction(() => {
      const before = this.count();
      this.driver.exec('DELETE FROM audit_logs');
      return before;
    });
  }
}
