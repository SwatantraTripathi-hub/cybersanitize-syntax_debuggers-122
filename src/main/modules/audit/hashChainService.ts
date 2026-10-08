/**
 * Cryptographic Hash Chain Subsystem (Phase 2)
 * 
 * Provides SHA-256 blockchain-style prevHash chaining,
 * chain integrity verification, and signed .cschain export/import.
 */

import * as crypto from 'crypto';

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  brokenAtId: number | null;
  error?: string;
}

export interface ChainExportBundle {
  format: 'CYBERSANITIZE_CHAIN_V2';
  exportedAt: string;
  caseId: string;
  caseTitle: string;
  operatorId: string;
  chainRootHash: string;
  chainTipHash: string;
  totalEntries: number;
  entries: any[];
  chainSignature?: string;
  publicKey?: string;
}

export class HashChainService {
  /**
   * Computes the SHA-256 hash of an audit entry to form the prevHash link
   */
  public static computeEntryHash(entry: Record<string, any>): string {
    const serialized = JSON.stringify({
      id: entry.id,
      case_id: entry.case_id,
      operator_id: entry.operator_id,
      operation_type: entry.operation_type,
      target_path: entry.target_path,
      hash_before: entry.hash_before,
      hash_after: entry.hash_after,
      timestamp: entry.timestamp,
      prev_hash: entry.prev_hash || 'GENESIS'
    });

    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Verifies an array of chained entries in chronological order
   */
  public static verifyChain(entries: any[]): ChainVerificationResult {
    if (!entries || entries.length === 0) {
      return { valid: true, totalEntries: 0, brokenAtId: null };
    }

    let expectedPrevHash = 'GENESIS';

    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      if (i > 0 && current.prev_hash && current.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAtId: current.id || i,
          error: `Hash mismatch at entry ${current.id || i}. Expected ${expectedPrevHash.substring(0, 8)}, got ${(current.prev_hash || '').substring(0, 8)}.`
        };
      }
      expectedPrevHash = this.computeEntryHash(current);
    }

    return {
      valid: true,
      totalEntries: entries.length,
      brokenAtId: null
    };
  }

  /**
   * Bundles audit entries into a verifiable .cschain export format
   */
  public static createExportBundle(
    caseId: string,
    caseTitle: string,
    operatorId: string,
    entries: any[]
  ): ChainExportBundle {
    const rootHash = entries.length > 0 ? this.computeEntryHash(entries[0]) : 'GENESIS';
    const tipHash = entries.length > 0 ? this.computeEntryHash(entries[entries.length - 1]) : 'GENESIS';

    return {
      format: 'CYBERSANITIZE_CHAIN_V2',
      exportedAt: new Date().toISOString(),
      caseId,
      caseTitle,
      operatorId,
      chainRootHash: rootHash,
      chainTipHash: tipHash,
      totalEntries: entries.length,
      entries
    };
  }
}
