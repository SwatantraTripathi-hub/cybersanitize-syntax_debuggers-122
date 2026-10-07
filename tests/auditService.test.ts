import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditService } from '../src/main/services/auditService';
import { ServiceContext } from '../src/main/services/serviceContext';
import { SecurityError } from '../src/main/types/errors';

test('AuditService - Full ledger lifecycle, chain verification, bundle export & verify', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_audit_'));
  const context = new ServiceContext(tmpDir);
  const auditService = new AuditService(context);

  // 1. Record operations
  const op1 = await auditService.recordOperation({
    case_id: 'CASE-001',
    operation: 'DRIVE_WIPE',
    target: '\\\\.\\PhysicalDrive2',
    status: 'COMPLETED',
    operator: 'EXAMINER-1'
  });
  assert.strictEqual(op1.id, 1);
  assert.ok(op1.entry_hash);
  assert.strictEqual(op1.entry_hash.length, 64);
  assert.strictEqual(op1.prev_hash, '0'.repeat(64));

  const op2 = await auditService.recordOperation({
    case_id: 'CASE-001',
    operation: 'FILE_ERASE',
    target: 'C:\\test\\evidence.docx',
    status: 'COMPLETED',
    operator: 'EXAMINER-1'
  });
  assert.strictEqual(op2.id, 2);
  assert.strictEqual(op2.prev_hash, op1.entry_hash);

  // 2. Verify chain integrity
  const verification = await auditService.verifyChain();
  assert.strictEqual(verification.status, 'VALID');
  assert.strictEqual(verification.checkedEntries, 2);

  // 3. Stats query
  const stats = await auditService.getStats('CASE-001');
  assert.strictEqual(stats.total, 2);
  assert.strictEqual(stats.wipes, 1);
  assert.strictEqual(stats.erases, 1);

  // 4. CSV export
  const csvPath = path.join(tmpDir, 'export.csv');
  const csvRes = await auditService.exportCsv(csvPath, 'CASE-001');
  assert.strictEqual(csvRes.success, true);
  assert.strictEqual(csvRes.count, 2);
  assert.ok(fs.existsSync(csvPath));
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  assert.ok(csvContent.includes('CASE-001'));
  assert.ok(csvContent.includes('DRIVE_WIPE'));

  // 5. Sealed Bundle Export & Import Verification
  const bundlePath = path.join(tmpDir, 'evidence.forensic');
  const bundleRes = await auditService.exportBundle('CASE-001', bundlePath);
  assert.strictEqual(bundleRes.success, true);
  assert.ok(fs.existsSync(bundlePath));

  const verifyBundleRes = await auditService.verifyBundle(bundlePath);
  assert.strictEqual(verifyBundleRes.success, true);
  assert.strictEqual(verifyBundleRes.isValid, true);
  assert.strictEqual(verifyBundleRes.checkedEntries, 2);

  // 6. Permission check on clearLogs
  // Unauthorized operator (viewer) must be denied
  await assert.rejects(
    async () => {
      await auditService.clearLogs({ operatorId: 'guest', role: 'viewer' });
    },
    (err: any) => {
      assert.ok(err instanceof SecurityError);
      assert.strictEqual(err.code, 'PERMISSION_DENIED');
      return true;
    }
  );

  // Authorized operator (admin) can clear logs
  const clearRes = await auditService.clearLogs({ operatorId: 'admin', role: 'admin' });
  assert.strictEqual(clearRes.success, true);
  assert.strictEqual(clearRes.clearedCount, 2);

  const statsAfter = await auditService.getStats('CASE-001');
  assert.strictEqual(statsAfter.total, 0);

  (await context.getDatabase()).close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

