/**
 * Audit ledger service: the single write path for the hash chain.
 *
 * Combines the signing keystore with the audit repository so there is exactly
 * one place where entries are appended and exactly one place where the chain
 * is verified — callers cannot append without signing or "verify" a partial
 * subset.
 */

import { AuditRecord, ChainVerificationResult } from '../types/audit';
import { CaseScope } from '../types/case';
import { CyberSanitizeError } from '../types/errors';
import { verifyAuditChain } from '../crypto/hashChain';
import { SigningKeystore } from '../crypto/keystore';
import { AuditRepository, AppendAuditInput, AuditQuery } from './repositories/auditRepository';
import type { Driver } from './driver';

export interface LedgerStats {
  entryCount: number;
  tipHash: string | null;
}

export class AuditLedger {
  private readonly repository: AuditRepository;

  constructor(
    driver: Driver,
    readonly keystore: SigningKeystore
  ) {
    this.repository = new AuditRepository(driver, keystore);
  }

  /** Sealed append: validated, hashed, signed and persisted atomically. */
  append(input: AppendAuditInput): AuditRecord {
    return this.repository.append(input);
  }

  getRepository(): AuditRepository {
    return this.repository;
  }

  list(query?: AuditQuery): AuditRecord[] {
    return this.repository.list(query);
  }

  listAll(): AuditRecord[] {
    return this.repository.listAll();
  }

  getById(id: number): AuditRecord | null {
    return this.repository.getById(id);
  }

  stats(scope?: CaseScope) {
    return this.repository.stats(scope);
  }

  count(scope?: CaseScope): number {
    return this.repository.count(scope);
  }

  clear(): number {
    return this.repository.clear();
  }

  /**
   * Full-ledger verification against the keystore's public key.
   * Always loads the complete chain; a subset can never report VALID.
   */
  verify(): ChainVerificationResult {
    const entries = this.repository.listAll();
    return verifyAuditChain(entries, this.keystore.getPublicKeyHex());
  }

  /** Public key for export bundles and external verification tools. */
  getPublicKeyHex(): string {
    return this.keystore.getPublicKeyHex();
  }

  ledgerStats(): LedgerStats {
    const entries = this.repository.listAll();
    return {
      entryCount: entries.length,
      tipHash: entries.length === 0 ? null : entries[entries.length - 1].entry_hash
    };
  }

  /**
   * Reports whether the ledger can be extended. Used by IPC layers to fail
   * fast with an honest error instead of silently corrupting the chain.
   */
  assertHealthy(): void {
    const stats = this.ledgerStats();
    if (stats.tipHash === null) return;
    const result = this.verify();
    if (result.status === 'TAMPERED') {
      throw new CyberSanitizeError(
        'CHAIN_INVALID',
        `ledger verification failed before append: ${result.reason} — ${result.detail}`
      );
    }
  }
}

export type { AppendAuditInput, AuditQuery } from './repositories/auditRepository';
export type { CreateCaseInput, UpdateCaseInput } from './repositories/caseRepository';
export type { CreateEvidenceInput, AppendCustodyInput } from './repositories/evidenceRepository';
export type { RegisterOperatorInput } from './repositories/operatorRepository';
