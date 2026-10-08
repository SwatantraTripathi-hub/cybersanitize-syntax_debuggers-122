import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditService } from '../src/main/services/auditService';
import { ReportService } from '../src/main/services/reportService';

test('ReportService generates LAN-only certificates and detects PDF tampering', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_report_'));
  const auditService = new AuditService(path.join(tmpDir, 'audit.db'));
  const reportService = new ReportService(auditService);
  const id = auditService.logOperation({
    timestamp: new Date().toISOString(),
    operation: 'DRIVE_WIPE',
    target: '\\\\.\\PhysicalDrive2',
    status: 'VERIFIED',
    operator: 'EXAMINER-ROOT',
    hash_before: 'a'.repeat(64),
    hash_after: 'b'.repeat(64),
    verification_result: { verified: true },
    details: { caseId: 'CASE-CORONER-7', caseTitle: 'Test Case', evidenceTag: 'EVD-007', standard: 'nist-clear' }
  });

  const operation = auditService.getOperationById(id);
  assert.ok(operation);
  const certPath = await reportService.generateCertificate(operation!);
  const signaturePath = `${certPath}.sig`;
  assert.ok(fs.existsSync(certPath));
  assert.ok(fs.existsSync(signaturePath));
  assert.strictEqual(fs.existsSync(certPath.replace(/\.pdf$/, '_verify.html')), false);

  const sigInfo = JSON.parse(fs.readFileSync(signaturePath, 'utf8'));
  assert.ok(sigInfo.verifyUrl.startsWith('http://'));
  assert.strictEqual('qrPayload' in sigInfo, false);
  const pdfBytes = fs.readFileSync(certPath);
  assert.strictEqual(reportService.verifyCertificateHash(certPath).isValid, true);
  assert.strictEqual(reportService.verifySignature(pdfBytes, sigInfo.pdfSignature, sigInfo.publicKey), true);

  const tampered = Buffer.from(pdfBytes);
  tampered[tampered.length - 10] ^= 0xff;
  const tamperedPath = path.join(tmpDir, 'tampered.pdf');
  fs.writeFileSync(tamperedPath, tampered);
  assert.strictEqual(reportService.verifyCertificateHash(tamperedPath).isValid, false);
  assert.strictEqual(reportService.verifySignature(tampered, sigInfo.pdfSignature, sigInfo.publicKey), false);

  auditService.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

