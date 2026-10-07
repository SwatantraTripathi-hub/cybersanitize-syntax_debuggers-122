import { test } from 'vitest';
import * as assert from 'node:assert';
import {
  assertCaseId,
  assertOperatorId,
  assertSafeText,
  assertEnum,
  assertNonNegativeInteger,
  assertPositiveInteger,
  assertDetailsObject
} from '../src/main/security/inputGuard';
import { SecurityError } from '../src/main/types/errors';

test('IPC Security - Boundary validation of untrusted renderer inputs', () => {
  // 1. Case ID validation
  assert.strictEqual(assertCaseId('CASE-2026_01'), 'CASE-2026_01');
  assert.throws(
    () => assertCaseId(''),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );
  assert.throws(
    () => assertCaseId('../../../etc/passwd'),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );
  assert.throws(
    () => assertCaseId('a'.repeat(65)),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_TOO_LARGE'
  );

  // 2. Operator ID validation
  assert.strictEqual(assertOperatorId('examiner@agency.gov'), 'examiner@agency.gov');
  assert.throws(
    () => assertOperatorId('\x00admin'),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );

  // 3. Safe text and control characters rejection
  assert.strictEqual(assertSafeText('C:\\valid\\path.dd', 'path', 100), 'C:\\valid\\path.dd');
  assert.throws(
    () => assertSafeText('C:\\bad\x00\\path.dd', 'path', 100),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );

  // 4. Enum validation
  const validOps = ['DRIVE_WIPE', 'FILE_ERASE', 'FILE_RECOVERY'] as const;
  assert.strictEqual(assertEnum('DRIVE_WIPE', validOps, 'operation'), 'DRIVE_WIPE');
  assert.throws(
    () => assertEnum('UNKNOWN_OP', validOps, 'operation'),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );

  // 5. Numeric ranges
  assert.strictEqual(assertNonNegativeInteger(0, 'offset'), 0);
  assert.strictEqual(assertNonNegativeInteger(50, 'limit'), 50);
  assert.throws(
    () => assertNonNegativeInteger(-1, 'offset'),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );
  assert.throws(
    () => assertPositiveInteger(0, 'size'),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_INVALID'
  );

  // 6. Oversized details payload rejection
  const hugeObj: Record<string, string> = {};
  for (let i = 0; i < 2000; i++) {
    hugeObj[`key_${i}`] = 'x'.repeat(100);
  }
  assert.throws(
    () => assertDetailsObject(hugeObj, 'details', 10 * 1024),
    (err: any) => err instanceof SecurityError && err.code === 'INPUT_TOO_LARGE'
  );
});

