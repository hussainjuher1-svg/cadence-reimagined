import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  { version: 1, sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
      password_hash TEXT NOT NULL,
      default_timezone TEXT NOT NULL DEFAULT 'UTC',
      default_language_from TEXT NOT NULL DEFAULT '',
      default_language_to TEXT NOT NULL DEFAULT '',
      onboarding_step INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      idle_expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE TABLE password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
      client_label TEXT NOT NULL DEFAULT '' CHECK(length(client_label) <= 160),
      language_from TEXT NOT NULL,
      language_to TEXT NOT NULL,
      scheduled_start_utc TEXT NOT NULL,
      timezone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
      started_at TEXT,
      ended_at TEXT,
      cancelled_at TEXT,
      duration_seconds INTEGER,
      completion_summary TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX sessions_owner_status_start_idx ON sessions(owner_id,status,scheduled_start_utc);
    CREATE TABLE session_prep (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      goal TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      tone_register TEXT NOT NULL DEFAULT '',
      names_pronunciation TEXT NOT NULL DEFAULT '',
      open_questions TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE prep_checks (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      item_key TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','done','not_needed')),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(session_id,item_key)
    );
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('source','interpretation','note')),
      body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      edited_at TEXT
    );
    CREATE INDEX entries_session_sequence_idx ON entries(session_id,sequence);
    CREATE TABLE terms (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_term TEXT NOT NULL CHECK(length(source_term) BETWEEN 1 AND 200),
      target_term TEXT NOT NULL CHECK(length(target_term) BETWEEN 1 AND 200),
      context_register TEXT NOT NULL DEFAULT '' CHECK(length(context_register) <= 500),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX terms_session_idx ON terms(session_id);
    CREATE TABLE followups (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 1000),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX followups_session_status_idx ON followups(session_id,status);
    CREATE TABLE rate_limit_buckets (
      key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      hits INTEGER NOT NULL
    );
    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      record_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX activity_created_idx ON activity_log(created_at);
    CREATE TABLE request_idempotency (
      key TEXT PRIMARY KEY,
      purpose TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE idempotency_keys (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,key)
    );
  ` },
];

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(migration.version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const fk = db.prepare('PRAGMA foreign_keys').get();
  if (fk.foreign_keys !== 1) throw new Error('SQLite foreign keys could not be enabled.');
  return db;
}
