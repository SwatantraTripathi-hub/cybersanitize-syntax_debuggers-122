/**
 * Evidence and chain-of-custody repository.
 *
 * Custody events are append-only with a per-evidence sequence number that is
 * allocated inside the same transaction as the insert, so two concurrent
 * events can never share a sequence. Deleting an evidence row cascades its
 * custody history (FK ON DELETE CASCADE) — evidence without custody history
 * is never left behind.
 */

import {
  CustodyAction,
  CustodyEvent,
  EvidenceKind,
  EvidenceRecord
} from '../../types/evidence';
import { CaseScope } from '../../types/case';
import { SecurityError } from '../../types/errors';
import {
  assertCustodyAction,
  assertEvidenceKind,
  assertNonNegativeInteger,
  assertOperatorId,
  assertOptionalSafeText,
  assertOptionalSha256,
  assertSafeText,
  assertTimestamp
} from '../../security/inputGuard';
import { assertCaseId } from '../../security/inputGuard';
import type { Driver } from '../driver';

interface EvidenceRow {
  evidence_id: string;
  case_id: string;
  kind: string;
  source_path: string;
  source_sha256: string | null;
  size_bytes: number;
  operator: string;
  acquired_at: string;
  notes: string;
  created_at: string;
}

interface CustodyRow {
  id: number;
  evidence_id: string;
  seq: number;
  at: string;
  actor: string;
  action: string;
  note: string;
}

function rowToEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    evidenceId: row.evidence_id,
    case_id: row.case_id,
    kind: row.kind as EvidenceKind,
    source_path: row.source_path,
    source_sha256: row.source_sha256,
    size_bytes: Number(row.size_bytes),
    operator: row.operator,
    acquired_at: row.acquired_at,
    notes: row.notes,
    created_at: row.created_at
  };
}

function rowToCustody(row: CustodyRow): CustodyEvent {
  return {
    id: row.id,
    evidence_id: row.evidence_id,
    seq: row.seq,
    at: row.at,
    actor: row.actor,
    action: row.action as CustodyAction,
    note: row.note
  };
}

export interface CreateEvidenceInput {
  evidenceId: string;
  caseId: string;
  kind: EvidenceKind;
  sourcePath: string;
  sourceSha256?: string | null;
  sizeBytes: number;
  operator: string;
  acquiredAt?: string;
  notes?: string;
}

export interface AppendCustodyInput {
  evidenceId: string;
  actor: string;
  action: CustodyAction;
  note?: string;
  at?: string;
}

const EVIDENCE_SELECT =
  'evidence_id, case_id, kind, source_path, source_sha256, size_bytes, operator, acquired_at, notes, created_at';

const CUSTODY_SELECT = 'id, evidence_id, seq, at, actor, action, note';

export class EvidenceRepository {
  constructor(private readonly driver: Driver) {}

  create(input: CreateEvidenceInput): EvidenceRecord {
    const evidenceId = assertSafeText(input.evidenceId, 'evidence id', 128);
    const caseId = assertCaseId(input.caseId);
    const kind = assertEvidenceKind(input.kind);
    const sourcePath = assertSafeText(input.sourcePath, 'source path', 4096);
    const sourceSha256 = assertOptionalSha256(input.sourceSha256, 'source sha256');
    const sizeBytes = assertNonNegativeInteger(input.sizeBytes, 'size bytes');
    const operator = assertOperatorId(input.operator);
    const acquiredAt =
      input.acquiredAt === undefined ? new Date().toISOString() : assertTimestamp(input.acquiredAt, 'acquired_at');
    const notes = assertOptionalSafeText(input.notes, 'evidence notes', 4096);
    const now = new Date().toISOString();

    return this.driver.transaction(() => {
      const caseRow = this.driver.get<{ case_id: string }>(
        'SELECT case_id FROM cases WHERE case_id = ?',
        caseId
      );
      if (!caseRow) {
        throw new SecurityError('NOT_FOUND', `cannot attach evidence: case ${caseId} does not exist`);
      }
      const existing = this.driver.get<{ evidence_id: string }>(
        'SELECT evidence_id FROM evidence WHERE evidence_id = ?',
        evidenceId
      );
      if (existing) {
        throw new SecurityError('CONSTRAINT_VIOLATION', `evidence ${evidenceId} already exists`);
      }

      this.driver.run(
        `INSERT INTO evidence (
           evidence_id, case_id, kind, source_path, source_sha256, size_bytes,
           operator, acquired_at, notes, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        evidenceId,
        caseId,
        kind,
        sourcePath,
        sourceSha256,
        sizeBytes,
        operator,
        acquiredAt,
        notes,
        now
      );

      this.driver.run(
        `INSERT INTO custody_events (evidence_id, seq, at, actor, action, note) VALUES (?, ?, ?, ?, ?, ?)`,
        evidenceId,
        1,
        acquiredAt,
        operator,
        'ACQUIRED',
        'initial acquisition record'
      );

      return this.requireById(evidenceId);
    });
  }

  getById(evidenceId: string, scope?: CaseScope): EvidenceRecord | null {
    const id = assertSafeText(evidenceId, 'evidence id', 128);
    const row = this.driver.get<EvidenceRow>(
      `SELECT ${EVIDENCE_SELECT} FROM evidence WHERE evidence_id = ?`,
      id
    );
    if (!row) return null;
    if (scope?.kind === 'CASE' && scope.caseId !== row.case_id) return null;
    return rowToEvidence(row);
  }

  requireById(evidenceId: string, scope?: CaseScope): EvidenceRecord {
    const found = this.getById(evidenceId, scope);
    if (!found) {
      throw new SecurityError('NOT_FOUND', `evidence ${evidenceId} does not exist (or is outside scope)`);
    }
    return found;
  }

  listByCase(scope?: CaseScope): EvidenceRecord[] {
    if (scope?.kind === 'CASE') {
      const rows = this.driver.all<EvidenceRow>(
        `SELECT ${EVIDENCE_SELECT} FROM evidence WHERE case_id = ? ORDER BY acquired_at DESC`,
        scope.caseId
      );
      return rows.map(rowToEvidence);
    }
    const rows = this.driver.all<EvidenceRow>(
      `SELECT ${EVIDENCE_SELECT} FROM evidence ORDER BY acquired_at DESC`
    );
    return rows.map(rowToEvidence);
  }

  appendCustody(input: AppendCustodyInput, scope?: CaseScope): CustodyEvent {
    const evidenceId = assertSafeText(input.evidenceId, 'evidence id', 128);
    const actor = assertOperatorId(input.actor);
    const action = assertCustodyAction(input.action);
    const note = assertOptionalSafeText(input.note, 'custody note', 4096);
    const at = input.at === undefined ? new Date().toISOString() : assertTimestamp(input.at, 'at');

    return this.driver.transaction(() => {
      this.requireById(evidenceId, scope);

      const maxRow = this.driver.get<{ max_seq: number | null }>(
        'SELECT MAX(seq) AS max_seq FROM custody_events WHERE evidence_id = ?',
        evidenceId
      );
      const nextSeq = Number(maxRow?.max_seq ?? 0) + 1;

      const result = this.driver.run(
        'INSERT INTO custody_events (evidence_id, seq, at, actor, action, note) VALUES (?, ?, ?, ?, ?, ?)',
        evidenceId,
        nextSeq,
        at,
        actor,
        action,
        note
      );

      return {
        id: result.lastInsertRowid,
        evidence_id: evidenceId,
        seq: nextSeq,
        at,
        actor,
        action,
        note
      };
    });
  }

  /** Full custody history in sequence order (scope-checked against the parent). */
  getCustodyHistory(evidenceId: string, scope?: CaseScope): CustodyEvent[] {
    this.requireById(evidenceId, scope);
    const rows = this.driver.all<CustodyRow>(
      `SELECT ${CUSTODY_SELECT} FROM custody_events WHERE evidence_id = ? ORDER BY seq ASC`,
      evidenceId
    );
    return rows.map(rowToCustody);
  }

  remove(evidenceId: string, scope?: CaseScope): boolean {
    const id = assertSafeText(evidenceId, 'evidence id', 128);
    return this.driver.transaction(() => {
      this.requireById(id, scope);
      const result = this.driver.run('DELETE FROM evidence WHERE evidence_id = ?', id);
      return result.changes > 0;
    });
  }
}
