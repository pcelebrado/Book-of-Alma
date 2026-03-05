import { type Collection, type ObjectId } from 'mongodb';

import { getMongoDb } from '@/lib/db/mongo';

export interface UserDocument {
  _id?: ObjectId;
  email: string;
  name: string;
  role: 'admin' | 'user';
  password?: string;
  passwordHash?: string;
  prefs?: {
    learningGoal?: { sectionSlug: string };
    notificationChannel?: { type: string; value: string };
    riskGuardrails?: {
      maxTradesPerDay: number;
      maxLossPerDay: number;
      cooldownMinutes: number;
    };
  };
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface BookSectionDocument {
  _id?: ObjectId;
  slug: string;
  part: { index: number; slug: string; title: string };
  chapter: { index: number; slug: string; title: string };
  section: { index: number; slug: string; title: string };
  bodyMarkdown: string;
  frontmatter?: {
    summary?: string[];
    checklist?: string[];
    mistakes?: string[];
    drill?: { prompt: string; answerKey: string };
    tags?: string[];
    playbooks?: string[];
  };
  headings?: Array<{ id: string; text: string; level: number }>;
  status: 'draft' | 'review' | 'published';
  version?: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface BookTocDocument {
  _id: string;
  tree: Record<string, unknown>;
  publishedVersion: number;
  updatedAt: Date;
}

export interface NoteDocument {
  _id?: ObjectId;
  userId: ObjectId;
  sectionSlug: string;
  anchorId?: string;
  selection?: { text: string; startOffset: number; endOffset: number };
  title?: string;
  body: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HighlightDocument {
  _id?: ObjectId;
  userId: ObjectId;
  sectionSlug: string;
  anchorId?: string;
  range: { startOffset: number; endOffset: number };
  text: string;
  color?: string;
  noteId?: ObjectId;
  createdAt: Date;
}

export interface BookmarkDocument {
  _id?: ObjectId;
  userId: ObjectId;
  sectionSlug: string;
  anchorId?: string;
  createdAt: Date;
}

export interface ReadingProgressDocument {
  _id?: ObjectId;
  userId: ObjectId;
  sectionSlug: string;
  percent: number;
  lastAnchorId?: string;
  updatedAt: Date;
}

export interface PlaybookDocument {
  _id?: ObjectId;
  status: 'draft' | 'published' | 'archived';
  title: string;
  triggers: string[];
  checklist: string[];
  scenarioTree: string;
  linkedSections: string[];
  tags?: string[];
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface AgentRunDocument {
  _id?: ObjectId;
  userId: ObjectId;
  skill:
    | 'explain'
    | 'socratic'
    | 'flashcards'
    | 'checklist'
    | 'scenario_tree'
    | 'notes_assist';
  context: {
    sectionSlug?: string;
    anchorId?: string;
    selectedText?: string;
    mode?: 'simple' | 'technical' | 'analogy';
  };
  output: Record<string, unknown>;
  savedTo?: { noteId?: ObjectId; playbookId?: ObjectId };
  createdAt: Date;
}

export interface AuditLogDocument {
  _id?: ObjectId;
  actorUserId?: ObjectId;
  action:
    | 'book_import'
    | 'book_publish'
    | 'reindex'
    | 'config_change'
    | 'agent_run'
    | 'login_fail';
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface RateLimitDocument {
  _id?: ObjectId;
  key: string;
  windowStart: number;
  count: number;
  createdAt: Date;
}

export async function getCollections(dbName?: string) {
  const db = await getMongoDb(dbName);

  return {
    users: db.collection<UserDocument>('users'),
    bookSections: db.collection<BookSectionDocument>('book_sections'),
    bookToc: db.collection<BookTocDocument>('book_toc'),
    notes: db.collection<NoteDocument>('notes'),
    highlights: db.collection<HighlightDocument>('highlights'),
    bookmarks: db.collection<BookmarkDocument>('bookmarks'),
    readingProgress: db.collection<ReadingProgressDocument>('reading_progress'),
    playbooks: db.collection<PlaybookDocument>('playbooks'),
    agentRuns: db.collection<AgentRunDocument>('agent_runs'),
    auditLog: db.collection<AuditLogDocument>('audit_log'),
    rateLimits: db.collection<RateLimitDocument>('rate_limits'),
  };
}

export async function getUsersCollection(dbName?: string): Promise<Collection<UserDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<UserDocument>('users');
}

export async function getBookSectionsCollection(
  dbName?: string,
): Promise<Collection<BookSectionDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<BookSectionDocument>('book_sections');
}

export async function getBookTocCollection(
  dbName?: string,
): Promise<Collection<BookTocDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<BookTocDocument>('book_toc');
}

export async function getNotesCollection(dbName?: string): Promise<Collection<NoteDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<NoteDocument>('notes');
}

export async function getHighlightsCollection(
  dbName?: string,
): Promise<Collection<HighlightDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<HighlightDocument>('highlights');
}

export async function getBookmarksCollection(
  dbName?: string,
): Promise<Collection<BookmarkDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<BookmarkDocument>('bookmarks');
}

export async function getReadingProgressCollection(
  dbName?: string,
): Promise<Collection<ReadingProgressDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<ReadingProgressDocument>('reading_progress');
}

export async function getPlaybooksCollection(
  dbName?: string,
): Promise<Collection<PlaybookDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<PlaybookDocument>('playbooks');
}

export async function getAgentRunsCollection(
  dbName?: string,
): Promise<Collection<AgentRunDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<AgentRunDocument>('agent_runs');
}

export async function getAuditLogCollection(
  dbName?: string,
): Promise<Collection<AuditLogDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<AuditLogDocument>('audit_log');
}

export async function getRateLimitsCollection(
  dbName?: string,
): Promise<Collection<RateLimitDocument>> {
  const db = await getMongoDb(dbName);
  return db.collection<RateLimitDocument>('rate_limits');
}
