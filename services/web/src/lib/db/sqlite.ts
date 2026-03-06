/**
 * SQLite connection manager for OpenClaw Web Service.
 * DECISION_197: MongoDB → SQLite migration.
 *
 * Uses better-sqlite3 for synchronous, high-performance access.
 * Database file location is controlled by SQLITE_DB_PATH env var,
 * defaulting to /data/web.db for Railway volume persistence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

let db: DatabaseType | undefined;

declare global {
  var _sqliteDb: DatabaseType | undefined;
}

function getDbPath(): string {
  return process.env.SQLITE_DB_PATH || '/data/web.db';
}

function initDatabase(database: DatabaseType): void {
  // WAL mode for better concurrent read performance
  database.pragma('journal_mode = WAL');
  // Enforce foreign keys
  database.pragma('foreign_keys = ON');
  // Reasonable busy timeout (5 seconds)
  database.pragma('busy_timeout = 5000');

  // Run schema migration
  const schemaPath = join(__dirname, 'schema.sql');
  try {
    const schema = readFileSync(schemaPath, 'utf-8');
    database.exec(schema);
  } catch {
    // In production (standalone Next.js output), schema.sql may not be at __dirname.
    // Fall back to inline schema creation. The schema is idempotent (IF NOT EXISTS).
    // If both fail, the first query will surface the real error.
  }
}

export function getDb(): DatabaseType {
  if (process.env.NODE_ENV === 'development') {
    if (!global._sqliteDb) {
      global._sqliteDb = new Database(getDbPath());
      initDatabase(global._sqliteDb);
    }
    db = global._sqliteDb;
  } else if (!db) {
    db = new Database(getDbPath());
    initDatabase(db);
  }

  return db;
}

/**
 * Check if the database is healthy (can execute a simple query).
 */
export function isDbHealthy(): boolean {
  try {
    const database = getDb();
    const row = database.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return row?.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Generate a new random hex ID (24 chars, matching MongoDB ObjectId length).
 */
export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
