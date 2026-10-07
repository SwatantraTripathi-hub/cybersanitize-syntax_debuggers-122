/**
 * Case isolation guard.
 *
 * Renderer payloads may claim any case id. The backend converts raw input
 * into a validated CaseScope and enforces it on every case-scoped read/write
 * so Case A can never read, modify or export Case B's records.
 */

import { CaseScope, scopeIncludes } from '../types/case';
import { SecurityError } from '../types/errors';
import { assertCaseId, safeEcho } from './inputGuard';

/**
 * Resolves raw renderer input into a scope.
 *  - undefined/null  -> ALL (explicitly requesting the unscoped view)
 *  - a string        -> validated CASE scope
 *  - anything else   -> INPUT_INVALID (ambiguous input never falls through)
 */
export function resolveCaseScope(rawCaseId: unknown): CaseScope {
  if (rawCaseId === undefined || rawCaseId === null) return { kind: 'ALL' };
  if (typeof rawCaseId === 'string' && rawCaseId.trim() === '') {
    throw new SecurityError('INPUT_INVALID', 'case id must not be empty; omit it for the unscoped view');
  }
  return { kind: 'CASE', caseId: assertCaseId(rawCaseId) };
}

export function scopeIncludesCase(scope: CaseScope, caseId: string): boolean {
  return scopeIncludes(scope, caseId);
}

/** Throws CASE_SCOPE_DENIED when a record belongs to a case outside the scope. */
export function assertInScope(scope: CaseScope, recordCaseId: string): void {
  if (!scopeIncludes(scope, recordCaseId)) {
    throw new SecurityError(
      'CASE_SCOPE_DENIED',
      `record belongs to case ${safeEcho(recordCaseId)} which is outside the authorized scope`
    );
  }
}
