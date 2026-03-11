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
QUERY="${1:-Railway workspace}"
QMD_COMMAND="${OPENCLAW_MEMORY_QMD_COMMAND:-/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd}"
VERIFY_TIMEOUT_SECONDS="${OPENCLAW_VERIFY_TIMEOUT_SECONDS:-240}"
VERIFY_RETRIES="${OPENCLAW_VERIFY_RETRIES:-4}"
VERIFY_RETRY_DELAY_SECONDS="${OPENCLAW_VERIFY_RETRY_DELAY_SECONDS:-10}"

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
    run_capture "${outfile}" "$@"
    exit_code=$?
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

assert_no_disabled_output() {
  local label="$1"
  local file="$2"
  if grep -Eiq 'Memory search disabled|disabled:[[:space:]]*true|missing embedding provider auth|missing embedding model path|timed out after|ENOENT|rename .*\.ipull' "${file}"; then
    cat "${file}" >&2 || true
    fail "${label} reports memory search disabled"
  fi
  pass "${label} has no disabled-state markers"
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

retry_capture "openclaw status" /tmp/openclaw-verify-status.txt openclaw status
status_output="$(cat /tmp/openclaw-verify-status.txt)"
if printf '%s' "${status_output}" | grep -Eiq 'credentials.*permission|permission.*credentials'; then
  fail "openclaw status reports credentials permission warning"
fi
pass "openclaw status has no credentials permission warning"

retry_capture "openclaw memory status" /tmp/openclaw-memory-status.txt openclaw memory status
assert_no_disabled_output "openclaw memory status" /tmp/openclaw-memory-status.txt

retry_capture "openclaw memory index" /tmp/openclaw-memory-index.txt openclaw memory index
assert_no_disabled_output "openclaw memory index" /tmp/openclaw-memory-index.txt

retry_capture \
  "openclaw config get memory.qmd.paths --json" \
  /tmp/openclaw-memory-qmd-paths.json \
  openclaw config get memory.qmd.paths --json

node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-memory-qmd-paths.json','utf8')); const paths=Array.isArray(data)?data:Array.isArray(data?.value)?data.value:[]; if(!paths.some((entry)=>entry&&typeof entry==='object'&&/^workspace(?:-|$)/.test(String(entry.name||'')))){process.exit(1)}" \
  || fail "memory.qmd.paths is missing workspace-wide QMD entries"
pass "memory.qmd.paths contains workspace-wide QMD entries"

retry_capture \
  "openclaw memory status --agent main --deep --index --json" \
  /tmp/openclaw-memory-status.json \
  openclaw memory status --agent main --deep --index --json
assert_no_disabled_output "openclaw memory status --json" /tmp/openclaw-memory-status.json

node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-memory-status.json','utf8')); const first=data.results?.[0]; if(!first||Number(first.status?.files||0)<=0||Number(first.status?.chunks||0)<=0){process.exit(1)}" \
  || fail "memory file/chunk count is zero"
pass "memory file/chunk count is non-zero"

retry_capture "openclaw memory search \"${QUERY}\"" /tmp/openclaw-memory-search.txt openclaw memory search "${QUERY}"
assert_no_disabled_output "openclaw memory search" /tmp/openclaw-memory-search.txt

retry_capture \
  "openclaw memory search --agent main --json \"${QUERY}\"" \
  /tmp/openclaw-memory-search.json \
  openclaw memory search --agent main --json "${QUERY}"
assert_no_disabled_output "openclaw memory search --json" /tmp/openclaw-memory-search.json

node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-memory-search.json','utf8')); const results=data.results||[]; if(!results.length||!String(results[0].snippet||'').trim()){process.exit(1)}" \
  || fail "memory_search returned no snippets"
pass "memory_search returned snippets"

sqlite_extensions="$(sqlite3 ':memory:' "SELECT sqlite_compileoption_used('ENABLE_LOAD_EXTENSION');" 2>/dev/null || true)"
if [ "${sqlite_extensions}" = "1" ]; then
  pass "sqlite extension support detected"
else
  fail "sqlite extension support probe failed"
fi
