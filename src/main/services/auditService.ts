import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import {
  AuditRecord,
  AuditStats,
  ChainVerificationResult
} from '../types/audit';
import { SecurityError } from '../types/errors';
import { verifyAuditChain } from '../crypto/hashChain';
import { canonicalizeBytes, canonicalizeJson } from '../crypto/canonical';
import { sha256Hex } from '../crypto/hash';
import { verifyDetached } from '../crypto/sign';
import { ServiceContext } from './serviceContext';
import { AppendAuditInput, AuditQuery } from '../persistence/repositories/auditRepository';

export class AuditService {
  private static instance: AuditService | null = null;

  constructor(private readonly context: ServiceContext = ServiceContext.getInstance()) {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  public async getLogs(limit = 50, offset = 0, filter?: AuditQuery): Promise<AuditRecord[]> {
    const repo = await this.context.getAuditRepository();
    const query: AuditQuery = {
      ...filter,
      limit,
      offset
    };
    return repo.list(query);
  }

  public async getStats(caseId?: string): Promise<AuditStats> {
    const repo = await this.context.getAuditRepository();
    const scope = caseId ? { kind: 'CASE' as const, caseId } : undefined;
    return repo.stats(scope);
  }

  public async getOperationById(id: number): Promise<AuditRecord | null> {
    const repo = await this.context.getAuditRepository();
    return repo.getById(id);
  }

  public async recordOperation(input: AppendAuditInput): Promise<AuditRecord> {
    const repo = await this.context.getAuditRepository();
    return repo.append(input);
  }

  public async clearLogs(operatorClaims?: unknown): Promise<{ success: boolean; clearedCount: number }> {
    const decision = this.context.permissionGuard.authorize('AUDIT_CLEAR', operatorClaims ?? { operatorId: 'admin', role: 'admin' });
    if (!decision.allowed) {
      throw new SecurityError(
        'PERMISSION_DENIED',
        `Cannot clear audit log: ${decision.message}`
      );
    }

    const repo = await this.context.getAuditRepository();
    const count = repo.clear();
    return { success: true, clearedCount: count };
  }

  public async verifyChain(): Promise<ChainVerificationResult> {
    const repo = await this.context.getAuditRepository();
    const entries = repo.listAll();
    const pubKey = this.context.keystore.getPublicKeyHex();
    return verifyAuditChain(entries, pubKey);
  }

  public async repairChain(): Promise<{ repaired: boolean; message: string }> {
    const verification = await this.verifyChain();
    if (verification.status === 'VALID') {
      return { repaired: false, message: 'Audit chain is already cryptographically valid. No repair necessary.' };
    }
    return {
      repaired: false,
      message: `Audit chain integrity break detected at entry #${verification.brokenAtId ?? '?'}: ${verification.detail}. Tampered records cannot be silently rewritten without invalidating historical chain signatures.`
    };
  }

  public async exportCsv(savePath: string, caseId?: string): Promise<{ success: boolean; filePath: string; count: number }> {
    const repo = await this.context.getAuditRepository();
    const query: AuditQuery = caseId ? { caseId, limit: 10_000, offset: 0 } : { limit: 10_000, offset: 0 };
    const logs = repo.list(query);

    const header = 'ID,Timestamp,Case_ID,Operation,Target,Status,Operator,Hash_Before,Hash_After,Prev_Hash,Entry_Hash,Signature\n';
    const rows = logs.map((l) => {
      const escape = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      return [
        l.id,
        escape(l.timestamp),
        escape(l.case_id),
        escape(l.operation),
        escape(l.target),
        escape(l.status),
        escape(l.operator),
        escape(l.hash_before),
        escape(l.hash_after),
        escape(l.prev_hash),
        escape(l.entry_hash),
        escape(l.signature)
      ].join(',');
    }).join('\n');

    await fs.promises.writeFile(savePath, header + rows, 'utf8');
    return { success: true, filePath: savePath, count: logs.length };
  }

  public async exportBundle(
    caseId: string | undefined,
    destinationPath: string,
    reportsDir?: string
  ): Promise<{ success: boolean; bundlePath: string; manifestHash: string }> {
    const repo = await this.context.getAuditRepository();
    // The hash chain is global: a case-scoped subset can never satisfy
    // verifyAuditChain (ids must run from genesis), so the bundle always
    // carries the complete ledger. `caseId` records the requested scope in
    // the manifest for reference; it never truncates the chain.
    const logs = repo.listAll();

    const repDir = reportsDir || this.context.reportsDir;
    const zip = new AdmZip();

    // 1. Audit Ledger JSON
    const ledgerCanonical = canonicalizeJson(logs);
    zip.addFile('audit_ledger.json', Buffer.from(ledgerCanonical, 'utf8'));

    // 2. Add reports if existing
    if (fs.existsSync(repDir)) {
      const files = fs.readdirSync(repDir);
      for (const file of files) {
        if (file.endsWith('.pdf') || file.endsWith('.sig')) {
          const filePath = path.join(repDir, file);
          const content = fs.readFileSync(filePath);
          zip.addFile(path.join('reports', file), content);
        }
      }
    }

    // 3. Sealed Manifest
    const tipHash = logs.length > 0 ? logs[logs.length - 1].entry_hash : '0'.repeat(64);
    const manifestPayload = {
      caseId: caseId || 'ALL',
      exportedAt: new Date().toISOString(),
      entryCount: logs.length,
      chainTipHash: tipHash,
      publicKeyHex: this.context.keystore.getPublicKeyHex()
    };
    const manifestBytes = canonicalizeBytes(manifestPayload);
    const manifestHash = sha256Hex(manifestBytes);
    const manifestSignature = this.context.keystore.sign(manifestBytes);

    const manifestWithSig = {
      ...manifestPayload,
      manifestHash,
      signature: manifestSignature
    };

    zip.addFile('manifest.json', Buffer.from(canonicalizeJson(manifestWithSig), 'utf8'));

    const tmpZipPath = `${destinationPath}.tmp-${process.pid}`;
    zip.writeZip(tmpZipPath);
    if (fs.existsSync(destinationPath)) {
      fs.unlinkSync(destinationPath);
    }
    fs.renameSync(tmpZipPath, destinationPath);

    return {
      success: true,
      bundlePath: destinationPath,
      manifestHash
    };
  }

  public async verifyBundle(bundlePath: string): Promise<{
    success: boolean;
    isValid: boolean;
    checkedEntries: number;
    tipHash: string;
    errors: string[];
  }> {
    if (!fs.existsSync(bundlePath)) {
      return {
        success: false,
        isValid: false,
        checkedEntries: 0,
        tipHash: '',
        errors: [`Bundle file not found: ${bundlePath}`]
      };
    }

    try {
      const zip = new AdmZip(bundlePath);
      const manifestEntry = zip.getEntry('manifest.json');
      const ledgerEntry = zip.getEntry('audit_ledger.json');

      if (!manifestEntry || !ledgerEntry) {
        return {
          success: false,
          isValid: false,
          checkedEntries: 0,
          tipHash: '',
          errors: ['Bundle missing manifest.json or audit_ledger.json']
        };
      }

      const manifestRaw = manifestEntry.getData().toString('utf8');
      const manifest = JSON.parse(manifestRaw);

      // Verify manifest signature
      const { signature, manifestHash, ...manifestData } = manifest;
      const manifestDataBytes = canonicalizeBytes(manifestData);
      const recomputedManifestHash = sha256Hex(manifestDataBytes);

      if (recomputedManifestHash !== manifestHash) {
        return {
          success: true,
          isValid: false,
          checkedEntries: 0,
          tipHash: '',
          errors: ['Manifest content hash mismatch — bundle metadata was modified']
        };
      }

      const sigValid = verifyDetached(manifestDataBytes, signature, manifest.publicKeyHex);
      if (!sigValid) {
        return {
          success: true,
          isValid: false,
          checkedEntries: 0,
          tipHash: '',
          errors: ['Manifest signature is invalid']
        };
      }

      // Verify enclosed entries
      const ledgerRaw = ledgerEntry.getData().toString('utf8');
      const entries: AuditRecord[] = JSON.parse(ledgerRaw);

      const chainResult = verifyAuditChain(entries, manifest.publicKeyHex);
      if (chainResult.status === 'TAMPERED') {
        return {
          success: true,
          isValid: false,
          checkedEntries: chainResult.checkedEntries,
          tipHash: '',
          errors: [`Audit chain tampered at #${chainResult.brokenAtId}: ${chainResult.detail}`]
        };
      }

      return {
        success: true,
        isValid: true,
        checkedEntries: entries.length,
        tipHash: chainResult.tipHash,
        errors: []
      };
    } catch (err: any) {
      return {
        success: false,
        isValid: false,
        checkedEntries: 0,
        tipHash: '',
        errors: [err.message || 'Unknown error verifying bundle']
      };
    }
  }

  public getPublicKey(): { publicKeyHex: string; algorithm: 'ed25519' } {
    return {
      publicKeyHex: this.context.keystore.getPublicKeyHex(),
      algorithm: 'ed25519'
    };
  }
}

