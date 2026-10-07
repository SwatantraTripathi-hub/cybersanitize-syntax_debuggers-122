import { describe, expect, it } from 'vitest';
import { PermissionGuard } from '../../src/main/security/permissionGuard';
import type { OperatorRegistryLike } from '../../src/main/security/permissionGuard';

const registry: OperatorRegistryLike = {
  getLevel(id) {
    if (id === 'admin1') return 'FULL';
    if (id === 'op1') return 'OPERATOR';
    if (id === 'viewer1') return 'READ_ONLY';
    return null;
  }
};

describe('PermissionGuard', () => {
  it('grants when the backend registry has sufficient level', () => {
    const guard = new PermissionGuard({ registry });
    const decision = guard.authorize('DESTRUCTIVE_WIPE', { operatorId: 'op1' });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.value.level).toBe('OPERATOR');
      expect(decision.value.source).toBe('registry');
    }
  });

  it('denies when the registry level is too low', () => {
    const guard = new PermissionGuard({ registry });
    const decision = guard.authorize('AUDIT_CLEAR', { operatorId: 'op1' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('PERMISSION_DENIED');
  });

  it('denies unknown operators (no registry entry = no privilege)', () => {
    const guard = new PermissionGuard({ registry });
    const decision = guard.authorize('AUDIT_READ', { operatorId: 'stranger' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('UNKNOWN_OPERATOR');
  });

  it('ignores renderer-supplied privilege claims entirely', () => {
    const guard = new PermissionGuard({ registry });
    const decision = guard.authorize('AUDIT_CLEAR', {
      operatorId: 'stranger',
      role: 'admin',
      permissionLevel: 'FULL',
      clearanceLevel: 5,
      status: 'authenticated',
      tokenHash: 'deadbeef'
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('UNKNOWN_OPERATOR');
  });

  it('never grants anything without a registry when role fallback is off (default)', () => {
    const guard = new PermissionGuard();
    const decision = guard.authorize('AUDIT_READ', { operatorId: 'anyone', role: 'admin' });
    expect(decision.allowed).toBe(false);
  });

  it('role fallback (opt-in) only maps the strict backend allow-list', () => {
    const guard = new PermissionGuard({ allowRoleFallback: true });
    const allowed = guard.authorize('AUDIT_READ', { operatorId: 'boot1', role: 'auditor' });
    expect(allowed.allowed).toBe(true);

    const denied = guard.authorize('AUDIT_READ', { operatorId: 'boot1', role: 'supreme-ruler' });
    expect(denied.allowed).toBe(false);
  });

  it('role fallback still never overrides the level requirement', () => {
    const guard = new PermissionGuard({ allowRoleFallback: true });
    const decision = guard.authorize('OPERATOR_REGISTER', { operatorId: 'boot1', role: 'viewer' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('PERMISSION_DENIED');
  });

  it('returns INPUT_INVALID for malformed operator ids instead of throwing', () => {
    const guard = new PermissionGuard({ registry });
    for (const claims of [null, undefined, 'string', 42, [], { operatorId: '' }, { operatorId: '../x' }]) {
      const decision = guard.authorize('AUDIT_READ', claims);
      expect(decision.allowed).toBe(false);
    }
  });

  it('registry entries win over role fallback when both are present', () => {
    const guard = new PermissionGuard({ registry, allowRoleFallback: true });
    const decision = guard.authorize('CHAIN_VERIFY', { operatorId: 'viewer1', role: 'admin' });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.value.level).toBe('READ_ONLY');
      expect(decision.value.source).toBe('registry');
    }
  });
});
