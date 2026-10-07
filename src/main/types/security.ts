/**
 * Security decision and permission model.
 *
 * Security decisions are data, not exceptions: guards return an explicit
 * discriminated decision so callers cannot accidentally ignore a denial.
 */

export type SecurityErrorCode =
  | 'INPUT_INVALID'
  | 'INPUT_TOO_LARGE'
  | 'INPUT_UNSUPPORTED'
  | 'HASH_FORMAT_INVALID'
  | 'SIGNATURE_FORMAT_INVALID'
  | 'TARGET_MISSING'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_UNSUPPORTED'
  | 'TARGET_SYSTEM_PROTECTED'
  | 'TARGET_PROTECTION_UNVERIFIABLE'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN_OPERATOR'
  | 'CASE_SCOPE_DENIED';

export type SecurityDecision<T> =
  | { allowed: true; value: T }
  | { allowed: false; code: SecurityErrorCode; message: string };

export type PermissionLevel = 'READ_ONLY' | 'OPERATOR' | 'FULL';

export const PERMISSION_LEVEL_RANK: Readonly<Record<PermissionLevel, number>> = Object.freeze({
  READ_ONLY: 0,
  OPERATOR: 1,
  FULL: 2
});

export type ProtectedOperation =
  | 'AUDIT_READ'
  | 'AUDIT_EXPORT'
  | 'AUDIT_CLEAR'
  | 'CHAIN_VERIFY'
  | 'CASE_CREATE'
  | 'CASE_UPDATE'
  | 'CASE_EXPORT'
  | 'CASE_REMOVE'
  | 'EVIDENCE_CREATE'
  | 'EVIDENCE_READ'
  | 'EVIDENCE_EXPORT'
  | 'OPERATOR_REGISTER'
  | 'TARGET_AUTHORIZE'
  | 'DESTRUCTIVE_WIPE'
  | 'FILE_ERASE';

export interface AuthorizedOperator {
  operatorId: string;
  level: PermissionLevel;
  source: 'registry' | 'role-fallback';
}
