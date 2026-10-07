import { describe, expect, it } from 'vitest';
import { assertInScope, resolveCaseScope } from '../../src/main/security/caseGuard';
import { SecurityError } from '../../src/main/types/errors';

describe('resolveCaseScope', () => {
  it('maps undefined/null to the explicit ALL scope', () => {
    expect(resolveCaseScope(undefined)).toEqual({ kind: 'ALL' });
    expect(resolveCaseScope(null)).toEqual({ kind: 'ALL' });
  });

  it('maps a valid id to a CASE scope', () => {
    expect(resolveCaseScope('CASE-1')).toEqual({ kind: 'CASE', caseId: 'CASE-1' });
  });

  it('rejects an empty string rather than silently selecting ALL', () => {
    expect(() => resolveCaseScope('')).toThrow(SecurityError);
    expect(() => resolveCaseScope('   ')).toThrow(SecurityError);
  });

  it('rejects malformed and non-string ids', () => {
    expect(() => resolveCaseScope('../other')).toThrow(SecurityError);
    expect(() => resolveCaseScope("CASE'; DROP TABLE")).toThrow(SecurityError);
    expect(() => resolveCaseScope(42)).toThrow(SecurityError);
    expect(() => resolveCaseScope({})).toThrow(SecurityError);
  });
});

describe('assertInScope', () => {
  it('passes everything under ALL', () => {
    expect(() => assertInScope({ kind: 'ALL' }, 'anything')).not.toThrow();
  });

  it('passes only the matching case under CASE', () => {
    const scope = { kind: 'CASE', caseId: 'CASE-1' } as const;
    expect(() => assertInScope(scope, 'CASE-1')).not.toThrow();
    expect(() => assertInScope(scope, 'CASE-2')).toThrow(SecurityError);
  });

  it('denials carry the CASE_SCOPE_DENIED code', () => {
    try {
      assertInScope({ kind: 'CASE', caseId: 'A' }, 'B');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SecurityError);
      expect((err as SecurityError).code).toBe('CASE_SCOPE_DENIED');
    }
  });
});
