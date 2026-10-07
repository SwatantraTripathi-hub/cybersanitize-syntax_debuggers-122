/**
 * Database bootstrap: opens the driver, applies pragmas, verifies integrity
 * and runs migrations. Exposes the handle repositories are built on.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PersistenceError } from '../types/errors';
import { applyMigrations } from './migrations';
import { Driver, openDriver } from './driver';

export interface Database {
  readonly driver: Driver;
  readonly filePath: string;
  close(): void;
}

export interface OpenDatabaseOptions {
  /** Directory for the database file (created if missing). Ignored for ':memory:'. */
  directory?: string;
  fileName?: string;
}

const DEFAULT_FILE_NAME = 'cybersanitize.db';

/**
 * Opens (and migrates) the application database.
 * Throws PERSISTENCE_* / MIGRATION_* errors — never silently degrades.
 */
export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<Database> {
  const fileName = options.fileName ?? DEFAULT_FILE_NAME;
  let filePath = ':memory:';

  if (options.directory) {
    try {
      fs.mkdirSync(options.directory, { recursive: true });
    } catch (err) {
      throw new PersistenceError(
        'PERSISTENCE_UNAVAILABLE',
        `cannot create database directory "${options.directory}": ${(err as Error).message}`
      );
    }
    filePath = path.join(options.directory, fileName);
  }

  const driver = await openDriver(filePath);

  try {
    // Durability and isolation pragmas (WAL is skipped silently for
    // in-memory databases, which do not support it).
    if (filePath !== ':memory:') {
      driver.exec('PRAGMA journal_mode = WAL');
    }
    driver.exec('PRAGMA foreign_keys = ON');
    driver.exec('PRAGMA synchronous = FULL');
    driver.exec('PRAGMA busy_timeout = 5000');

    const integrity = driver.all<{ quick_check: string }>('PRAGMA quick_check');
    const verdict = integrity.map((row) => row.quick_check).join('; ');
    if (verdict !== 'ok') {
      throw new PersistenceError(
        'PERSISTENCE_INTEGRITY',
        `database failed integrity check: ${verdict || 'no result'}`
      );
    }

    applyMigrations(driver);
  } catch (err) {
    driver.close();
    throw err;
  }

  return {
    driver,
    filePath,
    close(): void {
      driver.close();
    }
  };
}
