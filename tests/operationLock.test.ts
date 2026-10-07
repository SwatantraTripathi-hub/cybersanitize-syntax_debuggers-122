import { test } from 'vitest';
import * as assert from 'node:assert';
import { OperationLockService } from '../src/main/services/operationLock';
import { CyberSanitizeError } from '../src/main/types/errors';

test('OperationLockService - Target normalization and concurrent lock protection', () => {
  const lockService = new OperationLockService();

  // Test target normalization
  assert.strictEqual(lockService.normalizeTarget('\\\\.\\PhysicalDrive1'), 'PHYSICAL_DRIVE_1');
  assert.strictEqual(lockService.normalizeTarget('\\\\.\\D:'), 'VOLUME_D');
  assert.strictEqual(lockService.normalizeTarget('D:'), 'VOLUME_D');
  assert.strictEqual(lockService.normalizeTarget('d:\\'), 'VOLUME_D');

  // Acquire lock on physical drive
  const lock1 = lockService.acquireLock('\\\\.\\PhysicalDrive1', 'WIPE');
  assert.strictEqual(lockService.isLocked('\\\\.\\PhysicalDrive1'), true);

  // Attempting duplicate lock must throw PERSISTENCE_BUSY
  assert.throws(
    () => {
      lockService.acquireLock('\\\\.\\PhysicalDrive1', 'WIPE');
    },
    (err: any) => {
      assert.ok(err instanceof CyberSanitizeError);
      assert.strictEqual(err.code, 'PERSISTENCE_BUSY');
      return true;
    }
  );

  // Releasing lock must free target
  lock1.release();
  assert.strictEqual(lockService.isLocked('\\\\.\\PhysicalDrive1'), false);

  // Can acquire again after release
  const lock2 = lockService.acquireLock('\\\\.\\PhysicalDrive1', 'CARVE');
  assert.strictEqual(lockService.isLocked('\\\\.\\PhysicalDrive1'), true);
  lock2.release();
});

