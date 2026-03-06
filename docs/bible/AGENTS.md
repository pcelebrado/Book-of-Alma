# ALMA Bible Agent Guide

This document is the operating contract for any client-side or reviewer agent
that needs to search, cite, and verify Alma teachings.

## Runtime Base Path

- Agent working directory starts at: `C:/P4NTH30N/OP3NF1XER/nate-alma/dev`
- Deployment target runtime: Linux
- Use workspace-relative paths from `dev/` in all scripts and outputs.
- Preferred separators in docs/scripts: `/` (cross-platform safe).

## Mission

Use the ALMA Bible as a deterministic lookup system for:

- fast topic retrieval,
- exact quote verification,
- source URL attribution,
- stable document identity (`docId`) for tracking.

## Canonical Sources (Read In This Order)

1. `memory/alma-teachings/bible/_manifest/manifest.json`
2. `memory/alma-teachings/bible/corpus/substack/docs.json`
3. `memory/alma-teachings/bible/indices/substack-semantic-index.json`
4. `memory/alma-teachings/bible/digest.json`
5. `memory/alma-teachings/bible/corpus/substack/*.md` (final quote authority)

If data conflicts, raw corpus markdown files are final authority for exact text.

## Directory Map

- `bible/_manifest/`
  - Build metadata and shard inventory.
  - Entry point: `manifest.json`.
- `bible/_schemas/`
  - JSON schema contracts for docs and manifest.
  - Enforces valid `docId` and date format.
- `bible/corpus/substack/`
  - Canonical 340 Substack markdown files.
  - Includes `docs.json`, `identity.json`, and `date-resolution.json`.
- `bible/indices/`
  - Search-oriented runtime indexes.
  - Includes `substack-semantic-index.json`.
- `bible/ontology/`
  - Semantic weighting and ontology enums (`weights.json`).
- `bible/mappings/`
  - Book/section mapping artifacts.
- `bible/digest.json`
  - Concept summary map by file.

## Current Corpus Baseline

- Substack corpus files: 340
- Indexed docs (`docs.json`): 340
- Semantic index docs: 340
- Digest entries: 340
- `docId` format: `sha256:<64-hex>`
- Date format: `YYYY-MM-DD`

## Required Lookup Workflow

### Step 1: Identify candidate documents

Use `memory/alma-teachings/bible/indices/substack-semantic-index.json` to find
likely files by tokens/title/concepts.

### Step 2: Resolve identity and metadata

Use `memory/alma-teachings/bible/corpus/substack/docs.json` record for each
candidate to get:

- `docId`
- `file`
- `sourceUrl`
- `date`
- `title`

### Step 3: Verify exact quote

Open the corresponding markdown file in
`memory/alma-teachings/bible/corpus/substack/<file>` and match the quote text
exactly.

### Step 4: Return evidence

Every answer that cites doctrine should include:

- exact quote,
- file path,
- source URL,
- date,
- `docId`.

## Quote Verification Contract

When user asks, "Did Alma say X?", return:

1. `MATCH` or `NO_MATCH`
2. `confidence` (`high` only when exact text match exists)
3. evidence object:
   - `file`
   - `docId`
   - `sourceUrl`
   - `date`
   - `matchedText`

Do not paraphrase as a quote. If wording differs, mark as paraphrase.

## Search and Citation Rules

- Prefer exact-string search first for quote requests.
- Use semantic search only to narrow candidates.
- Never cite `memory/alma-teachings/legacy/index-artifacts/*` as final evidence
  when canonical equivalents exist under `memory/alma-teachings/bible/`.
- Do not cite `ALMA_TEACHINGS_COMPLETE_340_ARTICLES.md` as canonical proof; it
  is a useful backup scrape, not the authority index.

## Data Quality Notes

- `date-resolution.json` stores per-file date provenance and method.
- Substack-derived dates are present for all corpus records.
- Legacy artifacts include malformed JSON files; treat them as historical
  references only.

## Quick Integrity Checks

Run from the project root (`dev/` in this repository layout).

```bash
bun -e "const fs=require('fs');const p='memory/alma-teachings/bible/corpus/substack/docs.json';const a=JSON.parse(fs.readFileSync(p,'utf8'));console.log('docs',a.length,'badDocIds',a.filter(x=>!/^sha256:[0-9a-f]{64}$/.test(x.docId)).length,'badDates',a.filter(x=>!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x.date)).length);"
bun -e "const fs=require('fs');const p='memory/alma-teachings/bible/indices/substack-semantic-index.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));console.log('semantic_docs',j.documents.length);"
```

Expected:

- `docs 340 badDocIds 0 badDates 0`
- `semantic_docs 340`

## Recommended Response Template For Agents

Use this output shape for doctrine lookups:

```text
Result: MATCH
Quote: "...exact text..."
File: memory/alma-teachings/bible/corpus/substack/<file>.md
DocId: sha256:...
Source: https://stochvoltrader.substack.com/p/...
Date: YYYY-MM-DD
Confidence: high
```

## Failure Handling

If no exact match exists:

- return `NO_MATCH`,
- provide closest semantic candidates (top 3),
- explicitly label as non-exact,
- include what was searched (exact string + candidate files).

## Scope Guardrails

- Do not modify corpus markdown during normal lookup.
- Do not regenerate IDs ad hoc; IDs are content hashes and must remain stable
  unless file text changes.
- Do not use placeholders for any required schema fields.

## One-Line Rule

For client review: semantic index finds it, docs index identifies it, markdown
proves it.
