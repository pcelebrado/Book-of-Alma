# Deployment Verification

Run these commands inside the `openclaw-core` container after deploy and after any restore.

## Single-command verifier

```bash
bash /app/scripts/post-deploy-verify.sh
```

Expected result: every line starts with `[verify] PASS`, including the active workspace path, the compatibility symlink, permissions, QMD version, memory file/chunk counts, and memory search snippets.

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
openclaw status --all
```

Expected output: no warning mentioning credentials permissions.

4. QMD is installed and reachable:

```bash
qmd --version
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
openclaw memory status --agent main --deep --index --json
```

Expected output:

- at least one `MEMORY.md`
- at least one dated file under `memory/`
- JSON with `results[0].status.files > 0`
- JSON with `results[0].status.chunks > 0`

6. Runtime memory search returns snippets:

```bash
openclaw memory search --agent main --json "railway persistent workspace"
```

Expected output:

- JSON with `results.length > 0`
- first result contains a non-empty `snippet`

## First-run note

QMD may download local model assets on the first boot or first query. That can make the first `qmd embed` or `openclaw memory search` noticeably slower than later runs.
