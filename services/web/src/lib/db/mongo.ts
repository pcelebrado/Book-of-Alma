/**
 * DEPRECATED — MongoDB layer removed in DECISION_197.
 * All database access now uses SQLite via @/lib/db/sqlite and @/lib/db/repositories.
 *
 * This file is intentionally empty. Any imports from '@/lib/db/mongo' should be
 * updated to use the new SQLite layer.
 */

throw new Error(
  'MongoDB layer has been removed (DECISION_197). Use @/lib/db/sqlite and @/lib/db/repositories instead.',
);
