/**
 * SQLite driver abstraction.
 *
 * Two backends are supported behind one interface:
 *  - better-sqlite3 (production, inside Electron);
 *  - node:sqlite DatabaseSync (tests / environments where the native
 *    better-sqlite3 binary is not loadable).
 *
 * The driver fails over automatically: if better-sqlite3 cannot be imported
 * or opened (missing binary, ABI mismatch), node:sqlite is used instead.
 * Both backends expose synchronous statement APIs, so repositories stay
 * synchronous and transactions are real (BEGIN IMMEDIATE / SAVEPOINT), never
 * an insert-then-update sequence.
 */

import { PersistenceError } from '../types/errors';

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement {
  run(...params: unknown[]): RunResult;
  get<T = Record<string, unknown>>(...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(...params: unknown[]): T[];
}

export interface Driver {
  readonly backend: 'better-sqlite3' | 'node:sqlite';
  readonly filePath: string;

  exec(sql: string): void;
  prepare(sql: string): Statement;
  /** Convenience helpers (same normalization as prepare). */
  run(sql: string, ...params: unknown[]): RunResult;
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];

  /**
   * Runs fn inside a real transaction. Depth 0 uses BEGIN IMMEDIATE;
   * nested calls use SAVEPOINTs. Rolls back on any throw.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}

interface SqliteStatementLike {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDbLike {
  prepare(sql: string): SqliteStatementLike;
  exec(sql: string): void;
  close(): void;
}

type SqliteCtor = new (filePath: string) => SqliteDbLike;

/** Booleans and undefined are not bindable in either backend. */
function normalizeParam(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  throw new PersistenceError('INPUT_INVALID', `cannot bind value of type ${typeof value} to SQL parameter`);
}

function normalizeParams(params: readonly unknown[]): SqlValue[] {
  return params.map(normalizeParam);
}

/** Maps SQLite driver errors onto the shared error model. */
function wrapSqliteError(err: unknown, sql: string): PersistenceError {
  if (err instanceof PersistenceError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code.includes('BUSY') || code.includes('LOCKED')) {
    return new PersistenceError('PERSISTENCE_BUSY', `database is busy: ${message}`);
  }
  const isConstraint =
    code.includes('CONSTRAINT') ||
    /constraint failed|foreign key|unique constraint|check constraint|not null constraint/i.test(message);
  if (isConstraint) {
    return new PersistenceError('CONSTRAINT_VIOLATION', `constraint violation: ${message}`);
  }
  if (code.includes('CORRUPT') || code.includes('NOTADB') || code.includes('MALFORMED')) {
    return new PersistenceError('PERSISTENCE_INTEGRITY', `database is corrupt: ${message}`);
  }
  return new PersistenceError('PERSISTENCE_UNAVAILABLE', `SQL failed (${message}) in: ${sql.slice(0, 200)}`);
}

function createDriver(backend: 'better-sqlite3' | 'node:sqlite', db: SqliteDbLike, filePath: string): Driver {
  let depth = 0;
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new PersistenceError('PERSISTENCE_UNAVAILABLE', 'database handle is closed');
    }
  }

  function rawExec(sql: string): void {
    assertOpen();
    try {
      db.exec(sql);
    } catch (err) {
      throw wrapSqliteError(err, sql);
    }
  }

  const driver: Driver = {
    backend,
    filePath,

    exec: rawExec,

    prepare(sql: string): Statement {
      assertOpen();
      let stmt: SqliteStatementLike;
      try {
        stmt = db.prepare(sql);
      } catch (err) {
        throw wrapSqliteError(err, sql);
      }
      return {
        run(...params: unknown[]): RunResult {
          try {
            const result = stmt.run(...normalizeParams(params));
            return {
              changes: Number(result.changes),
              lastInsertRowid: Number(result.lastInsertRowid)
            };
          } catch (err) {
            throw wrapSqliteError(err, sql);
          }
        },
        get<T = Record<string, unknown>>(...params: unknown[]): T | undefined {
          try {
            return stmt.get(...normalizeParams(params)) as T | undefined;
          } catch (err) {
            throw wrapSqliteError(err, sql);
          }
        },
        all<T = Record<string, unknown>>(...params: unknown[]): T[] {
          try {
            return stmt.all(...normalizeParams(params)) as T[];
          } catch (err) {
            throw wrapSqliteError(err, sql);
          }
        }
      };
    },

    run(sql: string, ...params: unknown[]): RunResult {
      return driver.prepare(sql).run(...params);
    },

    get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
      return driver.prepare(sql).get<T>(...params);
    },

    all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
      return driver.prepare(sql).all<T>(...params);
    },

    transaction<T>(fn: () => T): T {
      assertOpen();
      if (depth > 0) {
        const savepoint = `cs_sp_${depth}`;
        depth += 1;
        rawExec(`SAVEPOINT ${savepoint}`);
        try {
          const result = fn();
          rawExec(`RELEASE ${savepoint}`);
          return result;
        } catch (err) {
          try {
            rawExec(`ROLLBACK TO ${savepoint}`);
            rawExec(`RELEASE ${savepoint}`);
          } catch {
            // rollback failure must not mask the original error
          }
          throw err;
        } finally {
          depth -= 1;
        }
      }

      rawExec('BEGIN IMMEDIATE');
      depth = 1;
      try {
        const result = fn();
        rawExec('COMMIT');
        return result;
      } catch (err) {
        try {
          rawExec('ROLLBACK');
        } catch {
          // rollback failure must not mask the original error
        }
        throw err;
      } finally {
        depth = 0;
      }
    },

    close(): void {
      if (closed) return;
      closed = true;
      try {
        db.close();
      } catch {
        // closing an already-broken handle is not an error worth surfacing
      }
    }
  };

  return driver;
}

async function openBetterSqlite3(filePath: string): Promise<Driver | null> {
  try {
    const ns = (await import('better-sqlite3')) as unknown;
    let ctor: SqliteCtor | undefined;
    if (typeof ns === 'function') {
      ctor = ns as SqliteCtor;
    } else if (typeof ns === 'object' && ns !== null && 'default' in ns) {
      const maybe = (ns as { default?: unknown }).default;
      if (typeof maybe === 'function') ctor = maybe as SqliteCtor;
    }
    if (!ctor) return null;
    const db = new ctor(filePath);
    return createDriver('better-sqlite3', db, filePath);
  } catch {
    return null;
  }
}

async function openNodeSqlite(filePath: string): Promise<Driver | null> {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(filePath);
    return createDriver('node:sqlite', db as unknown as SqliteDbLike, filePath);
  } catch {
    return null;
  }
}

/**
 * Opens a database file (or ':memory:'), preferring better-sqlite3 and
 * falling back to node:sqlite. Throws PERSISTENCE_UNAVAILABLE when neither
 * backend can be loaded — never silently returns a non-durable store.
 */
export async function openDriver(filePath: string): Promise<Driver> {
  const driver = (await openBetterSqlite3(filePath)) ?? (await openNodeSqlite(filePath));
  if (!driver) {
    throw new PersistenceError(
      'PERSISTENCE_UNAVAILABLE',
      'no SQLite backend is available (better-sqlite3 failed to load and node:sqlite is unavailable)'
    );
  }
  return driver;
}
