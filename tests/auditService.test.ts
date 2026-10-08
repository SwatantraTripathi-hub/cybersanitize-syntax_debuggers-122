import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditService } from '../src/main/services/auditService';

test('AuditService seals, scopes, exports, and detects ledger tampering', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_audit_'));
  const auditService = new AuditService(path.join(tmpDir, 'audit.db'));

  const operation = {
    timestamp: new Date().toISOString(),
    operation: 'DRIVE_WIPE' as const,
    target: '\\\\.\\PhysicalDrive2',
    details: { caseId: 'CASE-001', caseTitle: 'Test Case', evidenceTag: 'EVD-001' },
    status: 'COMPLETED' as const,
    operator: 'EXAMINER-1',
    hash_before: 'a'.repeat(64),
    hash_after: 'b'.repeat(64),
    verification_result: { verified: true }
  };
  const firstId = auditService.logOperation(operation);
  auditService.logOperation({ ...operation, operation: 'FILE_ERASE', target: 'C:\\test\\evidence.docx' });

  assert.strictEqual(firstId, 1);
  assert.strictEqual(auditService.verifyLedgerIntegrity().intact, true);
  assert.strictEqual(auditService.getStats('CASE-001').total, 2);
  assert.strictEqual(auditService.getStats('OTHER-CASE').total, 0);

  const bundle = await auditService.exportForensicBundle('CASE-001', path.join(tmpDir, 'reports'));
  assert.ok(fs.existsSync(bundle.bundlePath));
  const verified = await auditService.verifyForensicBundle(bundle.bundlePath);
  assert.strictEqual(verified.isValid, true);
  assert.strictEqual(verified.chainIntact, true);
  assert.strictEqual(verified.caseId, 'CASE-001');

  const chainPath = path.join(tmpDir, 'audit.cschain');
  const chainExport = auditService.exportChain(chainPath, 'CASE-001');
  assert.strictEqual(chainExport.success, true);
  assert.strictEqual(auditService.verifyChainExport(chainPath).isValid, true);
  const chainEnvelope = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
  chainEnvelope.payload.blocks[0].target = 'C:\\tampered-in-export';
  fs.writeFileSync(chainPath, JSON.stringify(chainEnvelope), 'utf8');
  assert.strictEqual(auditService.verifyChainExport(chainPath).isValid, false);

  if ((auditService as any).db) {
    (auditService as any).db.prepare("UPDATE audit_logs SET target = 'C:\\tampered' WHERE id = 1").run();
  } else {
    (auditService as any).memoryLogs[0].target = 'C:\\tampered';
  }
  const tampered = auditService.verifyLedgerIntegrity();
  assert.strictEqual(tampered.intact, false);
  assert.strictEqual(tampered.brokenAtId, 1);

  auditService.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

