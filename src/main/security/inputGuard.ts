/**
 * Backend validation of untrusted renderer/IPC input.
 *
 * Everything that crosses the IPC boundary is attacker-controlled input as far
 * as the backend is concerned: case ids, operator ids, target paths, hashes,
 * enum values, details payloads and pagination. Validation happens here —
 * never only in React.
 *
 * All validators throw SecurityError with an explicit code on failure
 * (fail closed) and return the normalized value on success.
 */

import { canonicalizeJson } from '../crypto/canonical';
import { SecurityError } from '../types/errors';
import { AuditOperationType, AuditRecordStatus, AUDIT_OPERATION_TYPES, AUDIT_RECORD_STATUSES } from '../types/audit';
import { CaseMode, CaseStatus } from '../types/case';
import { EvidenceKind, EVIDENCE_KINDS, CustodyAction, CUSTODY_ACTIONS } from '../types/evidence';
import { PermissionLevel } from '../types/security';

const CASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OPERATOR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

function invalid(message: string): never {
  throw new SecurityError('INPUT_INVALID', message);
}

function tooLarge(message: string): never {
  throw new SecurityError('INPUT_TOO_LARGE', message);
}

export function assertString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') invalid(`${label} must be a string`);
  if (value.length === 0) invalid(`${label} must not be empty`);
  if (value.length > maxLength) tooLarge(`${label} must be at most ${maxLength} characters`);
  return value;
}

/** Rejects control characters (including NUL) — paths, names, display text. */
export function assertSafeText(value: unknown, label: string, maxLength: number): string {
  const text = assertString(value, label, maxLength);
  if (CONTROL_CHARS_RE.test(text)) invalid(`${label} contains control characters`);
  return text;
}

/**
 * Optional free text (notes, tags, dates): undefined/null normalize to '' and
 * empty strings are allowed, but non-strings, control characters and oversized
 * input are still rejected. Required fields must use assertSafeText.
 */
export function assertOptionalSafeText(value: unknown, label: string, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') invalid(`${label} must be a string`);
  if (value.length > maxLength) tooLarge(`${label} must be at most ${maxLength} characters`);
  if (CONTROL_CHARS_RE.test(value)) invalid(`${label} contains control characters`);
  return value;
}

/** Case ids are identifiers, not paths: strictly delimited charset, no separators. */
export function assertCaseId(value: unknown): string {
  const id = assertString(value, 'case id', 64);
  if (!CASE_ID_RE.test(id)) {
    invalid('case id must be 1-64 chars of [A-Za-z0-9._-] and start with a letter or digit');
  }
  return id;
}

export function assertOperatorId(value: unknown): string {
  const id = assertString(value, 'operator id', 128);
  if (!OPERATOR_ID_RE.test(id)) {
    invalid('operator id must be 1-128 chars of [A-Za-z0-9._@-] and start with a letter or digit');
  }
  return id;
}

/** Strict ISO-8601 timestamp validation (renderer-supplied timestamps are untrusted). */
export function assertTimestamp(value: unknown, label = 'timestamp'): string {
  const text = assertString(value, label, 64);
  if (!TIMESTAMP_RE.test(text) || Number.isNaN(Date.parse(text))) {
    invalid(`${label} must be an ISO-8601 timestamp`);
  }
  return text;
}

export function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    invalid(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative integer`);
  }
  return value;
}

export function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(`${label} must be a positive integer`);
  }
  return value;
}

export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be a boolean`);
  return value;
}

/**
 * Details/verification payloads must be plain, canonicalizable and bounded.
 * Rejects oversized payloads and JSON-unsafe values before they reach the
 * hash chain or the database.
 */
export function assertDetailsObject(value: unknown, label = 'details', maxBytes = 64 * 1024): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be a plain object`);
  }
  let canonical: string;
  try {
    canonical = canonicalizeJson(value);
  } catch (err) {
    throw err;
  }
  const byteLength = Buffer.byteLength(canonical, 'utf8');
  if (byteLength > maxBytes) {
    tooLarge(`${label} is ${byteLength} bytes when canonicalized (max ${maxBytes})`);
  }
  return value as Record<string, unknown>;
}

/** Target text recorded in audit records: bounded, no control characters. */
export function assertTargetText(value: unknown): string {
  return assertSafeText(value, 'target', 4096);
}

export const assertAuditOperation = (value: unknown): AuditOperationType =>
  assertEnum(value, AUDIT_OPERATION_TYPES, 'operation');

export const assertAuditStatus = (value: unknown): AuditRecordStatus =>
  assertEnum(value, AUDIT_RECORD_STATUSES, 'status');

export const assertCaseStatus = (value: unknown): CaseStatus =>
  assertEnum(value, ['ACTIVE', 'ARCHIVED', 'IN_PROGRESS'] as const, 'case status');

export const assertCaseMode = (value: unknown): CaseMode =>
  assertEnum(value, ['SINGLE', 'MULTI'] as const, 'case mode');

export const assertEvidenceKind = (value: unknown): EvidenceKind =>
  assertEnum(value, EVIDENCE_KINDS, 'evidence kind');

export const assertCustodyAction = (value: unknown): CustodyAction =>
  assertEnum(value, CUSTODY_ACTIONS, 'custody action');

export const assertPermissionLevel = (value: unknown): PermissionLevel =>
  assertEnum(value, ['READ_ONLY', 'OPERATOR', 'FULL'] as const, 'permission level');

/** Optional hash: null/undefined stay null; strings must be real SHA-256 hex. */
export function assertOptionalSha256(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new SecurityError('HASH_FORMAT_INVALID', `${label} must be a 64-character hex SHA-256 digest`);
  }
  return value.toLowerCase();
}

/** Shortens and strips control characters from untrusted text before it is echoed in errors/logs. */
export function safeEcho(value: unknown, maxLength = 64): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  const cleaned = text.replace(CONTROL_CHARS_RE, '?');
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}
