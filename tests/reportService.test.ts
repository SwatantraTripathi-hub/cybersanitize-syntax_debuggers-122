import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditService } from '../src/main/services/auditService';
import { ReportService } from '../src/main/services/reportService';
import { ServiceContext } from '../src/main/services/serviceContext';
import { SecurityError } from '../src/main/types/errors';

test('ReportService - Authoritative report generation, signature verification, and air-gap verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_report_'));
  const context = new ServiceContext(tmpDir);
  const auditService = new AuditService(context);
  const reportService = new ReportService(context);

  // Attempting to generate report for non-existent operation must fail closed
  await assert.rejects(
    async () => {
      await reportService.generateCertificate(9999);
    },
    (err: any) => {
      assert.ok(err instanceof SecurityError);
      assert.strictEqual(err.code, 'NOT_FOUND');
      return true;
    }
  );

  // Record an actual operation
  const op = await auditService.recordOperation({
    case_id: 'CASE-CORONER-7',
    operation: 'DRIVE_WIPE',
    target: '\\\\.\\PhysicalDrive2',
    status: 'VERIFIED',
    operator: 'EXAMINER-ROOT',
    hash_before: 'a'.repeat(64),
    hash_after: 'b'.repeat(64),
    details: { standard: 'nist-clear', totalBytes: 10485760 }
  });

  // Generate certificate
  const certResult = await reportService.generateCertificate(op.id);
  assert.strictEqual(certResult.success, true);
  assert.ok(fs.existsSync(certResult.filePath));
  assert.ok(fs.existsSync(`${certResult.filePath}.sig`));
  assert.ok(fs.existsSync(certResult.filePath.replace(/\.pdf$/, '_verify.html')));

  // Verify certificate file integrity
  const verifyCheck = reportService.verifyCertificateFile(
    certResult.filePath,
    `${certResult.filePath}.sig`
  );
  assert.strictEqual(verifyCheck.isValid, true);
  assert.strictEqual(verifyCheck.signatureValid, true);
  assert.strictEqual(verifyCheck.hashValid, true);

  // Tampering with the PDF must fail verification
  const pdfBytes = fs.readFileSync(certResult.filePath);
  const tamperedPdf = Buffer.from(pdfBytes);
  tamperedPdf[tamperedPdf.length - 10] ^= 0xff; // Flip bits
  const tamperedPdfPath = path.join(tmpDir, 'tampered.pdf');
  fs.writeFileSync(tamperedPdfPath, tamperedPdf);

  const tamperedCheck = reportService.verifyCertificateFile(
    tamperedPdfPath,
    `${certResult.filePath}.sig`
  );
  assert.strictEqual(tamperedCheck.isValid, false);
  assert.strictEqual(tamperedCheck.hashValid, false);

  // Air-gap QR payload verification
  const sigInfo = JSON.parse(fs.readFileSync(`${certResult.filePath}.sig`, 'utf8'));
  const airGapResult = reportService.verifyAirGapPayload(sigInfo.qrPayload);
  assert.strictEqual(airGapResult.isValid, true);
  assert.strictEqual(airGapResult.signatureValid, true);

  // Tampered air-gap payload must fail
  const tamperedPayloadObj = JSON.parse(sigInfo.qrPayload);
  tamperedPayloadObj.target = 'MODIFIED_TARGET_UNAUTHORIZED';
  const tamperedAirGap = reportService.verifyAirGapPayload(JSON.stringify(tamperedPayloadObj));
  assert.strictEqual(tamperedAirGap.isValid, false);

  (await context.getDatabase()).close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

