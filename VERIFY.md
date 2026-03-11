# Deployment Verification

Run these commands inside the `openclaw-core` container after deploy and after any restore.

## Single-command verifier

```bash
bash /app/scripts/post-deploy-verify.sh
```

Expected result: every line starts with `[verify] PASS`, including the active workspace path, the compatibility symlink, permissions, QMD version, memory file/chunk counts, and memory search snippets.

The verifier fails if any of these commands reports disabled memory search or returns zero snippets:

```bash
openclaw status
openclaw memory status
openclaw memory index
openclaw memory search "Railway workspace"
```

The template explicitly sets `memory.qmd.scope.default=allow` so the CLI search
path above is valid even without an active chat session.
It also sets `memory.qmd.paths` for the active workspace so QMD can recall
general workspace files instead of only the default memory Markdown files.
It also raises the QMD timeouts used during search and bootstrap so first-run
local model downloads have longer to complete on Railway.
QMD is invoked via `/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd`
with `BUN_INSTALL` cleared so the verification shell matches the wrapper's
runtime behavior.
Template defaults now leave custom QMD warmup disabled so the deployment does
not inject book-specific probe queries into runtime logs.

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

5. Memory corpus exists and is indexed:

```bash
find /data/workspace -maxdepth 2 -type f \( -name 'MEMORY.md' -o -path '/data/workspace/memory/*.md' \) | sort
openclaw memory status
openclaw memory index
openclaw config get memory.qmd.paths --json
openclaw memory status --agent main --deep --index --json
```

Expected output:

- at least one `MEMORY.md`
- at least one dated file under `memory/`
- `openclaw memory status` does not report `disabled:true`
- `openclaw memory index` does not report `Memory search disabled`
- `memory.qmd.paths` contains at least one non-memory workspace entry
- JSON with `results[0].status.files > 0`
- JSON with `results[0].status.chunks > 0`

6. Runtime memory search returns snippets:

```bash
openclaw memory search "Railway workspace"
openclaw memory search --agent main --json "Railway workspace"
```

Expected output:

- plain-text search returns at least one snippet
- JSON with `results.length > 0`
- first result contains a non-empty `snippet`

## First-run note

QMD may download local model assets on the first boot or first query. That can make the first `qmd embed` or `openclaw memory search` noticeably slower than later runs.
