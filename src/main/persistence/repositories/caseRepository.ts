/**
 * Case (workspace) repository.
 *
 * Case isolation is enforced at the query level: every read accepts a
 * CaseScope produced by the backend guard, never a raw renderer string.
 * Updates go through a fixed column allow-list — column names are never
 * derived from input objects (the reference implementation interpolated
 * client-supplied keys straight into SQL).
 */

import { CaseRecord, CaseScope, CaseStatus, CaseMode } from '../../types/case';
import { CyberSanitizeError, PersistenceError, SecurityError } from '../../types/errors';
import {
  assertCaseId,
  assertCaseMode,
  assertCaseStatus,
  assertOptionalSafeText,
  assertSafeText,
  assertTimestamp
} from '../../security/inputGuard';
import type { Driver } from '../driver';

interface CaseRow {
  case_id: string;
  title: string;
  evidence_tag: string;
  authorizing_officer: string;
  date: string;
  notes: string;
  classification: string;
  drive_serial: string | null;
  status: string;
  mode: string;
  fleet_key: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCase(row: CaseRow): CaseRecord {
  return {
    caseId: row.case_id,
    title: row.title,
    evidenceTag: row.evidence_tag,
    authorizingOfficer: row.authorizing_officer,
    date: row.date,
    notes: row.notes,
    classification: row.classification,
    driveSerial: row.drive_serial,
    status: row.status as CaseStatus,
    mode: row.mode as CaseMode,
    fleetKey: row.fleet_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_COLUMNS =
  'case_id, title, evidence_tag, authorizing_officer, date, notes, classification, ' +
  'drive_serial, status, mode, fleet_key, created_at, updated_at';

/** Fields a caller may update. Anything else is rejected as INPUT_INVALID. */
const UPDATABLE_FIELDS = new Set([
  'title',
  'evidenceTag',
  'authorizingOfficer',
  'date',
  'notes',
  'classification',
  'driveSerial',
  'status',
  'mode',
  'fleetKey'
]);

export interface CreateCaseInput {
  caseId: string;
  title: string;
  evidenceTag?: string;
  authorizingOfficer?: string;
  date?: string;
  notes?: string;
  classification?: string;
  driveSerial?: string | null;
  status?: CaseStatus;
  mode?: CaseMode;
  fleetKey?: string | null;
}

export interface UpdateCaseInput {
  title?: string;
  evidenceTag?: string;
  authorizingOfficer?: string;
  date?: string;
  notes?: string;
  classification?: string;
  driveSerial?: string | null;
  status?: CaseStatus;
  mode?: CaseMode;
  fleetKey?: string | null;
}

export class CaseRepository {
  constructor(private readonly driver: Driver) {}

  create(input: CreateCaseInput): CaseRecord {
    const caseId = assertCaseId(input.caseId);
    const title = assertSafeText(input.title, 'case title', 256);
    const evidenceTag = assertOptionalSafeText(input.evidenceTag, 'evidence tag', 128);
    const authorizingOfficer = assertOptionalSafeText(input.authorizingOfficer, 'authorizing officer', 256);
    const date = assertOptionalSafeText(input.date, 'case date', 64);
    const notes = assertOptionalSafeText(input.notes, 'notes', 4096);
    const classification = assertOptionalSafeText(input.classification, 'classification', 128);
    const driveSerial =
      input.driveSerial === undefined || input.driveSerial === null
        ? null
        : assertSafeText(input.driveSerial, 'drive serial', 256);
    const status = input.status === undefined ? 'ACTIVE' : assertCaseStatus(input.status);
    const mode = input.mode === undefined ? 'SINGLE' : assertCaseMode(input.mode);
    const fleetKey =
      input.fleetKey === undefined || input.fleetKey === null
        ? null
        : assertSafeText(input.fleetKey, 'fleet key', 128);

    const now = new Date().toISOString();

    return this.driver.transaction(() => {
      const existing = this.driver.get<{ case_id: string }>(
        'SELECT case_id FROM cases WHERE case_id = ?',
        caseId
      );
      if (existing) {
        throw new SecurityError('CONSTRAINT_VIOLATION', `case ${caseId} already exists`);
      }
      this.driver.run(
        `INSERT INTO cases (
           case_id, title, evidence_tag, authorizing_officer, date, notes,
           classification, drive_serial, status, mode, fleet_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        caseId,
        title,
        evidenceTag,
        authorizingOfficer,
        date,
        notes,
        classification,
        driveSerial,
        status,
        mode,
        fleetKey,
        now,
        now
      );
      return this.requireById(caseId);
    });
  }

  /** Scope-checked read: returns null for unknown ids (no existence leak
   *  differences beyond scope, and never another case's data). */
  getById(caseId: string, scope?: CaseScope): CaseRecord | null {
    const id = assertCaseId(caseId);
    if (scope?.kind === 'CASE' && scope.caseId !== id) return null;
    const row = this.driver.get<CaseRow>(`SELECT ${SELECT_COLUMNS} FROM cases WHERE case_id = ?`, id);
    return row ? rowToCase(row) : null;
  }

  requireById(caseId: string): CaseRecord {
    const found = this.getById(caseId);
    if (!found) {
      throw new SecurityError('NOT_FOUND', `case ${caseId} does not exist`);
    }
    return found;
  }

  list(scope?: CaseScope): CaseRecord[] {
    if (scope?.kind === 'CASE') {
      const row = this.driver.get<CaseRow>(
        `SELECT ${SELECT_COLUMNS} FROM cases WHERE case_id = ?`,
        scope.caseId
      );
      return row ? [rowToCase(row)] : [];
    }
    const rows = this.driver.all<CaseRow>(`SELECT ${SELECT_COLUMNS} FROM cases ORDER BY created_at DESC`);
    return rows.map(rowToCase);
  }

  update(caseId: string, patch: UpdateCaseInput, scope?: CaseScope): CaseRecord {
    const id = assertCaseId(caseId);

    // Reject unknown keys before touching SQL: mass-assignment defense.
    const entries: Array<[string, unknown]> = Object.entries(patch).filter(([, v]) => v !== undefined);
    for (const [key] of entries) {
      if (!UPDATABLE_FIELDS.has(key)) {
        throw new SecurityError('INPUT_INVALID', `field "${key}" is not updatable on a case`);
      }
    }
    if (entries.length === 0) {
      throw new SecurityError('INPUT_INVALID', 'case update requires at least one field');
    }

    return this.driver.transaction(() => {
      const current = this.getById(id, scope);
      if (!current) {
        throw new SecurityError('NOT_FOUND', `case ${id} does not exist (or is outside scope)`);
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of entries) {
        switch (key) {
          case 'title':
            sets.push('title = ?');
            params.push(assertSafeText(value, 'case title', 256));
            break;
          case 'evidenceTag':
            sets.push('evidence_tag = ?');
            params.push(assertSafeText(value, 'evidence tag', 128));
            break;
          case 'authorizingOfficer':
            sets.push('authorizing_officer = ?');
            params.push(assertSafeText(value, 'authorizing officer', 256));
            break;
          case 'date':
            sets.push('date = ?');
            params.push(assertSafeText(value, 'case date', 64));
            break;
          case 'notes':
            sets.push('notes = ?');
            params.push(assertSafeText(value, 'notes', 4096));
            break;
          case 'classification':
            sets.push('classification = ?');
            params.push(assertSafeText(value, 'classification', 128));
            break;
          case 'driveSerial':
            sets.push('drive_serial = ?');
            params.push(
              value === null ? null : assertSafeText(value, 'drive serial', 256)
            );
            break;
          case 'status':
            sets.push('status = ?');
            params.push(assertCaseStatus(value));
            break;
          case 'mode':
            sets.push('mode = ?');
            params.push(assertCaseMode(value));
            break;
          case 'fleetKey':
            sets.push('fleet_key = ?');
            params.push(value === null ? null : assertSafeText(value, 'fleet key', 128));
            break;
          default:
            throw new SecurityError('INPUT_INVALID', `field "${key}" is not updatable on a case`);
        }
      }

      sets.push('updated_at = ?');
      params.push(assertTimestamp(new Date().toISOString(), 'updated_at'));
      params.push(id);

      this.driver.run(`UPDATE cases SET ${sets.join(', ')} WHERE case_id = ?`, ...params);
      return this.requireById(id);
    });
  }

  remove(caseId: string, scope?: CaseScope): boolean {
    const id = assertCaseId(caseId);
    return this.driver.transaction(() => {
      const current = this.getById(id, scope);
      if (!current) return false;
      try {
        const result = this.driver.run('DELETE FROM cases WHERE case_id = ?', id);
        return result.changes > 0;
      } catch (err) {
        if (err instanceof CyberSanitizeError && err.code === 'CONSTRAINT_VIOLATION') {
          throw new PersistenceError(
            'CONSTRAINT_VIOLATION',
            `case ${id} still has evidence records attached and cannot be removed`
          );
        }
        throw err;
      }
    });
  }
}
