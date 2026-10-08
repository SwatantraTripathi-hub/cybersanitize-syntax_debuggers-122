/**
 * Anti-Forensics Detection Engine (Phase 3.3)
 * 
 * Detects whether a suspect drive shows signs of prior sanitization
 * or intentional evidence destruction attempts.
 */

export interface PriorWipeAssessment {
  detected: boolean;
  wipeType: 'zero-fill' | 'random-fill' | 'partial' | 'none';
  confidence: number;
  message: string;
}

export class AntiForensicsDetector {
  /**
   * Evaluates sampled sectors to detect prior zero or random sanitization attempts
   */
  public static evaluateSectorSamples(sampleEntropies: number[], zeroSectorRatio: number): PriorWipeAssessment {
    if (zeroSectorRatio > 0.4) {
      return {
        detected: true,
        wipeType: 'zero-fill',
        confidence: Math.round(zeroSectorRatio * 100),
        message: 'High concentration of zeroed clusters detected. Evidence of prior NIST Clear zero-wipe attempt.'
      };
    }

    const highEntropyCount = sampleEntropies.filter(h => h > 7.6).length;
    const highEntropyRatio = sampleEntropies.length > 0 ? highEntropyCount / sampleEntropies.length : 0;

    if (highEntropyRatio > 0.5) {
      return {
        detected: true,
        wipeType: 'random-fill',
        confidence: Math.round(highEntropyRatio * 100),
        message: 'High entropy pseudorandom data pattern detected. Evidence of prior cryptographic purge or random overwrite.'
      };
    }

    return {
      detected: false,
      wipeType: 'none',
      confidence: 0,
      message: 'Standard file system cluster distribution observed. No obvious prior wipe detected.'
    };
  }
}
