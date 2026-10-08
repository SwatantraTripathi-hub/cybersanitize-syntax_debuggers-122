import * as fs from 'fs';
import { FileEraseEngine } from './src/main/engines/fileEraseEngine';
import * as crypto from 'crypto';
import * as path from 'path';

async function testFileErase() {
  const engine = new FileEraseEngine();
  const testFile = 'erase-test.txt';
  fs.writeFileSync(testFile, "SECRET DATA " + crypto.randomBytes(32).toString('hex'));

  engine.on('progress', (p) => console.log(p));
  
  await engine.secureDeleteFile(testFile, 'nist-clear');
  console.log("File exists after erase?", fs.existsSync(testFile));
}

testFileErase().catch(console.error);
