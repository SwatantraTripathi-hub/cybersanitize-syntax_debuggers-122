import { test } from 'vitest';
import * as assert from 'node:assert';
import { WriteBlockerService } from '../src/main/services/writeBlockerService';
import { SecurityError } from '../src/main/types/errors';

test('WriteBlockerService - Protection, unprotection and guard assertions', async () => {
  const wb = new WriteBlockerService();

  assert.strictEqual(wb.normalizeDrive('e:'), 'E:');
  assert.strictEqual(wb.normalizeDrive('\\\\.\\E:'), 'E:');
  assert.strictEqual(wb.normalizeDrive('\\\\.\\PhysicalDrive3'), '\\\\.\\PhysicalDrive3');

  // Protect drive E:
  wb.protectDrive('E:');
  assert.strictEqual(wb.isDriveProtected('E:'), true);
  assert.strictEqual(wb.isDriveProtected('\\\\.\\E:'), true);

  // Asserting write on protected drive must throw PERMISSION_DENIED
  assert.throws(
    () => {
      wb.assertWriteAllowed('E:');
    },
    (err: any) => {
      assert.ok(err instanceof SecurityError);
      assert.strictEqual(err.code, 'PERMISSION_DENIED');
      return true;
    }
  );

  // Unprotecting drive
  wb.unprotectDrive('E:');
  assert.strictEqual(wb.isDriveProtected('E:'), false);
  assert.doesNotThrow(() => {
    wb.assertWriteAllowed('E:');
  });

  // Verify write protection returns structured result with cryptographic token
  const result = await wb.verifyWriteProtection('E:');
  assert.ok(result.verifiedAt);
  assert.ok(result.verificationToken);
  assert.strictEqual(result.verificationToken.length, 64);
  assert.strictEqual(typeof result.isWriteProtected, 'boolean');
});

