# Source Path Fixes (2026-03-02)

Scribe encountered missing-path errors due to `unknown-date-` assumptions.

Confirmed existing files:

- Requested (missing):
  - `.../unknown-date-what-s-the-difference-between-a-furu-and-an-analyst-with-boo.md`
  - `.../unknown-date-articles-predictions-education.md`

- Actual (present):
  - `C:/P4NTH30N/OP3NF1XER/nate-alma/dev/memory/alma-teachings/substack/2025-01-29-what-s-the-difference-between-a-furu-and-an-analyst-with-boo.md`
  - `C:/P4NTH30N/OP3NF1XER/nate-alma/dev/memory/alma-teachings/substack/2025-01-29-articles-predictions-education.md`

Guidance:

- Prefer deterministic full paths from actual filesystem matches.
- If path not found, glob by core title terms before declaring source missing.
