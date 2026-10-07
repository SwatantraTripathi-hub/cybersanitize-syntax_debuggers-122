/**
 * Forensic evidence metadata types.
 *
 * Evidence metadata is recorded backend-side and case-scoped; it is never
 * accepted verbatim from the renderer without validation.
 */

export type EvidenceKind = 'DISK_IMAGE' | 'FILE' | 'VOLUME' | 'PHYSICAL_DRIVE' | 'BUNDLE' | 'OTHER';

export const EVIDENCE_KINDS: readonly EvidenceKind[] = Object.freeze([
  'DISK_IMAGE',
  'FILE',
  'VOLUME',
  'PHYSICAL_DRIVE',
  'BUNDLE',
  'OTHER'
]);

export interface EvidenceRecord {
  evidenceId: string;
  case_id: string;
  kind: EvidenceKind;
  source_path: string;
  source_sha256: string | null;
  size_bytes: number;
  operator: string;
  acquired_at: string;
  notes: string;
  created_at: string;
}

export type CustodyAction = 'ACQUIRED' | 'HASHED' | 'TRANSFERRED' | 'ANALYZED' | 'EXPORTED' | 'RETURNED';

export const CUSTODY_ACTIONS: readonly CustodyAction[] = Object.freeze([
  'ACQUIRED',
  'HASHED',
  'TRANSFERRED',
  'ANALYZED',
  'EXPORTED',
  'RETURNED'
]);

export interface CustodyEvent {
  id: number;
  evidence_id: string;
  seq: number;
  at: string;
  actor: string;
  action: CustodyAction;
  note: string;
}

export interface OperatorRecord {
  operatorId: string;
  permissionLevel: import('./security').PermissionLevel;
  displayName: string;
  registeredAt: string;
  registeredBy: string;
}
