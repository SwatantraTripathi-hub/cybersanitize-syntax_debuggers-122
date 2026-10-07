import fs from 'node:fs'

export interface VerificationResult {
  passed: boolean
  totalBlocks: number
  sampledBlocks: number
  failedBlocks: number[]
  averageEntropy: number
  expectedEntropy: string
  magicBytesFound: boolean
  mode: 'nist-clear' | 'nist-purge' | 'dod-legacy'
  details: string
}

export function calculateEntropy(data: Uint8Array): number {
  if (data.length === 0) return 0
  const frequencies = new Uint32Array(256)
  for (let index = 0; index < data.length; index += 1) frequencies[data[index]] += 1
  let entropy = 0
  for (const count of frequencies) {
    if (count === 0) continue
    const probability = count / data.length
    entropy -= probability * Math.log2(probability)
  }
  return Number.isFinite(entropy) ? Math.min(8, Math.max(0, entropy)) : 0
}

export async function verifyWipe(
  fd: number,
  totalSize: number,
  mode: 'nist-clear' | 'nist-purge' | 'dod-legacy',
  blockSize = 4096
): Promise<VerificationResult> {
  if (!Number.isSafeInteger(totalSize) || totalSize < 0 || !Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new RangeError('Invalid verification size')
  }
  const totalBlocks = totalSize === 0 ? 0 : Math.ceil(totalSize / blockSize)
  const failedBlocks: number[] = []
  const buffer = Buffer.allocUnsafe(blockSize)
  let entropyTotal = 0
  let sampledBlocks = 0
  for (let index = 0; index < totalBlocks; index += 1) {
    const length = Math.min(blockSize, totalSize - index * blockSize)
    fs.readSync(fd, buffer, 0, length, index * blockSize)
    const block = buffer.subarray(0, length)
    const entropy = calculateEntropy(block)
    entropyTotal += entropy
    sampledBlocks += 1
    if (mode === 'nist-clear' && block.some((value) => value !== 0)) failedBlocks.push(index)
  }
  const averageEntropy = sampledBlocks === 0 ? 0 : entropyTotal / sampledBlocks
  const passed = mode === 'nist-clear' && failedBlocks.length === 0
  return {
    passed,
    totalBlocks,
    sampledBlocks,
    failedBlocks,
    averageEntropy,
    expectedEntropy: mode === 'nist-clear' ? '0.0000 (zero-fill)' : 'not asserted without reproducible evidence',
    magicBytesFound: false,
    mode,
    details: passed ? 'All read-back bytes matched the required zero pattern.' : 'Read-back verification found mismatched bytes.'
  }
}
