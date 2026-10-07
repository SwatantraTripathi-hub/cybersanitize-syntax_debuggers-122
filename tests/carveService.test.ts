import { test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CarveService, SIGNATURES } from '../src/main/services/carveService';
import { ServiceContext } from '../src/main/services/serviceContext';

test('CarveService - Forensic signature carving and anti-forensics detection', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_test_carve_'));
  const context = new ServiceContext(tmpDir);
  const carveService = new CarveService(context);

  // 1. Test anti-forensics detection on pure zero file
  const zeroImage = path.join(tmpDir, 'zero_image.raw');
  fs.writeFileSync(zeroImage, Buffer.alloc(128 * 1024, 0x00));

  const afResult = await carveService.detectAntiForensics(zeroImage);
  assert.strictEqual(afResult.detected, true);
  assert.strictEqual(afResult.type, 'NIST_ZERO_OVERWRITE');

  // 2. Synthesize disk image with embedded JPEG
  const diskImage = path.join(tmpDir, 'evidence_disk.dd');
  const outDir = path.join(tmpDir, 'carved_output');

  // Prefix padding + JPEG header + JPEG payload + postfix padding
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const jpegPayload = Buffer.from('FAKE JPEG BODY CONTENT DATA FOR TESTING');
  const paddingBefore = Buffer.alloc(4096, 0x11);
  const paddingAfter = Buffer.alloc(4096, 0x22);
  const syntheticDisk = Buffer.concat([paddingBefore, jpegHeader, jpegPayload, paddingAfter]);
  fs.writeFileSync(diskImage, syntheticDisk);

  const carveResult = await carveService.startCarving(diskImage, outDir, ['jpg'], undefined, {
    caseId: 'CASE-CARVE-01',
    operatorId: 'EXAMINER-1',
    role: 'operator'
  });

  assert.strictEqual(carveResult.filesFound.length, 1);
  assert.strictEqual(carveResult.filesFound[0].category, 'Images');
  assert.strictEqual(carveResult.filesFound[0].extension, 'jpg');
  assert.ok(fs.existsSync(carveResult.filesFound[0].outputPath));

  // Verify audit entry
  const repo = await context.getAuditRepository();
  const logs = repo.list({ caseId: 'CASE-CARVE-01' });
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].operation, 'FILE_RECOVERY');

  (await context.getDatabase()).close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

