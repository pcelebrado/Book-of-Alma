# Deployment Verification

Run these commands inside the `openclaw-core` container after deploy and after any restore.

## Single-command verifier

```bash
bash /app/scripts/post-deploy-verify.sh
```

Expected result: every line starts with `[verify] PASS`, including the active workspace path, the compatibility symlink, permissions, Kimi primary with Codex fallback, `memorySearch.enabled=false`, the 4-hour heartbeat policy, direct QMD rescan success, and citation-ready QMD retrieval snippets.

The verifier uses the live-supported operator flow:

```bash
openclaw status
openclaw models status --json
openclaw config get agents.defaults.memorySearch.enabled --json
openclaw config get agents.defaults.heartbeat --json
bash /data/workspace/tools/admin/qmd-rescan.sh
python3 /data/workspace/skills/qmd-retrieval/scripts/qmd_memory_search.py --query "OpenClaw" --max-results 5
```

The template keeps QMD on `/data/workspace` through `memory.qmd.paths`, disables derived default-memory file roots, disables OpenClaw `memorySearch` for the default agent, and relies on the direct QMD wrappers in the managed workspace seed. QMD is invoked via `/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd` with `BUN_INSTALL` cleared so the verification shell matches the wrapper runtime.

Heartbeat is fixed at `every: 4h` and uses the same `qmd-rescan.sh` wrapper, which stays incremental with `qmd update` only and skips if the last successful rescan is still fresh.

## Managed control plane

After deploy, verify that the seeded control-plane surface is present too:

```bash
python3 /data/workspace/skills/openclaw-control-plane/scripts/openclaw_admin.py summary
python3 /data/workspace/skills/openclaw-control-plane/scripts/openclaw_admin.py audit-backups
test -f /data/workspace/memory/system/openclaw-configuration-bible.md
test -f /data/workspace/memory/system/openclaw-memory-bible.md
test -f /data/workspace/memory/system/email-control-plane-bible.md
test -f /data/workspace/skills/qmd-retrieval/SKILL.md
test ! -f /data/workspace/patterns/stalwart-single-control-plane-email-ops-pattern.md
```

Expected output:

- `summary` shows the current primary model plus all persisted auth profiles
- `audit-backups` does not show a missing `openai-codex:default` profile after re-onboarding
- the managed QMD skill plus both system-doc files exist
- the stale Stalwart pattern file is absent from the active workspace

## Manual checks

1. Active workspace and compatibility path resolve to the same persistent volume:

```bash
readlink -f /data/workspace
readlink -f /root/.openclaw/workspace
```

Expected output:

```text
/data/workspace
/data/workspace
```

2. Credentials permissions are locked down:

```bash
stat -c '%a %n' /data/.openclaw /data/.openclaw/credentials
```

Expected output:

```text
700 /data/.openclaw
700 /data/.openclaw/credentials
```

3. OpenClaw status is clean:

```bash
openclaw status
```

Expected output: no warning mentioning credentials permissions.

4. QMD is installed and reachable:

```bash
"${OPENCLAW_MEMORY_QMD_COMMAND:-/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd}" --version
sqlite3 ':memory:' "SELECT sqlite_compileoption_used('ENABLE_LOAD_EXTENSION');"
```

Expected output:

```text
<qmd version string>
1
```

5. Runtime policy is correct:

```bash
openclaw models status --json
openclaw config get agents.defaults.memorySearch.enabled --json
openclaw config get agents.defaults.heartbeat --json
openclaw config get memory.qmd.paths --json
```

Expected output:

- default model is `kimi-coding/k2p5`
- fallback list includes `openai-codex/gpt-5.3-codex`
- `openclaw config get agents.defaults.memorySearch.enabled --json` returns `false`
- `openclaw config get agents.defaults.heartbeat --json` returns `{ "every": "4h", "target": "none" }`
- `memory.qmd.paths` contains the `/data/workspace` directory with pattern `**/*.md`
- `memory.qmd.paths` does not contain `/data/workspace/MEMORY.md`

6. Direct QMD retrieval returns snippets:

```bash
bash /data/workspace/tools/admin/qmd-rescan.sh
python3 /data/workspace/skills/qmd-retrieval/scripts/qmd_memory_search.py --query "OpenClaw" --max-results 5
python3 /data/workspace/skills/qmd-retrieval/scripts/qmd_memory_get.py --path MEMORY.md --from 1 --lines 20
```

Expected output:

- `qmd-rescan.sh` exits successfully and returns a log path under `knowledge/qmd/`
- JSON search output returns at least one snippet
- the first result contains a non-empty `snippet`
- the citation is in `path#Lx-Ly` form
- `qmd_memory_get.py` returns JSON content for the requested Markdown path

## First-run note

The first direct QMD pass can still be slower than later runs if QMD needs to create or refresh its SQLite index, but the managed heartbeat workflow does not force `qmd embed` on the 4-hour maintenance lane.
