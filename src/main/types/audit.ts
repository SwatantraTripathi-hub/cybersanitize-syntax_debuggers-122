/**
 * Audit ledger domain types.
 *
 * Field names intentionally match the persistence schema and the preload API
 * contract (snake_case) so no lossy mapping layer is required.
 */

export type AuditOperationType =
  | 'DRIVE_WIPE'
  | 'FILE_ERASE'
  | 'FILE_RECOVERY'
  | 'WRITE_BLOCKER_VERIFIED'
  | 'EVIDENCE_IMPORT';

export const AUDIT_OPERATION_TYPES: readonly AuditOperationType[] = Object.freeze([
  'DRIVE_WIPE',
  'FILE_ERASE',
  'FILE_RECOVERY',
  'WRITE_BLOCKER_VERIFIED',
  'EVIDENCE_IMPORT'
]);

export type AuditRecordStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VERIFIED';

export const AUDIT_RECORD_STATUSES: readonly AuditRecordStatus[] = Object.freeze([
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'VERIFIED'
]);

export interface AuditRecord {
  id: number;
  case_id: string;
  timestamp: string;
  operation: AuditOperationType;
  target: string;
  details: Record<string, unknown>;
  status: AuditRecordStatus;
  operator: string;
  hash_before: string | null;
  hash_after: string | null;
  verification_result: Record<string, unknown> | null;
  prev_hash: string;
  entry_hash: string;
  signature: string;
}

export interface AuditStats {
  total: number;
  wipes: number;
  erases: number;
  carves: number;
  writeBlockerVerifications: number;
  evidenceImports: number;
  failed: number;
}

export type ChainBreakReason =
  | 'SEQUENCE_INVALID'
  | 'GENESIS_MISMATCH'
  | 'PREV_HASH_MISMATCH'
  | 'HASH_FORMAT_INVALID'
  | 'ENTRY_HASH_MISMATCH'
  | 'SIGNATURE_MISSING'
  | 'SIGNATURE_FORMAT_INVALID'
  | 'SIGNATURE_INVALID';

export type ChainVerificationResult =
  | { status: 'VALID'; checkedEntries: number; tipHash: string }
  | {
      status: 'TAMPERED';
      checkedEntries: number;
      brokenAtId: number | null;
      brokenAtIndex: number;
      reason: ChainBreakReason;
      detail: string;
    };
