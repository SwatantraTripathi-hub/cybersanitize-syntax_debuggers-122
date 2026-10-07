/**
 * Forward-only, checksummed migrations.
 *
 * Rules:
 *  - every migration runs inside a single transaction with its record in
 *    schema_migrations — apply and record are atomic;
 *  - the checksum binds a recorded migration to its SQL text; if the SQL of
 *    an already-applied migration is later edited, startup fails with
 *    MIGRATION_CHECKSUM_MISMATCH instead of running against an unknown schema;
 *  - there are no down migrations: forensic data is never dropped by tooling;
 *  - legacy databases (tables created by older app versions) are upgraded by
 *    additive ALTER TABLE statements — columns are added, never rewritten,
 *    and existing row values are left untouched.
 */

import { sha256Hex } from '../crypto/hash';
import { PersistenceError } from '../types/errors';
import { GENESIS_PREV_HASH } from '../crypto/hashChain';
import type { Driver } from './driver';

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  {
    id: 1,
    name: 'audit_logs',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        operation TEXT NOT NULL,
        target TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL,
        operator TEXT NOT NULL,
        hash_before TEXT,
        hash_after TEXT,
        verification_result TEXT,
        prev_hash TEXT NOT NULL DEFAULT '${GENESIS_PREV_HASH}',
        entry_hash TEXT NOT NULL DEFAULT '',
        signature TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation);
    `
  },
  {
    id: 2,
    name: 'cases',
    sql: `
      CREATE TABLE IF NOT EXISTS cases (
        case_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        evidence_tag TEXT NOT NULL DEFAULT '',
        authorizing_officer TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        classification TEXT NOT NULL DEFAULT '',
        drive_serial TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        mode TEXT NOT NULL DEFAULT 'SINGLE',
        fleet_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    id: 3,
    name: 'evidence_and_custody',
    sql: `
      CREATE TABLE IF NOT EXISTS evidence (
        evidence_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_path TEXT NOT NULL,
        source_sha256 TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        operator TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (case_id) REFERENCES cases(case_id)
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
      CREATE TABLE IF NOT EXISTS custody_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        UNIQUE (evidence_id, seq),
        FOREIGN KEY (evidence_id) REFERENCES evidence(evidence_id) ON DELETE CASCADE
      );
    `
  },
  {
    id: 4,
    name: 'operators',
    sql: `
      CREATE TABLE IF NOT EXISTS operators (
        operator_id TEXT PRIMARY KEY,
        permission_level TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        registered_at TEXT NOT NULL,
        registered_by TEXT NOT NULL DEFAULT ''
      );
    `
  },
  {
    id: 5,
    name: 'legacy_audit_case_id_column',
    sql: `
      -- Additive upgrade for databases created before case scoping existed.
      -- ALTER TABLE ADD COLUMN is a no-op when the column already exists?
      -- No: SQLite errors on duplicate columns, so this migration is guarded
      -- in applyMigrations() via PRAGMA table_info before running.
      SELECT 1;
    `
  }
]);

export function migrationChecksum(migration: Migration): string {
  return sha256Hex(`v${migration.id}:${migration.name}:${migration.sql.trim()}`);
}

interface AppliedRow {
  id: number;
  name: string;
  checksum: string;
}

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

function columnNames(driver: Driver, table: string): Set<string> {
  const rows = driver.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => row.name));
}

function tableExists(driver: Driver, table: string): boolean {
  const row = driver.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    table
  );
  return row !== undefined;
}

/**
 * Applies pending migrations. Idempotent: running it twice applies nothing
 * the second time. Throws MIGRATION_CHECKSUM_MISMATCH when an applied
 * migration's SQL was edited after the fact.
 */
export function applyMigrations(driver: Driver): { applied: number[]; alreadyApplied: number[] } {
  driver.exec(MIGRATIONS_TABLE_SQL);

  const appliedRows = driver.all<AppliedRow>('SELECT id, name, checksum FROM schema_migrations ORDER BY id ASC');
  const appliedById = new Map(appliedRows.map((row) => [row.id, row]));

  const knownIds = new Set(MIGRATIONS.map((m) => m.id));
  for (const row of appliedRows) {
    if (!knownIds.has(row.id)) {
      throw new PersistenceError(
        'MIGRATION_FAILED',
        `database records migration #${row.id} (${row.name}) which this build does not know about; ` +
          'the database was created by a newer or foreign version of the application'
      );
    }
  }

  const result: { applied: number[]; alreadyApplied: number[] } = { applied: [], alreadyApplied: [] };

  for (const migration of MIGRATIONS) {
    const existing = appliedById.get(migration.id);
    const checksum = migrationChecksum(migration);

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new PersistenceError(
          'MIGRATION_CHECKSUM_MISMATCH',
          `migration #${migration.id} (${migration.name}) was modified after it was applied ` +
            '(recorded checksum does not match this build); refusing to run against an unknown schema'
        );
      }
      result.alreadyApplied.push(migration.id);
      continue;
    }

    // Pre-migration fixups that require conditional SQL (duplicate-column
    // ALTERs are not idempotent in SQLite). Migration #1's CREATE TABLE is a
    // no-op when a legacy audit_logs already exists, so every column the
    // current schema needs is added here — additively, never rewriting rows.
    if (migration.id === 5) {
      driver.transaction(() => {
        if (tableExists(driver, 'audit_logs')) {
          const cols = columnNames(driver, 'audit_logs');
          const addColumn = (definition: string): void => {
            driver.exec(`ALTER TABLE audit_logs ADD COLUMN ${definition}`);
          };
          if (!cols.has('case_id')) addColumn("case_id TEXT NOT NULL DEFAULT ''");
          if (!cols.has('prev_hash')) addColumn(`prev_hash TEXT NOT NULL DEFAULT '${GENESIS_PREV_HASH}'`);
          if (!cols.has('entry_hash')) addColumn("entry_hash TEXT NOT NULL DEFAULT ''");
          if (!cols.has('signature')) addColumn("signature TEXT NOT NULL DEFAULT ''");
          if (!cols.has('hash_before')) addColumn('hash_before TEXT');
          if (!cols.has('hash_after')) addColumn('hash_after TEXT');
          if (!cols.has('verification_result')) addColumn('verification_result TEXT');
          if (!cols.has('details')) addColumn("details TEXT NOT NULL DEFAULT '{}'");
          driver.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_case ON audit_logs(case_id)');
        }
        driver.run(
          'INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
          migration.id,
          migration.name,
          checksum,
          new Date().toISOString()
        );
      });
      result.applied.push(migration.id);
      continue;
    }

    driver.transaction(() => {
      driver.exec(migration.sql);
      driver.run(
        'INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        migration.id,
        migration.name,
        checksum,
        new Date().toISOString()
      );
    });
    result.applied.push(migration.id);
  }

  return result;
}
