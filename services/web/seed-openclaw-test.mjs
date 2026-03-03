import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/openclaw';
const client = new MongoClient(uri);

const userId = new ObjectId('65f100000000000000000001');
const adminId = new ObjectId('65f100000000000000000002');
const noteId = new ObjectId('65f100000000000000000011');
const playbookId = new ObjectId('65f100000000000000000021');

async function run() {
  await client.connect();
  const db = client.db('openclaw');
  const now = new Date();

  await db.collection('users').deleteMany({
    email: { $in: ['user@openclaw.dev', 'admin@openclaw.dev'] },
  });

  await db.collection('users').insertMany([
    {
      _id: userId,
      email: 'user@openclaw.dev',
      name: 'OpenClaw User',
      role: 'user',
      password: 'pass123',
      prefs: {
        learningGoal: {
          sectionSlug: 'part-1-foundations/ch-1/01-gamma-basics',
        },
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: adminId,
      email: 'admin@openclaw.dev',
      name: 'OpenClaw Admin',
      role: 'admin',
      password: 'admin123',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.collection('book_toc').deleteMany({});
  await db.collection('book_toc').insertOne({
    _id: 'default',
    tree: {
      parts: [
        {
          slug: 'part-1-foundations',
          title: 'Part 1 Foundations',
          chapters: [
            {
              slug: 'ch-1',
              title: 'Chapter 1',
              sections: [
                {
                  slug: 'part-1-foundations/ch-1/01-gamma-basics',
                  title: 'Gamma Basics',
                },
              ],
            },
          ],
        },
      ],
    },
    publishedVersion: 1,
    updatedAt: now,
  });

  await db
    .collection('book_sections')
    .deleteMany({ slug: 'part-1-foundations/ch-1/01-gamma-basics' });
  await db.collection('book_sections').insertOne({
    slug: 'part-1-foundations/ch-1/01-gamma-basics',
    part: { index: 1, slug: 'part-1-foundations', title: 'Part 1 Foundations' },
    chapter: { index: 1, slug: 'ch-1', title: 'Chapter 1' },
    section: { index: 1, slug: '01-gamma-basics', title: 'Gamma Basics' },
    bodyMarkdown: 'Gamma basics content for search and reader route.',
    frontmatter: {
      summary: ['Gamma first principle'],
      checklist: ['Read section'],
      mistakes: ['Skipping risk controls'],
      drill: {
        prompt: 'What is gamma?',
        answerKey: 'Rate of change of delta.',
      },
      tags: ['gamma'],
      playbooks: ['starter'],
    },
    headings: [{ id: 'gamma-basics', text: 'Gamma Basics', level: 2 }],
    status: 'published',
    version: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  });

  await db.collection('notes').deleteMany({ userId });
  await db.collection('notes').insertOne({
    _id: noteId,
    userId,
    sectionSlug: 'part-1-foundations/ch-1/01-gamma-basics',
    anchorId: 'gamma-basics',
    title: 'Seed Note',
    body: 'Seed note body',
    tags: ['seed'],
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('highlights').deleteMany({ userId });
  await db.collection('bookmarks').deleteMany({ userId });

  await db.collection('reading_progress').deleteMany({ userId });
  await db.collection('reading_progress').insertOne({
    userId,
    sectionSlug: 'part-1-foundations/ch-1/01-gamma-basics',
    percent: 35,
    lastAnchorId: 'gamma-basics',
    updatedAt: now,
  });

  await db.collection('playbooks').deleteMany({ _id: playbookId });
  await db.collection('playbooks').insertOne({
    _id: playbookId,
    status: 'draft',
    title: 'Starter Draft',
    triggers: ['open'],
    checklist: ['step1'],
    scenarioTree: 'A->B',
    linkedSections: ['part-1-foundations/ch-1/01-gamma-basics'],
    tags: ['seed'],
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('audit_log').insertOne({
    actorUserId: adminId,
    action: 'reindex',
    details: { started: true, jobId: 'seed-job' },
    createdAt: now,
  });

  console.log('seeded=true');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
