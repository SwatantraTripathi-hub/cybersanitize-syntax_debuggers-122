import { describe, expect, it } from 'vitest';
import {
  assertCaseId,
  assertDetailsObject,
  assertEnum,
  assertOptionalSha256,
  assertOperatorId,
  assertTargetText,
  assertTimestamp,
  safeEcho
} from '../../src/main/security/inputGuard';
import { SecurityError } from '../../src/main/types/errors';

function expectSecurityError(fn: () => unknown, codePattern?: RegExp): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SecurityError);
    if (codePattern) expect((err as SecurityError).message).toMatch(codePattern);
    return;
  }
  throw new Error('expected a SecurityError but nothing was thrown');
}

describe('assertCaseId', () => {
  it('accepts reasonable identifiers', () => {
    expect(assertCaseId('CASE-001')).toBe('CASE-001');
    expect(assertCaseId('a')).toBe('a');
    expect(assertCaseId('case_42.v2')).toBe('case_42.v2');
  });

  it('rejects path separators, quotes, spaces, empty and oversized ids', () => {
    expectSecurityError(() => assertCaseId('../etc/passwd'));
    expectSecurityError(() => assertCaseId('CASE/01'));
    expectSecurityError(() => assertCaseId('CASE 01'));
    expectSecurityError(() => assertCaseId('CASE"01'));
    expectSecurityError(() => assertCaseId('CASE;DROP TABLE'));
    expectSecurityError(() => assertCaseId(''));
    expectSecurityError(() => assertCaseId('-leading-dash'));
    expectSecurityError(() => assertCaseId('x'.repeat(65)));
    expectSecurityError(() => assertCaseId(42));
  });
});

describe('assertOperatorId', () => {
  it('accepts email-like operator ids', () => {
    expect(assertOperatorId('alice')).toBe('alice');
    expect(assertOperatorId('alice@lab.example')).toBe('alice@lab.example');
  });

  it('rejects malformed ids', () => {
    expectSecurityError(() => assertOperatorId('a b'));
    expectSecurityError(() => assertOperatorId('../x'));
    expectSecurityError(() => assertOperatorId(''));
    expectSecurityError(() => assertOperatorId(null));
  });
});

describe('assertTimestamp', () => {
  it('accepts ISO-8601 with timezone', () => {
    expect(assertTimestamp('2026-01-01T12:00:00Z')).toBe('2026-01-01T12:00:00Z');
    expect(assertTimestamp('2026-01-01T12:00:00.123+05:30')).toBe('2026-01-01T12:00:00.123+05:30');
  });

  it('rejects non-timestamps and malformed dates', () => {
    expectSecurityError(() => assertTimestamp('yesterday'));
    expectSecurityError(() => assertTimestamp('2026-13-45T99:99:99Z'));
    expectSecurityError(() => assertTimestamp('2026-01-01'));
    expectSecurityError(() => assertTimestamp(1735732800000));
  });
});

describe('assertDetailsObject', () => {
  it('treats undefined/null as an empty object', () => {
    expect(assertDetailsObject(undefined)).toEqual({});
    expect(assertDetailsObject(null)).toEqual({});
  });

  it('accepts plain objects', () => {
    expect(assertDetailsObject({ passes: 3 })).toEqual({ passes: 3 });
  });

  it('rejects arrays, scalars and JSON-unsafe values', () => {
    expectSecurityError(() => assertDetailsObject([1, 2, 3]));
    expectSecurityError(() => assertDetailsObject('string'));
    expectSecurityError(() => assertDetailsObject({ n: NaN }));
    expectSecurityError(() => assertDetailsObject({ n: BigInt(1) }));
  });

  it('rejects payloads above the size limit', () => {
    const big = { blob: 'x'.repeat(70 * 1024) };
    expectSecurityError(() => assertDetailsObject(big));
  });
});

describe('assertOptionalSha256', () => {
  it('passes through null/undefined and normalizes case', () => {
    expect(assertOptionalSha256(null, 'h')).toBeNull();
    expect(assertOptionalSha256(undefined, 'h')).toBeNull();
    expect(assertOptionalSha256('A'.repeat(64), 'h')).toBe('a'.repeat(64));
  });

  it('rejects malformed digests', () => {
    expectSecurityError(() => assertOptionalSha256('short', 'h'));
    expectSecurityError(() => assertOptionalSha256('z'.repeat(64), 'h'));
    expectSecurityError(() => assertOptionalSha256(123, 'h'));
  });
});

describe('assertTargetText', () => {
  it('accepts paths and device syntax', () => {
    expect(assertTargetText('E:\\evidence\\disk.dd')).toContain('evidence');
    expect(assertTargetText('\\\\.\\PhysicalDrive1')).toContain('PhysicalDrive');
  });

  it('rejects control characters and oversized text', () => {
    expectSecurityError(() => assertTargetText('path\u0000with-nul'));
    expectSecurityError(() => assertTargetText('line\nbreak'));
    expectSecurityError(() => assertTargetText('x'.repeat(5000)));
  });
});

describe('assertEnum', () => {
  it('accepts listed values and rejects others', () => {
    expect(assertEnum('DRIVE_WIPE', ['DRIVE_WIPE', 'FILE_ERASE'] as const, 'op')).toBe('DRIVE_WIPE');
    expectSecurityError(() => assertEnum('DROP_TABLE', ['DRIVE_WIPE'] as const, 'op'));
    expectSecurityError(() => assertEnum(7, ['DRIVE_WIPE'] as const, 'op'));
  });
});

describe('safeEcho', () => {
  it('strips control characters and bounds length', () => {
    expect(safeEcho('a\u0000b')).toBe('a?b');
    expect(safeEcho('x'.repeat(200)).length).toBeLessThanOrEqual(65);
  });

  it('never throws on non-string input', () => {
    expect(() => safeEcho({ a: 1 })).not.toThrow();
    expect(() => safeEcho(null)).not.toThrow();
  });
});
