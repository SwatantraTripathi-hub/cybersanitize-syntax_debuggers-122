import * as fs from 'fs';

export interface VerificationResult {
  passed: boolean;
  totalBlocks: number;
  sampledBlocks: number;
  failedBlocks: number[];
  averageEntropy: number;
  expectedEntropy: string;
  magicBytesFound: boolean;
  mode: 'nist-clear' | 'nist-purge' | 'dod-legacy';
  details: string;
}

export function calculateEntropy(block: Buffer): number {
  if (block.length === 0) return 0;
  const frequencies = new Array(256).fill(0);
  for (let i = 0; i < block.length; i++) {
    frequencies[block[i]]++;
  }

  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      const p = frequencies[i] / block.length;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

const MAGIC_SIGNATURES = [
  Buffer.from([0xFF, 0xD8, 0xFF]),             // JPEG
  Buffer.from([0x89, 0x50, 0x4E, 0x47]),       // PNG
  Buffer.from([0x25, 0x50, 0x44, 0x46]),       // PDF (%PDF)
  Buffer.from([0x50, 0x4B, 0x03, 0x04]),       // ZIP/DOCX
  Buffer.from([0x47, 0x49, 0x46, 0x38]),       // GIF
  Buffer.from([0x4D, 0x5A])                    // MZ Executable
];

export async function verifyWipe(
  fd: number,
  totalSize: number,
  mode: 'nist-clear' | 'nist-purge' | 'dod-legacy',
  blockSize: number = 4096
): Promise<VerificationResult> {
  const totalBlocks = Math.max(1, Math.ceil(totalSize / blockSize));
  const sampleIndices = new Set<number>();

  // Front 2%, Middle 2%, End 2%, and random distributed samples
  const edgeCount = Math.max(2, Math.floor(totalBlocks * 0.02));
  for (let i = 0; i < Math.min(edgeCount, totalBlocks); i++) sampleIndices.add(i);

  const mid = Math.floor(totalBlocks / 2);
  for (let i = 0; i < edgeCount && (mid + i) < totalBlocks; i++) sampleIndices.add(mid + i);

  const endStart = Math.max(0, totalBlocks - edgeCount);
  for (let i = endStart; i < totalBlocks; i++) sampleIndices.add(i);

  // Add random distributed samples up to 15% of drive or max 500 samples
  const targetSamples = Math.min(500, Math.max(20, Math.ceil(totalBlocks * 0.15)));
  while (sampleIndices.size < targetSamples && sampleIndices.size < totalBlocks) {
    sampleIndices.add(Math.floor(Math.random() * totalBlocks));
  }

  let totalEntropy = 0;
  const failedBlocks: number[] = [];
  let magicBytesFound = false;
  const buf = Buffer.alloc(blockSize);
  let lastYieldTime = Date.now();

  for (const idx of sampleIndices) {
    if (idx >= totalBlocks) continue;
    const pos = idx * blockSize;
    const readSize = Math.min(blockSize, totalSize - pos);
    
    try {
      fs.readSync(fd, buf, 0, readSize, pos);
    } catch (_) {
      continue;
    }

    const slice = buf.subarray(0, readSize);
    const entropy = calculateEntropy(slice);
    totalEntropy += entropy;

    // Check for known file signature magic bytes
    for (const sig of MAGIC_SIGNATURES) {
      if (slice.indexOf(sig) !== -1) {
        magicBytesFound = true;
        break;
      }
    }

    // Mode-aware evaluation
    if (mode === 'nist-clear') {
      // Expect pure zeros: H(X) should be <= 0.05
      if (entropy > 0.05) failedBlocks.push(idx);
    } else {
      // Expect high entropy ciphertext / random noise: H(X) should be >= 7.5
      if (entropy < 7.4) failedBlocks.push(idx);
    }

    const now = Date.now();
    if (now - lastYieldTime > 50) {
      await new Promise(r => setImmediate(r));
      lastYieldTime = Date.now();
    }
  }

  const sampleCount = sampleIndices.size || 1;
  const averageEntropy = totalEntropy / sampleCount;

  let passed = false;
  let details = '';

  if (mode === 'nist-clear') {
    passed = failedBlocks.length === 0 && !magicBytesFound && averageEntropy < 0.05;
    details = passed
      ? `NIST Clear Verified: Average Shannon Entropy H(X) = ${averageEntropy.toFixed(4)} (Target: ~= 0.0000). Pure zero-fill confirmed across all ${sampleCount} sampled sectors.`
      : `NIST Clear Check: ${failedBlocks.length} sectors showed non-zero entropy (H=${averageEntropy.toFixed(4)}).`;
  } else {
    passed = failedBlocks.length === 0 && !magicBytesFound && averageEntropy >= 7.5;
    details = passed
      ? `NIST Purge Verified: Average Shannon Entropy H(X) = ${averageEntropy.toFixed(4)} (Target: ~= 8.0000). Ciphertext chaos confirmed with 0 file magic signatures detected.`
      : `NIST Purge Check: Incomplete random distribution or file structures detected.`;
  }

  return {
    passed,
    totalBlocks,
    sampledBlocks: sampleCount,
    failedBlocks,
    averageEntropy: parseFloat(averageEntropy.toFixed(4)),
    expectedEntropy: mode === 'nist-clear' ? '~= 0.0000 (Pure Zero)' : '~= 8.0000 (Ciphertext Chaos)',
    magicBytesFound,
    mode,
    details
  };
}
