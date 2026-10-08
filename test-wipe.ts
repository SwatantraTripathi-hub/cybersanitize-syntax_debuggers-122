import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { WipeEngine } from './src/main/engines/wipeEngine';
import { CarvingEngine } from './src/main/engines/carvingEngine';

async function run() {
  const wipeEngine = new WipeEngine();
  const carveEngine = new CarvingEngine();

  const testFile = 'test-image.dd';
  const sizeMB = 16;
  const chunkSize = 1024 * 1024;
  const fd = fs.openSync(testFile, 'w');
  
  for (let i = 0; i < sizeMB; i++) {
    const chunk = crypto.randomBytes(chunkSize);
    if (i === 1) {
      chunk[0] = 0xFF; chunk[1] = 0xD8; chunk[2] = 0xFF; chunk[3] = 0xE0;
      chunk[4] = 0x00; chunk[5] = 0x10; chunk[6] = 0x4A; chunk[7] = 0x46;
      chunk[8] = 0xFF; chunk[9] = 0xDA; // SOS marker
      chunk.fill(0x33, 10, 4096);
      chunk[4094] = 0xFF; chunk[4095] = 0xD9;
    }
    fs.writeSync(fd, chunk, 0, chunkSize);
  }
  fs.closeSync(fd);

  console.log("Image created.");
  
  let carves = await carveEngine.carveFromImage(testFile, 'test-output', ['jpg']);
  console.log("Pre-wipe carves:", carves.filesFound.length);

  await wipeEngine.wipe(testFile, 'nist-clear', { dryRun: false, blockSize: 65536, verify: true });
  console.log("Wiped.");

  let carvesPost = await carveEngine.carveFromImage(testFile, 'test-output-2', ['jpg']);
  console.log("Post-wipe carves:", carvesPost.filesFound.length);
}

run().catch(console.error);
