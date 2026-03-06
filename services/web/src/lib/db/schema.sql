-- OpenClaw Web Service — SQLite Schema
-- DECISION_197: MongoDB to SQLite migration
-- All 11 collections converted to tables with proper indexes.
-- FTS5 virtual table for book full-text search.

-- =========================================================================
-- Users
-- =========================================================================
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  password    TEXT,
  password_hash TEXT,
  prefs       TEXT,  -- JSON blob
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- =========================================================================
-- Book sections
-- =========================================================================
CREATE TABLE IF NOT EXISTS book_sections (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  slug          TEXT NOT NULL UNIQUE,
  part_index    INTEGER NOT NULL DEFAULT 0,
  part_slug     TEXT NOT NULL DEFAULT '',
  part_title    TEXT NOT NULL DEFAULT '',
  chapter_index INTEGER NOT NULL DEFAULT 0,
  chapter_slug  TEXT NOT NULL DEFAULT '',
  chapter_title TEXT NOT NULL DEFAULT '',
  section_index INTEGER NOT NULL DEFAULT 0,
  section_slug  TEXT NOT NULL DEFAULT '',
  section_title TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  frontmatter   TEXT,  -- JSON blob
  headings      TEXT,  -- JSON array
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  version       INTEGER DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_book_sections_status ON book_sections(status);
CREATE INDEX IF NOT EXISTS idx_book_sections_ordering ON book_sections(part_index, chapter_index, section_index);

-- =========================================================================
-- Book sections FTS5 (full-text search)
-- =========================================================================
CREATE VIRTUAL TABLE IF NOT EXISTS book_sections_fts USING fts5(
  slug,
  body_markdown,
  content='book_sections',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS book_sections_ai AFTER INSERT ON book_sections BEGIN
  INSERT INTO book_sections_fts(rowid, slug, body_markdown)
    VALUES (new.rowid, new.slug, new.body_markdown);
END;

CREATE TRIGGER IF NOT EXISTS book_sections_ad AFTER DELETE ON book_sections BEGIN
  INSERT INTO book_sections_fts(book_sections_fts, rowid, slug, body_markdown)
    VALUES ('delete', old.rowid, old.slug, old.body_markdown);
END;

CREATE TRIGGER IF NOT EXISTS book_sections_au AFTER UPDATE ON book_sections BEGIN
  INSERT INTO book_sections_fts(book_sections_fts, rowid, slug, body_markdown)
    VALUES ('delete', old.rowid, old.slug, old.body_markdown);
  INSERT INTO book_sections_fts(rowid, slug, body_markdown)
    VALUES (new.rowid, new.slug, new.body_markdown);
END;

-- =========================================================================
-- Book table of contents
-- =========================================================================
CREATE TABLE IF NOT EXISTS book_toc (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  tree              TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  published_version INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
-- Notes
-- =========================================================================
CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  user_id      TEXT NOT NULL REFERENCES users(id),
  section_slug TEXT NOT NULL,
  anchor_id    TEXT,
  selection    TEXT,  -- JSON blob { text, startOffset, endOffset }
  title        TEXT,
  body         TEXT NOT NULL,
  tags         TEXT DEFAULT '[]',  -- JSON array
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_section ON notes(user_id, section_slug);

-- =========================================================================
-- Highlights
-- =========================================================================
CREATE TABLE IF NOT EXISTS highlights (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  user_id      TEXT NOT NULL REFERENCES users(id),
  section_slug TEXT NOT NULL,
  anchor_id    TEXT,
  range_start  INTEGER NOT NULL,
  range_end    INTEGER NOT NULL,
  text         TEXT NOT NULL,
  color        TEXT DEFAULT 'yellow',
  note_id      TEXT REFERENCES notes(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);

-- =========================================================================
-- Bookmarks
-- =========================================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  user_id      TEXT NOT NULL REFERENCES users(id),
  section_slug TEXT NOT NULL,
  anchor_id    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, section_slug);

-- =========================================================================
-- Reading progress
-- =========================================================================
CREATE TABLE IF NOT EXISTS reading_progress (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  user_id        TEXT NOT NULL REFERENCES users(id),
  section_slug   TEXT NOT NULL,
  percent        REAL NOT NULL DEFAULT 0,
  last_anchor_id TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, section_slug)
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON reading_progress(user_id);

-- =========================================================================
-- Playbooks
-- =========================================================================
CREATE TABLE IF NOT EXISTS playbooks (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title           TEXT NOT NULL,
  triggers        TEXT DEFAULT '[]',  -- JSON array
  checklist       TEXT DEFAULT '[]',  -- JSON array
  scenario_tree   TEXT DEFAULT '',
  linked_sections TEXT DEFAULT '[]',  -- JSON array
  tags            TEXT DEFAULT '[]',  -- JSON array
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  published_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_playbooks_status ON playbooks(status);
CREATE INDEX IF NOT EXISTS idx_playbooks_created_by ON playbooks(created_by);

-- =========================================================================
-- Agent runs
-- =========================================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  user_id      TEXT NOT NULL REFERENCES users(id),
  skill        TEXT NOT NULL,
  context      TEXT DEFAULT '{}',  -- JSON blob
  output       TEXT DEFAULT '{}',  -- JSON blob
  saved_to     TEXT,               -- JSON blob { noteId?, playbookId? }
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id);

-- =========================================================================
-- Audit log
-- =========================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  actor_user_id TEXT,
  action        TEXT NOT NULL,
  details       TEXT DEFAULT '{}',  -- JSON blob
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- =========================================================================
-- Rate limits
-- =========================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created ON rate_limits(created_at);
