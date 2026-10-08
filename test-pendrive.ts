import * as fs from 'fs';
import * as path from 'path';
import { WipeEngine } from './src/main/engines/wipeEngine';
import { CarvingEngine } from './src/main/engines/carvingEngine';

async function testPendriveWipe() {
  const drive = 'D:\\';
  const wipeEngine = new WipeEngine();
  const carveEngine = new CarvingEngine();

  // Create a test JPG in the drive
  const testImg = path.join(drive, 'test-img.jpg');
  const chunk = Buffer.alloc(4096, 0x33);
  chunk[0] = 0xFF; chunk[1] = 0xD8; chunk[2] = 0xFF; chunk[3] = 0xE0;
  chunk[4] = 0x00; chunk[5] = 0x10; chunk[6] = 0x4A; chunk[7] = 0x46;
  chunk[8] = 0xFF; chunk[9] = 0xDA; // SOS marker
  chunk[4094] = 0xFF; chunk[4095] = 0xD9;
  
  fs.writeFileSync(testImg, chunk);
  console.log("Created test file:", testImg);

  // Carve before wipe
  const carvePre = await carveEngine.carveFromImage(drive, 'test-output', ['jpg'], 1024*1024*16);
  console.log("Pre-wipe found:", carvePre.filesFound.length);

  // Wipe the drive using nist-fast
  console.log("Starting NIST Fast wipe on D:\\...");
  await wipeEngine.wipe(drive, 'nist-fast', { dryRun: false, blockSize: 65536, verify: false, size: 1024*1024*16 });
  console.log("Wipe completed.");

  // Carve after wipe
  const carvePost = await carveEngine.carveFromImage(drive, 'test-output-post', ['jpg'], 1024*1024*16);
  console.log("Post-wipe found:", carvePost.filesFound.length);
}

testPendriveWipe().catch(console.error);
