/**
 * Collections compatibility re-export.
 * DECISION_197: MongoDB → SQLite migration.
 *
 * This file re-exports types and repository objects from the new SQLite layer
 * so that existing imports from '@/lib/db/collections' continue to resolve.
 * All MongoDB-specific types (ObjectId, Collection) are removed.
 */

export type {
  UserRow as UserDocument,
  BookSectionRow as BookSectionDocument,
  BookTocRow as BookTocDocument,
  NoteRow as NoteDocument,
  HighlightRow as HighlightDocument,
  BookmarkRow as BookmarkDocument,
  ReadingProgressRow as ReadingProgressDocument,
  PlaybookRow as PlaybookDocument,
  AuditLogRow as AuditLogDocument,
  RateLimitRow as RateLimitDocument,
} from '@/lib/db/repositories';

export {
  users,
  bookSections,
  bookToc,
  notes,
  highlights,
  bookmarks,
  readingProgress,
  playbooks,
  auditLog,
  rateLimits,
} from '@/lib/db/repositories';
