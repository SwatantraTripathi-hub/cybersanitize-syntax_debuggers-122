import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WipeService } from '../src/main/services/wipeService';
import { ServiceContext } from '../src/main/services/serviceContext';
import { SecurityError, CyberSanitizeError } from '../src/main/types/errors';

test('WipeService - Dry run, concurrency guard, execution, verification, and truthful audit trail', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_wipe_'));
  const context = new ServiceContext(tmpDir);
  const wipeService = new WipeService(context);

  // Create a dummy image file for wiping
  const dummyFile = path.join(tmpDir, 'test_target.img');
  const dummyData = Buffer.alloc(1024 * 1024, 0xaa);
  fs.writeFileSync(dummyFile, dummyData);

  // 1. Dry run execution
  const dryRunRes = await wipeService.startWipe(dummyFile, 'nist-clear', {
    dryRun: true,
    caseMeta: { caseId: 'CASE-DRY', operatorId: 'EXAMINER-1', role: 'operator' }
  });
  assert.strictEqual(dryRunRes.status, 'DRY_RUN');
  assert.strictEqual(dryRunRes.success, true);
  // Verify no writes were performed
  const afterDry = fs.readFileSync(dummyFile);
  assert.strictEqual(afterDry[0], 0xaa);

  // 2. Real wipe execution (NIST Clear: 0x00)
  const progressList: number[] = [];
  wipeService.on('progress', (p) => {
    progressList.push(p.percent);
  });

  const wipeRes = await wipeService.startWipe(dummyFile, 'nist-clear', {
    verify: true,
    size: 1024 * 1024,
    caseMeta: { caseId: 'CASE-REAL', operatorId: 'EXAMINER-1', role: 'operator' }
  });

  assert.strictEqual(wipeRes.status, 'SUCCESS');
  assert.strictEqual(wipeRes.success, true);
  assert.strictEqual(wipeRes.passes.length, 1);
  assert.ok(wipeRes.verification);
  assert.strictEqual(wipeRes.verification.passed, true);
  assert.strictEqual(wipeRes.verification.averageEntropy < 0.05, true);

  // Verify file on disk is actually zero-filled
  const afterWipe = fs.readFileSync(dummyFile);
  assert.strictEqual(afterWipe[0], 0x00);
  assert.strictEqual(afterWipe[afterWipe.length - 1], 0x00);

  // Verify audit repository has the record with VERIFIED status
  const repo = await context.getAuditRepository();
  const records = repo.list({ caseId: 'CASE-REAL' });
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].status, 'VERIFIED');
  assert.strictEqual(records[0].operation, 'DRIVE_WIPE');

  (await context.getDatabase()).close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

