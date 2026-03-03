# MongoDB Data Layer

## Overview

The MongoDB data layer provides persistent storage for the Book-first MVP, supporting book content, user-generated data, playbooks, and audit logging. The schema is designed for the Next.js App Router, shadcn/ui patterns, and QMD semantic search integration.

---

## Conventions

### IDs and Timestamps
- Use MongoDB ObjectIds for `_id` fields
- Store timestamps as ISO dates: `createdAt`, `updatedAt`, etc.

### Slugs
- `sectionSlug` is the canonical identifier for sections
- Format: `part-1-foundations/ch-1/01-gamma-basics`
- `anchorId` identifies headings within sections for deep links

### Draft vs Published
- Use `status` field: `draft`, `review`, `published`
- Optional `version` field for versioning support

---

## Collections

### 1. users
**Purpose:** Identity, roles, onboarding preferences

```javascript
{
  _id: ObjectId,
  email: "user@example.com",
  name: "User Name",
  role: "admin" | "user",
  prefs: {
    learningGoal: { sectionSlug: "part-1/ch-1/section-1" },
    notificationChannel: { type: "email", value: "user@example.com" },
    riskGuardrails: {
      maxTradesPerDay: 5,
      maxLossPerDay: 1000,
      cooldownMinutes: 30
    }
  },
  createdAt: ISODate,
  updatedAt: ISODate,
  lastLoginAt: ISODate
}
```

**Indexes:**
- Unique: `{ email: 1 }`
- `{ role: 1 }`

---

### 2. book_sections
**Purpose:** Canonical book content for Reader

```javascript
{
  _id: ObjectId,
  slug: "part-1/ch-1/01-gamma-basics",
  part: { index: 1, slug: "part-1", title: "Foundations" },
  chapter: { index: 1, slug: "ch-1", title: "Introduction" },
  section: { index: 1, slug: "01-gamma-basics", title: "Gamma Basics" },

  bodyMarkdown: "# Gamma Basics\n\nGamma measures...",
  frontmatter: {
    summary: ["Point 1", "Point 2", "Point 3"],
    checklist: ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"],
    mistakes: ["Mistake 1", "Mistake 2", "Mistake 3"],
    drill: {
      prompt: "Calculate gamma for...",
      answerKey: "The answer is..."
    },
    tags: ["options", "greeks"],
    playbooks: ["playbook-id-1"]
  },

  headings: [
    { id: "definition", text: "Definition", level: 2 },
    { id: "example", text: "Example", level: 2 }
  ],

  status: "published", // draft | review | published
  version: 1,

  createdAt: ISODate,
  updatedAt: ISODate,
  publishedAt: ISODate
}
```

**Indexes:**
- Unique: `{ slug: 1 }` (or `{ slug: 1, version: -1 }` if versioned)
- `{ status: 1, "part.index": 1, "chapter.index": 1, "section.index": 1 }`
- Text index (optional): `{ bodyMarkdown: "text", "part.title": "text", "chapter.title": "text", "section.title": "text" }`

---

### 3. book_toc
**Purpose:** Cached TOC tree for fast Library rendering

```javascript
{
  _id: "default",
  tree: {
    parts: [
      {
        index: 1,
        slug: "part-1",
        title: "Foundations",
        chapters: [
          {
            index: 1,
            slug: "ch-1",
            title: "Introduction",
            sections: [
              { index: 1, slug: "01-gamma-basics", title: "Gamma Basics" }
            ]
          }
        ]
      }
    ]
  },
  publishedVersion: 1,
  updatedAt: ISODate
}
```

---

### 4. notes
**Purpose:** User notes linked to sections and anchors

```javascript
{
  _id: ObjectId,
  userId: ObjectId("..."),
  sectionSlug: "part-1/ch-1/01-gamma-basics",
  anchorId: "definition",
  selection: {
    text: "Gamma measures the rate of change...",
    startOffset: 100,
    endOffset: 150
  },
  title: "Understanding Gamma",
  body: "My notes about gamma...",
  tags: ["options", "important"],
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**Indexes:**
- `{ userId: 1, sectionSlug: 1, updatedAt: -1 }`
- `{ userId: 1, tags: 1 }`

---

### 5. highlights
**Purpose:** Text highlights in Reader

```javascript
{
  _id: ObjectId,
  userId: ObjectId("..."),
  sectionSlug: "part-1/ch-1/01-gamma-basics",
  anchorId: "definition",
  range: { startOffset: 100, endOffset: 150 },
  text: "Gamma measures the rate of change...",
  color: "yellow", // yellow | green | blue | pink
  noteId: ObjectId("..."), // optional link to note
  createdAt: ISODate
}
```

**Indexes:**
- `{ userId: 1, sectionSlug: 1, createdAt: -1 }`
- `{ noteId: 1 }`

---

### 6. bookmarks
**Purpose:** Quick save points in the book

```javascript
{
  _id: ObjectId,
  userId: ObjectId("..."),
  sectionSlug: "part-1/ch-1/01-gamma-basics",
  anchorId: "definition",
  createdAt: ISODate
}
```

**Indexes:**
- Unique: `{ userId: 1, sectionSlug: 1, anchorId: 1 }`

---

### 7. reading_progress
**Purpose:** "Continue" and progress bars

```javascript
{
  _id: ObjectId,
  userId: ObjectId("..."),
  sectionSlug: "part-1/ch-1/01-gamma-basics",
  percent: 75,
  lastAnchorId: "example",
  updatedAt: ISODate
}
```

**Indexes:**
- Unique: `{ userId: 1, sectionSlug: 1 }`
- `{ userId: 1, updatedAt: -1 }`

---

### 8. playbooks
**Purpose:** Playbook drafts + published playbooks

```javascript
{
  _id: ObjectId,
  status: "draft", // draft | published | archived
  title: "Gamma Scalping Checklist",
  triggers: ["High IV rank", "Gamma > 0.10"],
  checklist: ["Check IV rank", "Calculate position size", "Set stop loss"],
  scenarioTree: "If IV rank > 80%, Then...",
  linkedSections: ["part-1/ch-1/01-gamma-basics"],
  tags: ["scalping", "gamma"],
  createdBy: ObjectId("..."),
  createdAt: ISODate,
  updatedAt: ISODate,
  publishedAt: ISODate
}
```

**Indexes:**
- `{ status: 1, updatedAt: -1 }`
- `{ createdBy: 1, status: 1 }`
- `{ linkedSections: 1 }`

---

### 9. agent_runs
**Purpose:** Audit + replay of agent outputs

```javascript
{
  _id: ObjectId,
  userId: ObjectId("..."),
  skill: "explain", // explain | socratic | flashcards | checklist | scenario_tree | notes_assist
  context: {
    sectionSlug: "part-1/ch-1/01-gamma-basics",
    anchorId: "definition",
    selectedText: "Gamma measures...",
    mode: "simple" // simple | technical | analogy
  },
  output: {
    type: "text",
    title: "Gamma Explained",
    content: "Gamma is..."
  },
  savedTo: {
    noteId: ObjectId("..."),
    playbookId: ObjectId("...")
  },
  createdAt: ISODate
}
```

**Indexes:**
- `{ userId: 1, createdAt: -1 }`
- `{ skill: 1, createdAt: -1 }`

---

### 10. audit_log
**Purpose:** Track admin actions, indexing, config changes

```javascript
{
  _id: ObjectId,
  actorUserId: ObjectId("..."),
  action: "book_import", // book_import | book_publish | reindex | config_change | agent_run | login_fail
  details: {
    sectionSlug: "part-1/ch-1/01-gamma-basics",
    changes: { ... }
  },
  createdAt: ISODate
}
```

**Indexes:**
- `{ createdAt: -1 }`
- `{ actorUserId: 1, createdAt: -1 }`

---

### 11. rate_limits
**Purpose:** Rate limiting counters

```javascript
{
  _id: ObjectId,
  key: "agent:user:12345", // login:ip:{ip} | agent:user:{userId} | search:user:{userId} | admin:user:{userId}
  windowStart: ISODate,
  count: 5,
  createdAt: ISODate
}
```

**Indexes:**
- `{ key: 1, windowStart: -1 }`
- TTL index: `{ createdAt: 1 }` (expire after 2 hours)

---

## Relationships

### Canonical Linkages
```
users
  └── notes ──────┐
  └── highlights ─┼──→ book_sections (via sectionSlug)
  └── bookmarks ──┤
  └── progress ───┘
  └── playbooks ←────── agent_runs.savedTo.playbookId
  └── agent_runs ─────→ book_sections (via context.sectionSlug)
```

### UI Flows Supported
1. **Reader selection → highlight → optional note**
2. **Agent output → Save as note / Save as playbook draft**
3. **Library → continue reading from `reading_progress`**
4. **Playbook detail → open linked section at anchor**

---

## Configuration

### Connection String
```bash
# Web service (connects to embedded MongoDB inside core via private networking)
MONGODB_URI=mongodb://core.railway.internal:27017/openclaw

# Core service (connects locally — MongoDB runs in the same container)
MONGODB_URI=mongodb://127.0.0.1:27017/openclaw
```

### Collection Names
```bash
BOOK_CANONICAL_COLLECTION=book_sections
BOOK_TOC_COLLECTION=book_toc
```

### Replica Set
```bash
REPLICA_SET_NAME=rs0
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=your-secure-password
```

---

## Indexing Strategy

### Read Patterns
1. **Library loads:** TOC tree + progress summaries
2. **Reader fetches:** One `book_section` by slug
3. **Notes/Highlights:** Per-user, per-section queries
4. **Playbooks:** By status, by creator

### Performance Notes
- Keep `headings` updated at import time for anchor nav
- QMD is primary for semantic search; MongoDB text index is fallback
- TTL indexes auto-cleanup rate limit and agent run data

---

## Backup Strategy

### Minimum Requirements
- Scheduled logical dumps
- Export scripts for critical collections
- Consider Railway managed backups if available

### Recommended Collections to Backup
1. `book_sections` — Canonical content
2. `book_toc` — Navigation structure
3. `users` — Identity data
4. `playbooks` — User-created procedures
5. `audit_log` — Compliance records

---

## Migration Notes

### Adding New Fields
- Always allow null/undefined for backward compatibility
- Use defaults in application code
- Migrate existing documents in batches

### Schema Evolution
```javascript
// Example migration pattern
const migrate = async () => {
  const sections = await db.book_sections.find({ newField: { $exists: false } });
  for (const section of sections) {
    await db.book_sections.updateOne(
      { _id: section._id },
      { $set: { newField: defaultValue } }
    );
  }
};
```

---

## Security

### Access Control
- Database is internal-only (no public port)
- Web service connects with authenticated user
- Core service connects if needed with separate credentials

### Data Retention
- Agent runs: Consider TTL for old records
- Audit log: Keep indefinitely or per compliance requirements
- Rate limits: Auto-expire after 2 hours

---

*For more details, see the [Service Architecture](./service-architecture.md) and [Security & Rate Limiting](./security-rate-limiting.md) documentation.*
