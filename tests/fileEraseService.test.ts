import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileEraseService } from '../src/main/services/fileEraseService';
import { ServiceContext } from '../src/main/services/serviceContext';

test('FileEraseService - Multi-file and directory shredding with audit logging', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_erase_'));
  const context = new ServiceContext(tmpDir);
  const eraseService = new FileEraseService(context);

  // Setup files to shred
  const file1 = path.join(tmpDir, 'secret1.txt');
  const file2 = path.join(tmpDir, 'secret2.txt');
  fs.writeFileSync(file1, 'TOP SECRET DATA 1');
  fs.writeFileSync(file2, 'TOP SECRET DATA 2');

  const res = await eraseService.startFileErase([file1, file2], 'nist-clear', {
    caseId: 'CASE-SHRED',
    operatorId: 'EXAMINER-1',
    role: 'operator',
    cleanMetadata: false
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'SUCCESS');
  assert.strictEqual(res.filesProcessed, 2);
  assert.strictEqual(fs.existsSync(file1), false);
  assert.strictEqual(fs.existsSync(file2), false);

  // Verify audit log
  const repo = await context.getAuditRepository();
  const logs = repo.list({ caseId: 'CASE-SHRED' });
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].operation, 'FILE_ERASE');
  assert.strictEqual(logs[0].status, 'COMPLETED');

  (await context.getDatabase()).close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

