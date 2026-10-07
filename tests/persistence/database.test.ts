import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/persistence/database';
import { applyMigrations, MIGRATIONS, migrationChecksum } from '../../src/main/persistence/migrations';
import { openDriver } from '../../src/main/persistence/driver';
import { PersistenceError } from '../../src/main/types/errors';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-db-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function openTempDb(fileName = 'test.db') {
  const directory = tempDir();
  const db = await openDatabase({ directory, fileName });
  cleanups.push(() => db.close());
  return { db, directory };
}

describe('openDatabase', () => {
  it('creates the database with all tables', async () => {
    const { db } = await openTempDb();
    const tables = db.driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((row) => row.name);
    for (const expected of ['audit_logs', 'cases', 'evidence', 'custody_events', 'operators', 'schema_migrations']) {
      expect(tables).toContain(expected);
    }
  });

  it('enforces foreign keys and WAL durability pragmas', async () => {
    const { db } = await openTempDb();
    expect(db.driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1);
    const journal = db.driver.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode;
    expect(journal).toBe('wal');
  });

  it('passes its own integrity check', async () => {
    const { db } = await openTempDb();
    const check = db.driver.all<{ quick_check: string }>('PRAGMA quick_check');
    expect(check.map((r) => r.quick_check).join('')).toBe('ok');
  });

  it('is idempotent: reopening applies no new migrations', async () => {
    const directory = tempDir();
    const first = await openDatabase({ directory });
    const firstApplied = first.driver.all<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id');
    first.close();

    const second = await openDatabase({ directory });
    const secondApplied = second.driver.all<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id');
    second.close();
    expect(secondApplied).toEqual(firstApplied);
    expect(secondApplied.length).toBe(MIGRATIONS.length);
  });
});

describe('applyMigrations', () => {
  it('records every migration with its checksum', async () => {
    const { db } = await openTempDb();
    const rows = db.driver.all<{ id: number; checksum: string }>(
      'SELECT id, checksum FROM schema_migrations ORDER BY id'
    );
    expect(rows.length).toBe(MIGRATIONS.length);
    for (const row of rows) {
      const migration = MIGRATIONS.find((m) => m.id === row.id)!;
      expect(row.checksum).toBe(migrationChecksum(migration));
    }
  });

  it('fails with MIGRATION_CHECKSUM_MISMATCH when an applied migration was edited', async () => {
    const { db } = await openTempDb();
    db.driver.run("UPDATE schema_migrations SET checksum = 'tampered' WHERE id = 1");
    expect(() => applyMigrations(db.driver)).toThrowError(/MIGRATION_CHECKSUM_MISMATCH|modified after/);
  });

  it('fails when the database records a migration this build does not know', async () => {
    const { db } = await openTempDb();
    db.driver.run(
      'INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      999,
      'from-the-future',
      'x',
      new Date().toISOString()
    );
    expect(() => applyMigrations(db.driver)).toThrowError(/newer or foreign/);
  });

  it('upgrades a legacy audit_logs table missing case_id additively', async () => {
    const directory = tempDir();
    const driver = await openDriver(path.join(directory, 'legacy.db'));
    cleanups.push(() => driver.close());

    // Legacy schema from the reference implementation: no case_id column.
    driver.exec(`
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        operation TEXT NOT NULL,
        target TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL,
        operator TEXT NOT NULL
      );
    `);
    driver.run(
      "INSERT INTO audit_logs (timestamp, operation, target, details, status, operator) VALUES (?, ?, ?, ?, ?, ?)",
      '2025-01-01T00:00:00.000Z',
      'FILE_ERASE',
      'old.bin',
      '{}',
      'COMPLETED',
      'legacy-op'
    );

    applyMigrations(driver);

    const cols = driver.all<{ name: string }>('PRAGMA table_info(audit_logs)').map((r) => r.name);
    expect(cols).toContain('case_id');
    expect(cols).toContain('entry_hash');
    expect(cols).toContain('signature');

    // Existing rows were not rewritten.
    const row = driver.get<{ operator: string; case_id: string }>(
      'SELECT operator, case_id FROM audit_logs WHERE id = 1'
    );
    expect(row?.operator).toBe('legacy-op');
    expect(row?.case_id).toBe('');
  });

  it('is a no-op when case_id already exists (no duplicate-column error)', async () => {
    const { db } = await openTempDb();
    expect(() => applyMigrations(db.driver)).not.toThrow();
  });
});

describe('integrity failures', () => {
  it('a corrupt database file is refused at open, not silently replaced', async () => {
    const directory = tempDir();
    const file = path.join(directory, 'corrupt.db');
    fs.writeFileSync(file, 'this is definitely not a sqlite database file');
    await expect(openDatabase({ directory, fileName: 'corrupt.db' })).rejects.toThrow(PersistenceError);
    // The file is still there for manual recovery; nothing was deleted.
    expect(fs.existsSync(file)).toBe(true);
  });
});
