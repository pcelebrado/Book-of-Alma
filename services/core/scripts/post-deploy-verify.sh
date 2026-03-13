#!/bin/bash
set -euo pipefail

unset BUN_INSTALL

export OPENCLAW_DATA_ROOT="${OPENCLAW_DATA_ROOT:-/data}"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-${OPENCLAW_DATA_ROOT}/.openclaw}"
export OPENCLAW_WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR:-${OPENCLAW_DATA_ROOT}/workspace}"
export OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_WORKSPACE_VOLUME_DIR}}"
export CI="${CI:-1}"

STATE_DIR="${OPENCLAW_STATE_DIR}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR}"
WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR}"
WORKSPACE_COMPAT_DIR="${OPENCLAW_WORKSPACE_COMPAT_DIR:-/root/.openclaw/workspace}"
CREDENTIALS_DIR="${STATE_DIR}/credentials"
QUERY="${1:-OpenClaw}"
QMD_COMMAND="${OPENCLAW_MEMORY_QMD_COMMAND:-/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
QMD_RESCAN_SCRIPT="${WORKSPACE_DIR}/tools/admin/qmd-rescan.sh"
QMD_SEARCH_SCRIPT="${WORKSPACE_DIR}/skills/qmd-retrieval/scripts/qmd_memory_search.py"
OPENCLAW_ADMIN_SCRIPT="${WORKSPACE_DIR}/skills/openclaw-control-plane/scripts/openclaw_admin.py"
VERIFY_TIMEOUT_SECONDS="${OPENCLAW_VERIFY_TIMEOUT_SECONDS:-240}"
VERIFY_RETRIES="${OPENCLAW_VERIFY_RETRIES:-4}"
VERIFY_RETRY_DELAY_SECONDS="${OPENCLAW_VERIFY_RETRY_DELAY_SECONDS:-10}"
APP_PORT="${PORT:-${OPENCLAW_PUBLIC_PORT:-3000}}"

pass() {
  printf '[verify] PASS %s\n' "$*"
}

fail() {
  printf '[verify] FAIL %s\n' "$*" >&2
  exit 1
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "${actual}" != "${expected}" ]; then
    fail "${label}: expected '${expected}', got '${actual}'"
  fi
  pass "${label}: ${actual}"
}

assert_file_exists() {
  local target="$1"
  if [ ! -e "${target}" ]; then
    fail "missing required file: ${target}"
  fi
  pass "found ${target}"
}

assert_file_absent() {
  local target="$1"
  if [ -e "${target}" ]; then
    fail "unexpected file present: ${target}"
  fi
  pass "absent ${target}"
}

run_capture() {
  local outfile="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground "${VERIFY_TIMEOUT_SECONDS}" "$@" >"${outfile}" 2>&1
  else
    "$@" >"${outfile}" 2>&1
  fi
}

retry_capture() {
  local label="$1"
  local outfile="$2"
  shift 2

  local attempt=1
  local exit_code=0
  while [ "${attempt}" -le "${VERIFY_RETRIES}" ]; do
    if run_capture "${outfile}" "$@"; then
      exit_code=0
    else
      exit_code=$?
    fi
    if [ "${exit_code}" -eq 0 ]; then
      pass "${label} (attempt ${attempt})"
      return 0
    fi
    if [ "${attempt}" -lt "${VERIFY_RETRIES}" ]; then
      printf '[verify] retry %s (attempt %s/%s, exit=%s)\n' "${label}" "${attempt}" "${VERIFY_RETRIES}" "${exit_code}"
      sleep "${VERIFY_RETRY_DELAY_SECONDS}"
    fi
    attempt=$((attempt + 1))
  done

  cat "${outfile}" >&2 || true
  fail "${label} failed after ${VERIFY_RETRIES} attempts (exit=${exit_code})"
}

real_workspace="$(readlink -f "${WORKSPACE_DIR}")"
assert_eq "${real_workspace}" "${WORKSPACE_VOLUME_DIR}" "active workspace path"

compat_workspace="$(readlink -f "${WORKSPACE_COMPAT_DIR}")"
assert_eq "${compat_workspace}" "${WORKSPACE_DIR}" "compatibility workspace symlink"

credentials_mode="$(stat -c '%a' "${CREDENTIALS_DIR}")"
assert_eq "${credentials_mode}" "700" "credentials dir permissions"

"${QMD_COMMAND}" --version >/tmp/openclaw-verify-qmd.txt 2>&1 || {
  cat /tmp/openclaw-verify-qmd.txt >&2 || true
  fail "${QMD_COMMAND} --version"
}
pass "${QMD_COMMAND} --version"

retry_capture "wrapper setup health" /tmp/openclaw-wrapper-health.json curl -fsS "http://127.0.0.1:${APP_PORT}/setup/healthz"
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-wrapper-health.json','utf8')); if(!data || data.ok !== true){process.exit(1)}" \
  || fail "wrapper setup health did not report ok=true"
pass "wrapper setup health reports ok=true"

retry_capture "openclaw models status --json" /tmp/openclaw-model-status.json openclaw models status --json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-model-status.json','utf8')); const defaults=data.defaults||{}; const fallbacks=Array.isArray(defaults.fallbacks)?defaults.fallbacks:[]; if(defaults.default!=='kimi-coding/k2p5'){process.exit(1)} if(!fallbacks.includes('openai-codex/gpt-5.3-codex')){process.exit(1)}" \
  || fail "default model routing is not Kimi primary with Codex fallback"
pass "default model routing is Kimi primary with Codex fallback"

retry_capture \
  "openclaw config get agents.defaults.memorySearch.enabled --json" \
  /tmp/openclaw-memory-enabled.json \
  openclaw config get agents.defaults.memorySearch.enabled --json
assert_eq "$(tr -d '\r\n ' </tmp/openclaw-memory-enabled.json)" "false" "OpenClaw memorySearch disabled"

retry_capture \
  "openclaw config get agents.defaults.heartbeat --json" \
  /tmp/openclaw-heartbeat.json \
  openclaw config get agents.defaults.heartbeat --json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-heartbeat.json','utf8')); if(data.every!=='4h'||data.target!=='none'){process.exit(1)}" \
  || fail "heartbeat policy is not every=4h,target=none"
pass "heartbeat policy is every=4h,target=none"

retry_capture \
  "openclaw config get memory.qmd.paths --json" \
  /tmp/openclaw-memory-qmd-paths.json \
  openclaw config get memory.qmd.paths --json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-memory-qmd-paths.json','utf8')); const paths=Array.isArray(data)?data:Array.isArray(data?.value)?data.value:[]; if(!paths.some((entry)=>entry&&typeof entry==='object'&&String(entry.path||'')==='/data/workspace'&&String(entry.pattern||'')==='**/*.md')){process.exit(1)}" \
  || fail "memory.qmd.paths is missing the workspace-wide markdown collection"
pass "memory.qmd.paths contains the workspace-wide markdown collection"

assert_file_exists "${WORKSPACE_DIR}/HEARTBEAT.md"
assert_file_exists "${WORKSPACE_DIR}/memory/heartbeat-prompt.md"
assert_file_exists "${WORKSPACE_DIR}/skills/qmd-retrieval/SKILL.md"
assert_file_exists "${WORKSPACE_DIR}/memory/system/openclaw-memory-bible.md"
assert_file_exists "${QMD_RESCAN_SCRIPT}"
assert_file_exists "${QMD_SEARCH_SCRIPT}"
assert_file_exists "${OPENCLAW_ADMIN_SCRIPT}"
assert_file_absent "${WORKSPACE_DIR}/patterns/stalwart-single-control-plane-email-ops-pattern.md"

retry_capture "openclaw control-plane summary" /tmp/openclaw-admin-summary.txt "${PYTHON_BIN}" "${OPENCLAW_ADMIN_SCRIPT}" summary
retry_capture "openclaw control-plane audit-backups" /tmp/openclaw-admin-audit.txt "${PYTHON_BIN}" "${OPENCLAW_ADMIN_SCRIPT}" audit-backups

retry_capture "direct qmd rescan" /tmp/qmd-rescan-path.txt bash "${QMD_RESCAN_SCRIPT}"
QMD_RESCAN_LOG="$(tr -d '\r\n' </tmp/qmd-rescan-path.txt)"
if [ -z "${QMD_RESCAN_LOG}" ] || [ ! -f "${QMD_RESCAN_LOG}" ]; then
  fail "qmd-rescan did not return a readable log path"
fi
pass "qmd-rescan log created at ${QMD_RESCAN_LOG}"

retry_capture \
  "direct qmd retrieval" \
  /tmp/qmd-direct-search.json \
  "${PYTHON_BIN}" \
  "${QMD_SEARCH_SCRIPT}" \
  --query "${QUERY}" \
  --max-results 5 \
  --min-score 0
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/qmd-direct-search.json','utf8')); const results=Array.isArray(data.results)?data.results:[]; if(!results.length){process.exit(1)} const first=results[0]; if(!String(first.snippet||'').trim()){process.exit(1)} if(!String(first.citation||'').includes('#L')){process.exit(1)}" \
  || fail "direct qmd retrieval returned no citation-ready snippets"
pass "direct qmd retrieval returned citation-ready snippets"

sqlite_extensions="$(sqlite3 ':memory:' "SELECT sqlite_compileoption_used('ENABLE_LOAD_EXTENSION');" 2>/dev/null || true)"
if [ "${sqlite_extensions}" = "1" ]; then
  pass "sqlite extension support detected"
else
  fail "sqlite extension support probe failed"
fi
