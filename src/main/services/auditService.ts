import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import nacl from 'tweetnacl';

function getUserDataPath(): string {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) {}
  const home = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  const appData = path.join(home, 'cybersanitize-forensic-tool');
  if (!fs.existsSync(appData)) {
    try { fs.mkdirSync(appData, { recursive: true }); } catch (_) {}
  }
  return appData;
}

function getTempPath(): string {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('temp');
    }
  } catch (_) {}
  return os.tmpdir();
}

export interface AuditEntry {
  id?: number;
  timestamp: string;
  operation: 'DRIVE_WIPE' | 'FILE_ERASE' | 'FILE_RECOVERY' | 'WRITE_BLOCKER_VERIFIED' | 'EVIDENCE_IMPORT' | 'FLEET_ATTESTATION';
  target: string;
  details: any;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VERIFIED';
  operator: string;
  hash_before: string | null;
  hash_after: string | null;
  verification_result: any | null;
  // Chaining fields
  prev_hash?: string;
  entry_hash?: string;
  signature?: string;
}

export interface ChainVerificationResult {
  intact: boolean;
  checkedBlocks: number;
  brokenAtId?: number;
  brokenAtIndex?: number;
  reason?: string;
}

function verifyEntries(entries: AuditEntry[], publicKeyHex: string): ChainVerificationResult {
  if (entries.length === 0) return { intact: true, checkedBlocks: 0 };
  let expectedPrevHash = GENESIS_HASH;
  const publicKey = new Uint8Array(Buffer.from(publicKeyHex, 'hex'));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.id !== i + 1 || entry.prev_hash !== expectedPrevHash) {
      return { intact: false, checkedBlocks: i, brokenAtId: entry.id, brokenAtIndex: i + 1, reason: 'Ledger sequence or previous-hash linkage is invalid.' };
    }
    const recomputed = computeEntryHash({ ...entry, id: entry.id!, prev_hash: entry.prev_hash! });
    if (!entry.entry_hash || recomputed !== entry.entry_hash) {
      return { intact: false, checkedBlocks: i, brokenAtId: entry.id, brokenAtIndex: i + 1, reason: 'Ledger entry hash does not match its stored data.' };
    }
    try {
      const signature = new Uint8Array(Buffer.from(entry.signature || '', 'hex'));
      if (!nacl.sign.detached.verify(Buffer.from(entry.entry_hash, 'hex'), signature, publicKey)) {
        return { intact: false, checkedBlocks: i, brokenAtId: entry.id, brokenAtIndex: i + 1, reason: 'Ledger entry signature is invalid.' };
      }
    } catch (_) {
      return { intact: false, checkedBlocks: i, brokenAtId: entry.id, brokenAtIndex: i + 1, reason: 'Ledger entry signature is malformed.' };
    }
    expectedPrevHash = entry.entry_hash;
  }
  return { intact: true, checkedBlocks: entries.length };
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function computeEntryHash(entry: Omit<AuditEntry, 'entry_hash' | 'signature'> & { prev_hash: string }): string {
  const payload = [
    String(entry.id || 0),
    entry.timestamp,
    entry.prev_hash,
    entry.operation,
    entry.target,
    entry.operator,
    entry.status,
    entry.hash_before || '',
    entry.hash_after || '',
    JSON.stringify(entry.details || {})
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class AuditService {
  private db: any = null;
  private isInMemory = false;
  private memoryLogs: AuditEntry[] = [];
  private customDbPath: string | null = null;
  private jsonFallbackPath: string = '';
  private keypair: nacl.SignKeyPair;
  private serviceContext: { getAuditRepository: () => Promise<any> } | null = null;

  constructor(dbPathOrContext?: string | { userDataDir?: string }) {
    if (typeof dbPathOrContext === 'object' && dbPathOrContext && 'getAuditRepository' in dbPathOrContext) {
      this.serviceContext = dbPathOrContext as { getAuditRepository: () => Promise<any> };
    }
    const dbPath = typeof dbPathOrContext === 'string'
      ? dbPathOrContext
      : dbPathOrContext?.userDataDir
        ? path.join(dbPathOrContext.userDataDir, 'audit.db')
        : undefined;
    if (dbPath) this.customDbPath = dbPath;
    this.jsonFallbackPath = dbPath
      ? `${dbPath}.fallback.json`
      : path.join(getUserDataPath(), 'audit_logs_fallback.json');
    this.keypair = this.loadOrGenerateAuditKeys();
    if (!this.serviceContext) this.initDb();
  }

  private loadOrGenerateAuditKeys(): nacl.SignKeyPair {
    const keyPath = path.join(getUserDataPath(), 'audit_signing_key.json');
    if (fs.existsSync(keyPath)) {
      try {
        const keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        return {
          publicKey: new Uint8Array(Buffer.from(keys.publicKey, 'hex')),
          secretKey: new Uint8Array(Buffer.from(keys.secretKey, 'hex'))
        };
      } catch (_) {}
    }
    const newKeys = nacl.sign.keyPair();
    try {
      fs.writeFileSync(keyPath, JSON.stringify({
        publicKey: Buffer.from(newKeys.publicKey).toString('hex'),
        secretKey: Buffer.from(newKeys.secretKey).toString('hex'),
        enclaveType: 'Audit Ledger Sovereign Ed25519 Cryptographic Enclave Keypair',
        createdAt: new Date().toISOString()
      }, null, 2));
    } catch (_) {}
    return newKeys;
  }

  getPublicKey(): string {
    return Buffer.from(this.keypair.publicKey).toString('hex');
  }

  private initDb() {
    try {
      console.log('[AuditService] Initializing database...');
      const Database = require('better-sqlite3');
      const dbPath = this.customDbPath || path.join(getUserDataPath(), 'audit.db');
      console.log(`[AuditService] Using DB path: ${dbPath}`);
      this.db = new Database(dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          operation TEXT NOT NULL,
          target TEXT NOT NULL,
          details TEXT NOT NULL,
          status TEXT NOT NULL,
          operator TEXT NOT NULL,
          hash_before TEXT,
          hash_after TEXT,
          verification_result TEXT,
          prev_hash TEXT DEFAULT '${GENESIS_HASH}',
          entry_hash TEXT DEFAULT '',
          signature TEXT DEFAULT ''
        )
      `);
      // Migrate older tables that lack chaining columns
      try {
        this.db.exec(`ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT DEFAULT '${GENESIS_HASH}'`);
      } catch (_) {}
      try {
        this.db.exec(`ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT DEFAULT ''`);
      } catch (_) {}
      try {
        this.db.exec(`ALTER TABLE audit_logs ADD COLUMN signature TEXT DEFAULT ''`);
      } catch (_) {}
      this.repairLegacyChainInDb();
    } catch (error: any) {
      console.warn('[AuditService] SQLite unavailable, falling back to JSON:', error?.message);
      this.isInMemory = true;
      this.loadJsonFallback();
    }
  }

  private repairLegacyChainInDb(): void {
    if (!this.db) return;
    try {
      const rows = this.db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
      if (!rows || rows.length === 0) return;
      let expectedPrev = GENESIS_HASH;
      const updateStmt = this.db.prepare('UPDATE audit_logs SET prev_hash = ?, entry_hash = ?, signature = ? WHERE id = ?');
      let modified = false;

      for (const row of rows) {
        if (!row.entry_hash || row.prev_hash !== expectedPrev) {
          const entry = this.parseRow(row);
          const newEntryHash = computeEntryHash({ ...entry, id: row.id, prev_hash: expectedPrev });
          const newSig = this.signEntryHash(newEntryHash);
          updateStmt.run(expectedPrev, newEntryHash, newSig, row.id);
          expectedPrev = newEntryHash;
          modified = true;
        } else {
          expectedPrev = row.entry_hash;
        }
      }
      if (modified) {
        console.log(`[AuditService] SQLite legacy unchained entries migrated into unbroken cryptographic chain.`);
      }
    } catch (e: any) {
      console.warn('[AuditService] SQLite legacy repair error:', e.message);
    }
  }

  private repairLegacyChainInMemory(): void {
    if (!this.memoryLogs || this.memoryLogs.length === 0) return;
    let expectedPrev = GENESIS_HASH;
    let modified = false;

    // Sort by id ascending
    this.memoryLogs.sort((a, b) => (a.id || 0) - (b.id || 0));

    for (let i = 0; i < this.memoryLogs.length; i++) {
      const entry = this.memoryLogs[i];
      if (!entry.entry_hash || entry.prev_hash !== expectedPrev) {
        entry.prev_hash = expectedPrev;
        entry.entry_hash = computeEntryHash({ ...entry, id: entry.id!, prev_hash: expectedPrev });
        entry.signature = this.signEntryHash(entry.entry_hash);
        modified = true;
      }
      expectedPrev = entry.entry_hash;
    }

    if (modified) {
      this.saveJsonFallback();
      console.log(`[AuditService] Legacy unchained entries migrated into unbroken cryptographic chain (${this.memoryLogs.length} blocks).`);
    }
  }

  private loadJsonFallback() {
    try {
      if (fs.existsSync(this.jsonFallbackPath)) {
        const data = fs.readFileSync(this.jsonFallbackPath, 'utf8');
        this.memoryLogs = JSON.parse(data);
        this.repairLegacyChainInMemory();
      }
    } catch (e) {
      console.error('[AuditService] Failed to load JSON fallback:', e);
    }
  }

  private saveJsonFallback() {
    try {
      fs.writeFileSync(this.jsonFallbackPath, JSON.stringify(this.memoryLogs, null, 2), 'utf8');
    } catch (e) {
      console.error('[AuditService] Failed to save JSON fallback:', e);
    }
  }

  repairChain(): { intact: boolean; checkedBlocks: number; repaired: number } {
    if (this.isInMemory) {
      this.repairLegacyChainInMemory();
      const check = this.verifyLedgerIntegrity();
      return { intact: check.intact, checkedBlocks: check.checkedBlocks, repaired: this.memoryLogs.length };
    }
    this.repairLegacyChainInDb();
    const check = this.verifyLedgerIntegrity();
    return { intact: check.intact, checkedBlocks: check.checkedBlocks, repaired: check.checkedBlocks };
  }

  private getLastEntryHash(): string {
    if (this.isInMemory) {
      if (this.memoryLogs.length === 0) return GENESIS_HASH;
      return this.memoryLogs[this.memoryLogs.length - 1].entry_hash || GENESIS_HASH;
    }
    const row = this.db.prepare('SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1').get();
    return row?.entry_hash || GENESIS_HASH;
  }

  private signEntryHash(entryHash: string): string {
    try {
      const hashBytes = Buffer.from(entryHash, 'hex');
      const sig = nacl.sign.detached(hashBytes, this.keypair.secretKey);
      return Buffer.from(sig).toString('hex');
    } catch (_) {
      return '';
    }
  }

  clearLogs(): void {
    console.log('[AuditService] Purging all audit logs...');
    this.memoryLogs = [];
    this.saveJsonFallback();
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM audit_logs').run();
      } catch (e) {
        console.error('[AuditService] Failed to clear SQLite audit_logs:', e);
      }
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  logOperation(entry: AuditEntry): number {
    console.log(`[AuditService] Logging operation: ${entry.operation} on target: ${entry.target}`);
    const prevHash = this.getLastEntryHash();

    // Ensure details contain bound evidence metadata (Tag ID, Title, Cert Ref)
    if (typeof entry.details === 'object' && entry.details !== null) {
      if (!entry.details.evidenceTag && !entry.details.tagId) {
        entry.details.evidenceTag = 'EVD-PRIMARY-01';
      }
      if (!entry.details.caseTitle && !entry.details.title) {
        entry.details.caseTitle = entry.operation === 'FILE_RECOVERY'
          ? 'Triple-Tier Deep File Carving & Evidence Acquisition'
          : 'Certified Cryptographic Drive Sanitization';
      }
      if (!entry.details.certRef && !entry.details.referenceId) {
        entry.details.certRef = `CERT-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      }
    }

    if (this.isInMemory) {
      const id = this.memoryLogs.length > 0 ? Math.max(...this.memoryLogs.map(l => l.id || 0)) + 1 : 1;
      const entryWithId = { ...entry, id, prev_hash: prevHash };
      const entryHash = computeEntryHash(entryWithId);
      const signature = this.signEntryHash(entryHash);
      this.memoryLogs.push({ ...entryWithId, entry_hash: entryHash, signature });
      this.saveJsonFallback();
      return id;
    }

    // Insert with placeholder to get autoincrement id first
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (timestamp, operation, target, details, status, operator, hash_before, hash_after, verification_result, prev_hash, entry_hash, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      entry.timestamp,
      entry.operation,
      entry.target,
      JSON.stringify(entry.details),
      entry.status,
      entry.operator,
      entry.hash_before,
      entry.hash_after,
      entry.verification_result ? JSON.stringify(entry.verification_result) : null,
      prevHash,
      '', // placeholder
      ''  // placeholder
    );
    const id = info.lastInsertRowid as number;

    // Compute proper entry hash with real id and prev_hash
    const entryHash = computeEntryHash({ ...entry, id, prev_hash: prevHash });
    const signature = this.signEntryHash(entryHash);
    this.db.prepare('UPDATE audit_logs SET entry_hash = ?, signature = ? WHERE id = ?').run(entryHash, signature, id);

    console.log(`[AuditService] Chained block #${id} created. entry_hash: ${entryHash.slice(0, 16)}...`);
    return id;
  }

  async recordOperation(input: {
    case_id: string;
    operation: AuditEntry['operation'];
    target: string;
    status: AuditEntry['status'];
    operator: string;
    timestamp?: string;
    details?: Record<string, unknown>;
    hash_before?: string | null;
    hash_after?: string | null;
    verification_result?: Record<string, unknown> | null;
  }): Promise<AuditEntry & { case_id: string }> {
    if (this.serviceContext) {
      const repository = await this.serviceContext.getAuditRepository();
      const record = repository.append({
        case_id: input.case_id,
        timestamp: input.timestamp,
        operation: input.operation,
        target: input.target,
        details: input.details || {},
        status: input.status,
        operator: input.operator,
        hash_before: input.hash_before || null,
        hash_after: input.hash_after || null,
        verification_result: input.verification_result || null
      });
      return record as AuditEntry & { case_id: string };
    }
    const id = this.logOperation({
      timestamp: input.timestamp || new Date().toISOString(),
      operation: input.operation,
      target: input.target,
      details: { ...(input.details || {}), caseId: input.case_id },
      status: input.status,
      operator: input.operator,
      hash_before: input.hash_before || null,
      hash_after: input.hash_after || null,
      verification_result: input.verification_result || null
    });
    const entry = this.getOperationById(id);
    if (!entry) throw new Error(`Audit entry ${id} was not persisted`);
    return { ...entry, case_id: input.case_id };
  }

  updateOperation(id: number, updates: Partial<AuditEntry>): void {
    console.log(`[AuditService] Updating operation ID: ${id}`);
    
    // Preserve bound metadata across updates
    if (updates.details && typeof updates.details === 'object') {
      let existingDetails: any = {};
      if (this.isInMemory) {
        const existing = this.memoryLogs.find(l => l.id === id);
        if (existing?.details) existingDetails = existing.details;
      } else if (this.db) {
        try {
          const row = this.db.prepare('SELECT details FROM audit_logs WHERE id = ?').get(id);
          if (row?.details) existingDetails = JSON.parse(row.details);
        } catch (_) {}
      }
      updates.details = {
        evidenceTag: existingDetails.evidenceTag || existingDetails.tagId || 'EVD-PRIMARY-01',
        caseTitle: existingDetails.caseTitle || existingDetails.title,
        certRef: existingDetails.certRef || existingDetails.referenceId,
        ...existingDetails,
        ...updates.details
      };
    }

    if (this.isInMemory) {
      const idx = this.memoryLogs.findIndex(l => l.id === id);
      if (idx !== -1) {
        this.memoryLogs[idx] = { ...this.memoryLogs[idx], ...updates };
        // Re-sign after update
        const entry = this.memoryLogs[idx];
        const entryHash = computeEntryHash({ ...entry, prev_hash: entry.prev_hash || GENESIS_HASH });
        this.memoryLogs[idx].entry_hash = entryHash;
        this.memoryLogs[idx].signature = this.signEntryHash(entryHash);
        this.saveJsonFallback();
      }
      return;
    }

    const sets: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'prev_hash' || key === 'entry_hash' || key === 'signature') continue;
      sets.push(`${key} = ?`);
      values.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE audit_logs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    // Re-compute entry hash and signature after update
    const row = this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id);
    if (row) {
      const entry = this.parseRow(row);
      const entryHash = computeEntryHash({ ...entry, id, prev_hash: row.prev_hash || GENESIS_HASH });
      const signature = this.signEntryHash(entryHash);
      this.db.prepare('UPDATE audit_logs SET entry_hash = ?, signature = ? WHERE id = ?').run(entryHash, signature, id);
    }
  }

  getOperations(limit = 50, offset = 0, filter?: { operation?: string; status?: string; caseId?: string }): AuditEntry[] {
    if (this.isInMemory) {
      let res = [...this.memoryLogs];
      if (filter?.caseId) {
        res = res.filter(l => {
          const d = typeof l.details === 'object' ? l.details : JSON.parse(l.details || '{}');
          return d.caseId === filter.caseId;
        });
      }
      if (filter?.operation) res = res.filter(l => l.operation === filter.operation);
      if (filter?.status) res = res.filter(l => l.status === filter.status);
      res = res.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return res.slice(offset, offset + limit);
    }

    const rows = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC').all()
      .map((r: any) => this.parseRow(r))
      .filter((entry: AuditEntry) => {
        const details = typeof entry.details === 'object' && entry.details !== null
          ? entry.details
          : {};
        if (filter?.caseId && details.caseId !== filter.caseId) return false;
        if (filter?.operation && entry.operation !== filter.operation) return false;
        if (filter?.status && entry.status !== filter.status) return false;
        return true;
      });
    return rows.slice(offset, offset + limit);
  }

  getOperationById(id: number): AuditEntry | null {
    if (this.isInMemory) return this.memoryLogs.find(l => l.id === id) || null;
    const row = this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id);
    return row ? this.parseRow(row) : null;
  }

  getStats(caseId?: string): any {
    const logs = this.getOperations(100000, 0, caseId ? { caseId } : undefined);
    return {
      total: logs.length,
      wipes: logs.filter(l => l.operation === 'DRIVE_WIPE').length,
      erases: logs.filter(l => l.operation === 'FILE_ERASE').length,
      carves: logs.filter(l => l.operation === 'FILE_RECOVERY').length
    };
  }

  /**
   * Verify the entire cryptographic hash chain from genesis to the latest block.
   * Returns a ChainVerificationResult indicating whether any tampering was detected.
   */
  verifyLedgerIntegrity(): ChainVerificationResult {
    const rows: AuditEntry[] = this.isInMemory
      ? [...this.memoryLogs].sort((a, b) => (a.id || 0) - (b.id || 0))
      : this.db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all().map((r: any) => this.parseRow(r));

    if (rows.length === 0) return { intact: true, checkedBlocks: 0 };

    let expectedPrevHash = GENESIS_HASH;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const storedPrevHash = row.prev_hash || GENESIS_HASH;
      const storedEntryHash = row.entry_hash || '';

      // 1. Check prev_hash linkage
      if (storedPrevHash !== expectedPrevHash) {
        return {
          intact: false,
          checkedBlocks: i,
          brokenAtId: row.id,
          brokenAtIndex: i + 1,
          reason: `Hash chain broken at Block #${row.id}: prev_hash mismatch. Expected ${expectedPrevHash.slice(0, 12)}..., found ${storedPrevHash.slice(0, 12)}...`
        };
      }

      // 2. Recompute entry hash and verify
      const recomputed = computeEntryHash({ ...row, id: row.id!, prev_hash: storedPrevHash });
      if (storedEntryHash && recomputed !== storedEntryHash) {
        return {
          intact: false,
          checkedBlocks: i,
          brokenAtId: row.id,
          brokenAtIndex: i + 1,
          reason: `DATA TAMPERING DETECTED at Block #${row.id}: Entry hash mismatch. Record has been modified after sealing.`
        };
      }

      // 3. Verify Ed25519 signature
      if (storedEntryHash && row.signature) {
        try {
          const hashBytes = Buffer.from(storedEntryHash, 'hex');
          const sigBytes = new Uint8Array(Buffer.from(row.signature, 'hex'));
          const valid = nacl.sign.detached.verify(hashBytes, sigBytes, this.keypair.publicKey);
          if (!valid) {
            return {
              intact: false,
              checkedBlocks: i,
              brokenAtId: row.id,
              brokenAtIndex: i + 1,
              reason: `SIGNATURE FRAUD DETECTED at Block #${row.id}: Ed25519 digital signature verification failed. The log entry has been tampered with or forged.`
            };
          }
        } catch (_) {}
      }

      expectedPrevHash = storedEntryHash || recomputed;
    }

    return { intact: true, checkedBlocks: rows.length };
  }

  exportChain(filePath: string, caseId?: string): { success: boolean; filePath: string; count: number; chainHash: string } {
    const blocks = [...this.getOperations(100000, 0, caseId ? { caseId } : undefined)]
      .sort((a, b) => (a.id || 0) - (b.id || 0));
    const chainBlocks = [...this.getOperations(100000, 0)]
      .sort((a, b) => (a.id || 0) - (b.id || 0));
    const payload = JSON.stringify({ format: 'CYBERSANITIZE_SIGNED_CHAIN_V1', caseId: caseId || 'ALL', publicKey: this.getPublicKey(), blocks, chainBlocks });
    const chainHash = crypto.createHash('sha256').update(payload).digest('hex');
    const signature = this.signEntryHash(chainHash);
    fs.writeFileSync(filePath, JSON.stringify({ payload: JSON.parse(payload), chainHash, signature, publicKey: this.getPublicKey() }, null, 2), 'utf8');
    return { success: true, filePath, count: blocks.length, chainHash };
  }

  verifyChainExport(filePath: string): { isValid: boolean; chainIntact: boolean; signatureValid: boolean; caseId: string; count: number; errors: string[] } {
    try {
      const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const payloadJson = JSON.stringify(envelope.payload);
      const calculatedHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
      const signatureValid = nacl.sign.detached.verify(
        Buffer.from(envelope.chainHash || '', 'hex'),
        new Uint8Array(Buffer.from(envelope.signature || '', 'hex')),
        new Uint8Array(Buffer.from(envelope.publicKey || '', 'hex'))
      );
      const chainBlocks = [...(envelope.payload?.chainBlocks || envelope.payload?.blocks || [])]
        .sort((a: AuditEntry, b: AuditEntry) => (a.id || 0) - (b.id || 0));
      const chain = verifyEntries(chainBlocks, envelope.publicKey || '');
      const errors: string[] = [];
      if (calculatedHash !== envelope.chainHash) errors.push('Chain export payload hash mismatch.');
      if (!signatureValid) errors.push('Chain export signature verification failed.');
      if (!chain.intact) errors.push(chain.reason || 'Exported chain is invalid.');
      return { isValid: calculatedHash === envelope.chainHash && signatureValid && chain.intact, chainIntact: chain.intact, signatureValid, caseId: envelope.payload?.caseId || 'ALL', count: chainBlocks.length, errors };
    } catch (error: any) {
      return { isValid: false, chainIntact: false, signatureValid: false, caseId: '', count: 0, errors: [error.message] };
    }
  }

  /**
   * Export the entire audit ledger (or a case-scoped subset) plus report certificates
   * into a cryptographically signed forensic evidence bundle (.forensic file).
   */
  async exportForensicBundle(caseId?: string, reportsDir?: string): Promise<{ bundlePath: string; manifestHash: string }> {
    const outDir = path.join(getUserDataPath(), 'forensic_bundles');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCaseId = (caseId || 'ALL').replace(/[^a-zA-Z0-9_-]/g, '_');
    const bundlePath = path.join(outDir, `Evidence_Bundle_${safeCaseId}_${timestamp}.forensic`);

    const rawLogs = caseId
      ? this.getOperations(10000, 0, { caseId })
      : this.getOperations(10000, 0);

    // Ensure blocks are in chronological order (id ascending)
    const logs = [...rawLogs].sort((a, b) => (a.id || 0) - (b.id || 0));

    const completeLogs = [...this.getOperations(100000, 0)].sort((a, b) => (a.id || 0) - (b.id || 0));
    const ledgerJson = JSON.stringify({
      generatedAt: new Date().toISOString(),
      caseId: caseId || 'ALL',
      publicKey: this.getPublicKey(),
      blocks: logs,
      chainBlocks: completeLogs
    }, null, 2);

    const certFiles: { name: string; path: string }[] = [];
    if (reportsDir && fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.pdf'));
      for (const f of files) {
        const fp = path.join(reportsDir, f);
        if (!caseId) {
          certFiles.push({ name: f, path: fp });
        } else {
          const sigPath = fp + '.sig';
          if (fs.existsSync(sigPath)) {
            try {
              const sigInfo = JSON.parse(fs.readFileSync(sigPath, 'utf8'));
              if (sigInfo.caseId === caseId) certFiles.push({ name: f, path: fp });
            } catch (_) {}
          }
        }
      }
    }

    // Build manifest
    const manifestEntries: Record<string, string> = {
      'ledger.json': crypto.createHash('sha256').update(ledgerJson).digest('hex')
    };
    for (const cf of certFiles) {
      const bytes = fs.readFileSync(cf.path);
      manifestEntries[`certificates/${cf.name}`] = crypto.createHash('sha256').update(bytes).digest('hex');
      const sigPath = cf.path + '.sig';
      if (fs.existsSync(sigPath)) {
        const sigBytes = fs.readFileSync(sigPath);
        manifestEntries[`certificates/${cf.name}.sig`] = crypto.createHash('sha256').update(sigBytes).digest('hex');
      }
    }

    const manifestJson = JSON.stringify({ files: manifestEntries, createdAt: new Date().toISOString() }, null, 2);
    const manifestHash = crypto.createHash('sha256').update(manifestJson).digest('hex');

    // Sign manifest
    const manifestSig = nacl.sign.detached(Buffer.from(manifestHash, 'hex'), this.keypair.secretKey);
    const bundleSignatureJson = JSON.stringify({
      manifestHash,
      signature: Buffer.from(manifestSig).toString('hex'),
      publicKey: this.getPublicKey(),
      caseId: caseId || 'ALL',
      createdAt: new Date().toISOString()
    }, null, 2);

    // Write a plain .zip-based .forensic file using streams
    const tmpDir = path.join(getTempPath(), `csev_build_${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, 'certificates'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ledger.json'), ledgerJson);
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), manifestJson);
    fs.writeFileSync(path.join(tmpDir, 'bundle_signature.sig'), bundleSignatureJson);
    for (const cf of certFiles) {
      fs.copyFileSync(cf.path, path.join(tmpDir, 'certificates', cf.name));
      const sigPath = cf.path + '.sig';
      if (fs.existsSync(sigPath)) {
        fs.copyFileSync(sigPath, path.join(tmpDir, 'certificates', cf.name + '.sig'));
      }
    }

    // Create zip (forensic bundle) using AdmZip
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(tmpDir);
    zip.writeZip(bundlePath);

    // Cleanup temp
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

    console.log(`[AuditService] Forensic bundle created: ${bundlePath} (manifest hash: ${manifestHash.slice(0, 16)}...)`);
    return { bundlePath, manifestHash };
  }

  /**
   * Verify an imported forensic bundle (.forensic file).
   * Returns verification results for manifest, hash chain, and signatures.
   */
  async verifyForensicBundle(bundlePath: string): Promise<{
    isValid: boolean;
    manifestIntact: boolean;
    chainIntact: boolean;
    signatureValid: boolean;
    caseId: string;
    blockCount: number;
    publicKey: string;
    errors: string[];
  }> {
    const AdmZip = require('adm-zip');
    const errors: string[] = [];

    try {
      const zip = new AdmZip(bundlePath);
      const manifestEntry = zip.getEntry('manifest.json');
      const ledgerEntry = zip.getEntry('ledger.json');
      const sigEntry = zip.getEntry('bundle_signature.sig');

      if (!manifestEntry || !ledgerEntry || !sigEntry) {
        return { isValid: false, manifestIntact: false, chainIntact: false, signatureValid: false, caseId: '', blockCount: 0, publicKey: '', errors: ['Bundle is missing required forensic files (ledger.json, manifest.json, or bundle_signature.sig).'] };
      }

      const manifestJson = zip.readAsText(manifestEntry);
      const ledgerJson = zip.readAsText(ledgerEntry);
      const sigJson = JSON.parse(zip.readAsText(sigEntry));

      // 1. Verify manifest hash
      const recomputedManifestHash = crypto.createHash('sha256').update(manifestJson).digest('hex');
      const manifestIntact = recomputedManifestHash === sigJson.manifestHash;
      if (!manifestIntact) errors.push(`Manifest hash mismatch! Expected ${sigJson.manifestHash.slice(0, 16)}... got ${recomputedManifestHash.slice(0, 16)}...`);

      // 2. Verify each file's hash vs manifest
      const manifest = JSON.parse(manifestJson);
      for (const [fileName, expectedHash] of Object.entries(manifest.files as Record<string, string>)) {
        const entry = zip.getEntry(fileName);
        if (!entry) { errors.push(`Missing file in bundle: ${fileName}`); continue; }
        const actual = crypto.createHash('sha256').update(zip.readFile(entry)).digest('hex');
        if (actual !== expectedHash) errors.push(`File tampered: ${fileName} hash mismatch!`);
      }

      // 3. Verify Ed25519 bundle signature
      let signatureValid = false;
      try {
        const sigBytes = new Uint8Array(Buffer.from(sigJson.signature, 'hex'));
        const pubBytes = new Uint8Array(Buffer.from(sigJson.publicKey, 'hex'));
        const hashBytes = Buffer.from(sigJson.manifestHash, 'hex');
        signatureValid = nacl.sign.detached.verify(hashBytes, sigBytes, pubBytes);
        if (!signatureValid) errors.push('Ed25519 bundle signature verification FAILED! The bundle may have been tampered with or the signing key is different.');
      } catch (e: any) {
        errors.push(`Signature verification error: ${e.message}`);
      }

      // 4. Verify internal ledger hash chain and block signatures
      const ledger = JSON.parse(ledgerJson);
      const blocks: AuditEntry[] = [...(ledger.blocks || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
      const chainBlocks: AuditEntry[] = [...(ledger.chainBlocks || blocks)].sort((a, b) => (a.id || 0) - (b.id || 0));
      let chainIntact = true;

      for (let i = 0; i < chainBlocks.length; i++) {
        const block = chainBlocks[i];
        const prevBlock = i > 0 ? chainBlocks[i - 1] : null;

        // If contiguous blocks exist in the export, check their cryptographic link
        if (prevBlock && block.id === (prevBlock.id || 0) + 1) {
          if (block.prev_hash !== prevBlock.entry_hash) {
            chainIntact = false;
            errors.push(`Hash chain link mismatch between block #${prevBlock.id} and block #${block.id}`);
            break;
          }
        }

        // Always verify that the block's entry_hash matches the cryptographic payload
        const recomputed = computeEntryHash({ ...block, id: block.id!, prev_hash: block.prev_hash || GENESIS_HASH });
        if (block.entry_hash && recomputed !== block.entry_hash) {
          chainIntact = false;
          errors.push(`Block #${block.id} data has been tampered with after sealing!`);
          break;
        }

        // Verify individual block Ed25519 detached signature if signed
        if (block.signature && sigJson.publicKey) {
          try {
            const blockSigBytes = new Uint8Array(Buffer.from(block.signature, 'hex'));
            const pubBytes = new Uint8Array(Buffer.from(sigJson.publicKey, 'hex'));
            const hashBytes = Buffer.from(block.entry_hash || recomputed, 'hex');
            if (!nacl.sign.detached.verify(hashBytes, blockSigBytes, pubBytes)) {
              chainIntact = false;
              errors.push(`Block #${block.id} signature verification failed!`);
              break;
            }
          } catch (_) {}
        }
      }

      const isValid = manifestIntact && signatureValid && chainIntact && errors.length === 0;

      let targetCaseId = ledger.caseId || sigJson.caseId || 'UNKNOWN';
      let caseTitle = '';
      let evidenceTag = '';
      let authorizingOfficer = '';
      let driveSerial = '';
      let extractedCertificatesCount = 0;
      let importedBlocksCount = 0;

      // Extract certificates & reconstruct CaseRecord on valid bundle
      if (isValid) {
        // 1. Extract certificates into local reports directory
        const reportsDir = path.join(getUserDataPath(), 'reports');
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

        for (const entry of zip.getEntries()) {
          if (entry.entryName.startsWith('certificates/') && !entry.isDirectory) {
            const fileName = path.basename(entry.entryName);
            const destPath = path.join(reportsDir, fileName);
            fs.writeFileSync(destPath, zip.readFile(entry));
            if (fileName.endsWith('.pdf')) extractedCertificatesCount++;
          }
        }

        // 2. Discover Case Details from blocks
        for (const b of blocks) {
          const d = typeof b.details === 'object' && b.details !== null ? b.details : {};
          if (!caseTitle) caseTitle = d.caseTitle || d.title;
          if (!evidenceTag) evidenceTag = d.evidenceTag || d.tagId;
          if (!authorizingOfficer) authorizingOfficer = d.authorizingOfficer || b.operator;
          if (!driveSerial) driveSerial = d.driveSerial || (b.target && !b.target.startsWith('\\\\.\\') ? b.target : '');
          if ((!targetCaseId || targetCaseId === 'ALL' || targetCaseId === 'UNKNOWN') && (d.caseId || b.case_id)) {
            targetCaseId = d.caseId || b.case_id;
          }
        }
        if (!caseTitle) caseTitle = `Forensic Case ${targetCaseId}`;
        if (!evidenceTag) evidenceTag = 'EVD-PRIMARY-01';
        if (!authorizingOfficer) authorizingOfficer = 'Forensic Directorate';

        // 3. Ingest Ledger Blocks into local SQLite/Memory store (preserving original block signatures)
        if (this.db) {
          try {
            const checkStmt = this.db.prepare('SELECT id FROM audit_logs WHERE entry_hash = ? LIMIT 1');
            const insertStmt = this.db.prepare(`
              INSERT INTO audit_logs (timestamp, operation, target, details, status, operator, hash_before, hash_after, verification_result, prev_hash, entry_hash, signature)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const block of blocks) {
              if (block.entry_hash) {
                const existing = checkStmt.get(block.entry_hash);
                if (!existing) {
                  insertStmt.run(
                    block.timestamp,
                    block.operation,
                    block.target,
                    typeof block.details === 'string' ? block.details : JSON.stringify(block.details || {}),
                    block.status,
                    block.operator,
                    block.hash_before || null,
                    block.hash_after || null,
                    block.verification_result ? (typeof block.verification_result === 'string' ? block.verification_result : JSON.stringify(block.verification_result)) : null,
                    block.prev_hash || null,
                    block.entry_hash || null,
                    block.signature || null
                  );
                  importedBlocksCount++;
                }
              }
            }
          } catch (e: any) {
            console.warn('[AuditService] SQLite block ingestion notice:', e.message);
          }
        } else {
          for (const block of blocks) {
            if (block.entry_hash && !this.memoryLogs.some(l => l.entry_hash === block.entry_hash)) {
              const id = this.memoryLogs.length > 0 ? Math.max(...this.memoryLogs.map(l => l.id || 0)) + 1 : 1;
              this.memoryLogs.push({ ...block, id });
              importedBlocksCount++;
            }
          }
          if (importedBlocksCount > 0) this.saveJsonFallback();
        }

        // 4. Log formal chain-of-custody transfer block (ISO/IEC 27037:2012)
        if (importedBlocksCount > 0 || extractedCertificatesCount > 0) {
          try {
            this.logOperation({
              timestamp: new Date().toISOString(),
              operation: 'EVIDENCE_IMPORT',
              target: path.basename(bundlePath),
              status: 'VERIFIED',
              operator: 'LOCAL-EXAMINER',
              hash_before: sigJson.manifestHash,
              hash_after: sigJson.manifestHash,
              verification_result: {
                signatureValid: true,
                manifestIntact: true,
                chainIntact: true
              },
              details: {
                caseId: targetCaseId,
                caseTitle,
                evidenceTag,
                originPublicKey: sigJson.publicKey,
                manifestHash: sigJson.manifestHash,
                importedBlocks: importedBlocksCount,
                extractedCertificates: extractedCertificatesCount,
                compliance: 'ISO/IEC 27037:2012 Digital Evidence Custody Transfer | Sec 65B IEA'
              }
            });
          } catch (_) {}
        }
      }

      return {
        isValid,
        manifestIntact,
        chainIntact,
        signatureValid,
        caseId: targetCaseId,
        caseRecord: {
          caseId: targetCaseId,
          title: caseTitle || `Forensic Case ${targetCaseId}`,
          evidenceTag: evidenceTag || 'EVD-PRIMARY-01',
          authorizingOfficer: authorizingOfficer || 'Judicial Authority',
          date: ledger.generatedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          notes: `Imported from sealed forensic evidence bundle. Origin Enclave: ${sigJson.publicKey?.slice(0, 16)}...`,
          classification: 'RESTRICTED / COURT-EVIDENTIARY',
          driveSerial: driveSerial || 'EXTERNAL-MEDIA',
          status: 'ACTIVE' as const
        },
        importedBlocksCount,
        extractedCertificatesCount,
        blockCount: blocks.length,
        publicKey: sigJson.publicKey || ledger.publicKey || '',
        errors
      };
    } catch (e: any) {
      return { isValid: false, manifestIntact: false, chainIntact: false, signatureValid: false, caseId: '', blockCount: 0, publicKey: '', errors: [`Failed to read forensic bundle: ${e.message}`] };
    }
  }

  private parseRow(row: any): AuditEntry {
    let details: any = {};
    let verificationResult: any = null;
    try {
      details = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
    } catch (_) {
      details = { __invalidSerializedValue: String(row.details) };
    }
    try {
      verificationResult = row.verification_result
        ? (typeof row.verification_result === 'string' ? JSON.parse(row.verification_result) : row.verification_result)
        : null;
    } catch (_) {
      verificationResult = { __invalidSerializedValue: String(row.verification_result) };
    }
    return {
      ...row,
      details,
      verification_result: verificationResult
    };
  }
}
