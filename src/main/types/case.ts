/**
 * Case (workspace) domain types and case-scoping model.
 *
 * Every query that touches case-specific data must carry an explicit scope.
 * A scope is produced backend-side from validated renderer input — renderer
 * payloads are never trusted directly.
 */

export type CaseStatus = 'ACTIVE' | 'ARCHIVED' | 'IN_PROGRESS';
export type CaseMode = 'SINGLE' | 'MULTI';

export interface CaseRecord {
  caseId: string;
  title: string;
  evidenceTag: string;
  authorizingOfficer: string;
  date: string;
  notes: string;
  classification: string;
  driveSerial: string | null;
  status: CaseStatus;
  mode: CaseMode;
  fleetKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CaseScope =
  | { kind: 'CASE'; caseId: string }
  | { kind: 'ALL' };

export function scopeIncludes(scope: CaseScope, caseId: string): boolean {
  return scope.kind === 'ALL' || scope.caseId === caseId;
}
