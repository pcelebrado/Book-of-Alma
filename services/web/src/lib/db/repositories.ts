/**
 * SQLite repository layer for OpenClaw Web Service.
 * DECISION_197: MongoDB → SQLite migration.
 *
 * Replaces collections.ts — each function maps to a former MongoDB collection.
 * All IDs are 24-char hex strings (same length as MongoDB ObjectId).
 * JSON fields are stored as TEXT and parsed on read.
 */
import type { Database as DatabaseType } from 'better-sqlite3';

import { getDb, newId } from '@/lib/db/sqlite';

// =========================================================================
// Shared types (kept compatible with existing API contracts)
// =========================================================================

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  password: string | null;
  password_hash: string | null;
  prefs: string | null; // JSON
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface BookSectionRow {
  id: string;
  slug: string;
  part_index: number;
  part_slug: string;
  part_title: string;
  chapter_index: number;
  chapter_slug: string;
  chapter_title: string;
  section_index: number;
  section_slug: string;
  section_title: string;
  body_markdown: string;
  frontmatter: string | null; // JSON
  headings: string | null; // JSON array
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface BookTocRow {
  id: string;
  tree: string; // JSON
  published_version: number;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  user_id: string;
  section_slug: string;
  anchor_id: string | null;
  selection: string | null; // JSON
  title: string | null;
  body: string;
  tags: string; // JSON array
  created_at: string;
  updated_at: string;
}

export interface HighlightRow {
  id: string;
  user_id: string;
  section_slug: string;
  anchor_id: string | null;
  range_start: number;
  range_end: number;
  text: string;
  color: string;
  note_id: string | null;
  created_at: string;
}

export interface BookmarkRow {
  id: string;
  user_id: string;
  section_slug: string;
  anchor_id: string | null;
  created_at: string;
}

export interface ReadingProgressRow {
  id: string;
  user_id: string;
  section_slug: string;
  percent: number;
  last_anchor_id: string | null;
  updated_at: string;
}

export interface PlaybookRow {
  id: string;
  status: string;
  title: string;
  triggers: string; // JSON array
  checklist: string; // JSON array
  scenario_tree: string;
  linked_sections: string; // JSON array
  tags: string; // JSON array
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  details: string; // JSON
  created_at: string;
}

export interface RateLimitRow {
  id: string;
  key: string;
  window_start: number;
  count: number;
  created_at: string;
}

// =========================================================================
// Helper: get DB instance
// =========================================================================

function db(): DatabaseType {
  return getDb();
}

function now(): string {
  return new Date().toISOString();
}

// =========================================================================
// Users
// =========================================================================

export const users = {
  count(): number {
    const row = db().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    return row.c;
  },

  findByEmail(email: string): UserRow | undefined {
    return db().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  },

  findById(id: string): UserRow | undefined {
    return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  },

  insert(data: {
    email: string;
    name: string;
    role: 'admin' | 'user';
    passwordHash?: string;
    password?: string;
  }): string {
    const id = newId();
    const ts = now();
    db().prepare(
      `INSERT INTO users (id, email, name, role, password, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, data.email, data.name, data.role, data.password ?? null, data.passwordHash ?? null, ts, ts);
    return id;
  },

  updateLastLogin(id: string): void {
    const ts = now();
    db().prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
  },
};

// =========================================================================
// Book Sections
// =========================================================================

export const bookSections = {
  findBySlug(slug: string, preferPublished = true): BookSectionRow | undefined {
    if (preferPublished) {
      const published = db().prepare(
        'SELECT * FROM book_sections WHERE slug = ? AND status = ?',
      ).get(slug, 'published') as BookSectionRow | undefined;
      if (published) return published;
    }
    return db().prepare('SELECT * FROM book_sections WHERE slug = ?').get(slug) as BookSectionRow | undefined;
  },

  findPublishedOrdered(): BookSectionRow[] {
    return db().prepare(
      `SELECT * FROM book_sections WHERE status = 'published'
       ORDER BY part_index, chapter_index, section_index`,
    ).all() as BookSectionRow[];
  },

  findPublishedSlugsOrdered(): { slug: string }[] {
    return db().prepare(
      `SELECT slug, part_index, chapter_index, section_index
       FROM book_sections WHERE status = 'published'
       ORDER BY part_index, chapter_index, section_index`,
    ).all() as { slug: string }[];
  },

  /**
   * Full-text search using FTS5.
   * Falls back to LIKE search if FTS table is empty or query fails.
   */
  search(query: string, limit = 20): Array<BookSectionRow & { rank: number }> {
    try {
      const rows = db().prepare(
        `SELECT bs.*, fts.rank
         FROM book_sections_fts fts
         JOIN book_sections bs ON bs.rowid = fts.rowid
         WHERE book_sections_fts MATCH ?
         ORDER BY fts.rank
         LIMIT ?`,
      ).all(query, limit) as Array<BookSectionRow & { rank: number }>;

      if (rows.length > 0) return rows;
    } catch {
      // FTS may not be populated yet — fall through to LIKE
    }

    // Fallback: LIKE search
    const safe = `%${query}%`;
    return db().prepare(
      `SELECT *, 0 AS rank FROM book_sections
       WHERE slug LIKE ? OR body_markdown LIKE ?
       LIMIT ?`,
    ).all(safe, safe, limit) as Array<BookSectionRow & { rank: number }>;
  },
};

// =========================================================================
// Book TOC
// =========================================================================

export const bookToc = {
  findDefault(): BookTocRow | undefined {
    const row = db().prepare("SELECT * FROM book_toc WHERE id = 'default'").get() as BookTocRow | undefined;
    if (row) return row;
    // Fallback: latest entry
    return db().prepare('SELECT * FROM book_toc ORDER BY updated_at DESC LIMIT 1').get() as BookTocRow | undefined;
  },
};

// =========================================================================
// Notes
// =========================================================================

export const notes = {
  insert(data: {
    userId: string;
    sectionSlug: string;
    anchorId?: string;
    selection?: { text: string; startOffset: number; endOffset: number };
    title?: string;
    body: string;
    tags?: string[];
  }): NoteRow {
    const id = newId();
    const ts = now();
    db().prepare(
      `INSERT INTO notes (id, user_id, section_slug, anchor_id, selection, title, body, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.userId,
      data.sectionSlug,
      data.anchorId ?? null,
      data.selection ? JSON.stringify(data.selection) : null,
      data.title ?? null,
      data.body,
      JSON.stringify(data.tags ?? []),
      ts,
      ts,
    );
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow;
  },

  findByUser(userId: string, sectionSlug?: string): NoteRow[] {
    if (sectionSlug) {
      return db().prepare(
        'SELECT * FROM notes WHERE user_id = ? AND section_slug = ? ORDER BY updated_at DESC',
      ).all(userId, sectionSlug) as NoteRow[];
    }
    return db().prepare(
      'SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC',
    ).all(userId) as NoteRow[];
  },

  update(id: string, userId: string, updates: Record<string, unknown>): NoteRow | undefined {
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now()];

    if (typeof updates.body === 'string') {
      fields.push('body = ?');
      values.push(updates.body);
    }
    if (Array.isArray(updates.tags)) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (typeof updates.title === 'string') {
      fields.push('title = ?');
      values.push(updates.title);
    }

    values.push(id, userId);
    const result = db().prepare(
      `UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    ).run(...values);

    if (result.changes === 0) return undefined;
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow;
  },

  delete(id: string, userId: string): boolean {
    const result = db().prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  },
};

// =========================================================================
// Highlights
// =========================================================================

export const highlights = {
  insert(data: {
    userId: string;
    sectionSlug: string;
    anchorId?: string;
    range: { startOffset: number; endOffset: number };
    text: string;
    color?: string;
    noteId?: string;
  }): HighlightRow {
    const id = newId();
    const ts = now();
    db().prepare(
      `INSERT INTO highlights (id, user_id, section_slug, anchor_id, range_start, range_end, text, color, note_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.userId,
      data.sectionSlug,
      data.anchorId ?? null,
      data.range.startOffset,
      data.range.endOffset,
      data.text,
      data.color ?? 'yellow',
      data.noteId ?? null,
      ts,
    );
    return db().prepare('SELECT * FROM highlights WHERE id = ?').get(id) as HighlightRow;
  },
};

// =========================================================================
// Bookmarks
// =========================================================================

export const bookmarks = {
  findOne(userId: string, sectionSlug: string, anchorId?: string): BookmarkRow | undefined {
    if (anchorId) {
      return db().prepare(
        'SELECT * FROM bookmarks WHERE user_id = ? AND section_slug = ? AND anchor_id = ?',
      ).get(userId, sectionSlug, anchorId) as BookmarkRow | undefined;
    }
    return db().prepare(
      'SELECT * FROM bookmarks WHERE user_id = ? AND section_slug = ? AND anchor_id IS NULL',
    ).get(userId, sectionSlug) as BookmarkRow | undefined;
  },

  insert(data: { userId: string; sectionSlug: string; anchorId?: string }): void {
    const id = newId();
    db().prepare(
      'INSERT INTO bookmarks (id, user_id, section_slug, anchor_id, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, data.userId, data.sectionSlug, data.anchorId ?? null, now());
  },

  delete(id: string): void {
    db().prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  },
};

// =========================================================================
// Reading Progress
// =========================================================================

export const readingProgress = {
  upsert(data: {
    userId: string;
    sectionSlug: string;
    percent: number;
    lastAnchorId?: string;
  }): ReadingProgressRow {
    const ts = now();
    const existing = db().prepare(
      'SELECT id FROM reading_progress WHERE user_id = ? AND section_slug = ?',
    ).get(data.userId, data.sectionSlug) as { id: string } | undefined;

    if (existing) {
      db().prepare(
        `UPDATE reading_progress SET percent = ?, last_anchor_id = ?, updated_at = ?
         WHERE id = ?`,
      ).run(data.percent, data.lastAnchorId ?? null, ts, existing.id);
      return db().prepare('SELECT * FROM reading_progress WHERE id = ?').get(existing.id) as ReadingProgressRow;
    }

    const id = newId();
    db().prepare(
      `INSERT INTO reading_progress (id, user_id, section_slug, percent, last_anchor_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, data.userId, data.sectionSlug, data.percent, data.lastAnchorId ?? null, ts);
    return db().prepare('SELECT * FROM reading_progress WHERE id = ?').get(id) as ReadingProgressRow;
  },

  findByUser(userId: string, limit = 10): ReadingProgressRow[] {
    return db().prepare(
      'SELECT * FROM reading_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
    ).all(userId, limit) as ReadingProgressRow[];
  },
};

// =========================================================================
// Playbooks
// =========================================================================

export const playbooks = {
  findAll(userId: string, role: 'admin' | 'user'): PlaybookRow[] {
    if (role === 'admin') {
      return db().prepare('SELECT * FROM playbooks ORDER BY updated_at DESC').all() as PlaybookRow[];
    }
    return db().prepare(
      `SELECT * FROM playbooks
       WHERE status = 'published' OR (status = 'draft' AND created_by = ?)
       ORDER BY updated_at DESC`,
    ).all(userId) as PlaybookRow[];
  },

  findById(id: string): PlaybookRow | undefined {
    return db().prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as PlaybookRow | undefined;
  },

  insert(data: {
    title: string;
    triggers?: string[];
    checklist?: string[];
    scenarioTree?: string;
    linkedSections?: string[];
    tags?: string[];
    createdBy: string;
  }): PlaybookRow {
    const id = newId();
    const ts = now();
    db().prepare(
      `INSERT INTO playbooks (id, status, title, triggers, checklist, scenario_tree, linked_sections, tags, created_by, created_at, updated_at)
       VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.title,
      JSON.stringify(data.triggers ?? []),
      JSON.stringify(data.checklist ?? []),
      data.scenarioTree ?? '',
      JSON.stringify(data.linkedSections ?? []),
      JSON.stringify(data.tags ?? []),
      data.createdBy,
      ts,
      ts,
    );
    return db().prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as PlaybookRow;
  },

  update(id: string, updates: Record<string, unknown>): PlaybookRow | undefined {
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now()];

    if (typeof updates.title === 'string') { fields.push('title = ?'); values.push(updates.title); }
    if (Array.isArray(updates.triggers)) { fields.push('triggers = ?'); values.push(JSON.stringify(updates.triggers)); }
    if (Array.isArray(updates.checklist)) { fields.push('checklist = ?'); values.push(JSON.stringify(updates.checklist)); }
    if (typeof updates.scenarioTree === 'string') { fields.push('scenario_tree = ?'); values.push(updates.scenarioTree); }
    if (Array.isArray(updates.linkedSections)) { fields.push('linked_sections = ?'); values.push(JSON.stringify(updates.linkedSections)); }
    if (Array.isArray(updates.tags)) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
    if (typeof updates.status === 'string') { fields.push('status = ?'); values.push(updates.status); }
    if (updates.publishedAt instanceof Date || typeof updates.publishedAt === 'string') {
      fields.push('published_at = ?');
      values.push(typeof updates.publishedAt === 'string' ? updates.publishedAt : updates.publishedAt.toISOString());
    }

    values.push(id);
    const result = db().prepare(`UPDATE playbooks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    if (result.changes === 0) return undefined;
    return db().prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as PlaybookRow;
  },
};

// =========================================================================
// Audit Log
// =========================================================================

export const auditLog = {
  insert(data: {
    actorUserId?: string;
    action: string;
    details: Record<string, unknown>;
  }): void {
    const id = newId();
    db().prepare(
      'INSERT INTO audit_log (id, actor_user_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, data.actorUserId ?? null, data.action, JSON.stringify(data.details), now());
  },

  findLastByAction(action: string): AuditLogRow | undefined {
    return db().prepare(
      'SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT 1',
    ).get(action) as AuditLogRow | undefined;
  },
};

// =========================================================================
// Rate Limits
// =========================================================================

export const rateLimits = {
  increment(key: string, windowStart: number): number {
    const d = db();
    const ts = now();

    // Upsert: try insert, on conflict increment
    d.prepare(
      `INSERT INTO rate_limits (id, key, window_start, count, created_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`,
    ).run(newId(), key, windowStart, ts);

    const row = d.prepare(
      'SELECT count FROM rate_limits WHERE key = ? AND window_start = ?',
    ).get(key, windowStart) as { count: number } | undefined;

    return row?.count ?? 0;
  },

  /**
   * Clean up expired rate limit entries (older than 2 hours).
   * Called periodically or on startup.
   */
  cleanup(): void {
    const cutoff = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
    db().prepare('DELETE FROM rate_limits WHERE window_start < ?').run(cutoff);
  },
};
