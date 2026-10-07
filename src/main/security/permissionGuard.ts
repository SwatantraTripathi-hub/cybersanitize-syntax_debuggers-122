/**
 * Backend permission guard.
 *
 * Rules:
 *  - renderer-supplied claims (role, clearanceLevel, status, permissionLevel,
 *    tokenHash ...) are UNTRUSTED and never grant privilege by themselves;
 *  - the authoritative source is a backend OperatorRegistry (persisted,
 *    backend-written). Without a registry entry, privileged operations are
 *    denied with UNKNOWN_OPERATOR;
 *  - an optional, OFF-by-default role fallback maps a strict allow-list of
 *    known role strings to permission levels for bootstrap scenarios. Roles
 *    outside the allow-list map to nothing and are denied;
 *  - there is no override flag. Denials are explicit SecurityDecision values.
 */

import {
  AuthorizedOperator,
  PERMISSION_LEVEL_RANK,
  PermissionLevel,
  ProtectedOperation,
  SecurityDecision
} from '../types/security';
import { assertOperatorId, safeEcho } from './inputGuard';

export interface OperatorRegistryLike {
  getLevel(operatorId: string): PermissionLevel | null;
}

export interface PermissionGuardOptions {
  registry?: OperatorRegistryLike | null;
  /** Off by default: role strings are renderer-controlled and grant nothing. */
  allowRoleFallback?: boolean;
}

/** Backend-owned role allow-list used only when role fallback is enabled. */
const ROLE_FALLBACK: Readonly<Record<string, PermissionLevel>> = Object.freeze({
  admin: 'FULL',
  administrator: 'FULL',
  superadmin: 'FULL',
  operator: 'OPERATOR',
  examiner: 'OPERATOR',
  analyst: 'OPERATOR',
  engineer: 'OPERATOR',
  viewer: 'READ_ONLY',
  auditor: 'READ_ONLY',
  observer: 'READ_ONLY',
  'read-only': 'READ_ONLY',
  readonly: 'READ_ONLY'
});

const OPERATION_MIN_LEVEL: Readonly<Record<ProtectedOperation, PermissionLevel>> = Object.freeze({
  AUDIT_READ: 'READ_ONLY',
  CHAIN_VERIFY: 'READ_ONLY',
  EVIDENCE_READ: 'READ_ONLY',
  CASE_CREATE: 'OPERATOR',
  CASE_UPDATE: 'OPERATOR',
  EVIDENCE_CREATE: 'OPERATOR',
  TARGET_AUTHORIZE: 'OPERATOR',
  DESTRUCTIVE_WIPE: 'OPERATOR',
  FILE_ERASE: 'OPERATOR',
  CASE_EXPORT: 'FULL',
  EVIDENCE_EXPORT: 'FULL',
  AUDIT_EXPORT: 'FULL',
  AUDIT_CLEAR: 'FULL',
  CASE_REMOVE: 'FULL',
  OPERATOR_REGISTER: 'FULL'
});

export class PermissionGuard {
  private readonly registry: OperatorRegistryLike | null;
  private readonly allowRoleFallback: boolean;

  constructor(options: PermissionGuardOptions = {}) {
    this.registry = options.registry ?? null;
    this.allowRoleFallback = options.allowRoleFallback === true;
  }

  private resolveLevel(operatorId: string, claims: Record<string, unknown>): {
    level: PermissionLevel;
    source: 'registry' | 'role-fallback';
  } | null {
    if (this.registry) {
      const level = this.registry.getLevel(operatorId);
      if (level) return { level, source: 'registry' };
      if (!this.allowRoleFallback) return null;
    }
    if (this.allowRoleFallback) {
      const role = typeof claims.role === 'string' ? claims.role.trim().toLowerCase() : '';
      const mapped = ROLE_FALLBACK[role];
      if (mapped) return { level: mapped, source: 'role-fallback' };
    }
    return null;
  }

  /**
   * Authorizes an operation for the given raw operator claims.
   * Never throws for untrusted input — returns an explicit denial instead.
   */
  authorize(operation: ProtectedOperation, operatorClaims: unknown): SecurityDecision<AuthorizedOperator> {
    const claims: Record<string, unknown> =
      operatorClaims !== null && typeof operatorClaims === 'object' && !Array.isArray(operatorClaims)
        ? (operatorClaims as Record<string, unknown>)
        : {};

    const rawId = claims.operatorId;
    if (typeof rawId !== 'string' || rawId.length === 0 || rawId.length > 128) {
      return {
        allowed: false,
        code: 'INPUT_INVALID',
        message: 'operator claims must include a well-formed operatorId'
      };
    }
    let operatorId: string;
    try {
      operatorId = assertOperatorId(rawId);
    } catch {
      return {
        allowed: false,
        code: 'INPUT_INVALID',
        message: `operator id is malformed: ${safeEcho(rawId)}`
      };
    }

    const resolved = this.resolveLevel(operatorId, claims);
    if (!resolved) {
      return {
        allowed: false,
        code: 'UNKNOWN_OPERATOR',
        message: `operator ${safeEcho(operatorId)} is not registered in the backend operator registry`
      };
    }

    const required = OPERATION_MIN_LEVEL[operation];
    if (PERMISSION_LEVEL_RANK[resolved.level] < PERMISSION_LEVEL_RANK[required]) {
      return {
        allowed: false,
        code: 'PERMISSION_DENIED',
        message: `operator ${safeEcho(operatorId)} has level ${resolved.level}; ${operation} requires ${required} or higher`
      };
    }

    return {
      allowed: true,
      value: { operatorId, level: resolved.level, source: resolved.source }
    };
  }
}
