#!/bin/bash
set -euo pipefail

export OPENCLAW_DATA_ROOT="${OPENCLAW_DATA_ROOT:-/data}"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-${OPENCLAW_DATA_ROOT}/.openclaw}"
export OPENCLAW_WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR:-${OPENCLAW_DATA_ROOT}/workspace}"
export OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_WORKSPACE_VOLUME_DIR}}"

STATE_DIR="${OPENCLAW_STATE_DIR}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR}"
WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR}"
WORKSPACE_COMPAT_DIR="${OPENCLAW_WORKSPACE_COMPAT_DIR:-/root/.openclaw/workspace}"
CREDENTIALS_DIR="${STATE_DIR}/credentials"
QUERY="${1:-railway persistent workspace}"

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

real_workspace="$(readlink -f "${WORKSPACE_DIR}")"
assert_eq "${real_workspace}" "${WORKSPACE_VOLUME_DIR}" "active workspace path"

compat_workspace="$(readlink -f "${WORKSPACE_COMPAT_DIR}")"
assert_eq "${compat_workspace}" "${WORKSPACE_DIR}" "compatibility workspace symlink"

credentials_mode="$(stat -c '%a' "${CREDENTIALS_DIR}")"
assert_eq "${credentials_mode}" "700" "credentials dir permissions"

qmd --version >/tmp/openclaw-verify-qmd.txt 2>&1 || {
  cat /tmp/openclaw-verify-qmd.txt >&2 || true
  fail "qmd --version"
}
pass "qmd --version"

status_output="$(openclaw status --all 2>&1 || true)"
printf '%s\n' "${status_output}" > /tmp/openclaw-verify-status.txt
if printf '%s' "${status_output}" | grep -Eiq 'credentials.*permission|permission.*credentials'; then
  fail "openclaw status reports credentials permission warning"
fi
pass "openclaw status has no credentials permission warning"

memory_status_json="$(openclaw memory status --agent main --deep --index --json 2>&1)" || {
  printf '%s\n' "${memory_status_json}" >&2
  fail "openclaw memory status --deep --index --json"
}
printf '%s\n' "${memory_status_json}" > /tmp/openclaw-memory-status.json

node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-memory-status.json','utf8')); const first=data.results?.[0]; if(!first||Number(first.status?.files||0)<=0||Number(first.status?.chunks||0)<=0){process.exit(1)}" \
  || fail "memory file/chunk count is zero"
pass "memory file/chunk count is non-zero"

memory_search_json="$(openclaw memory search --agent main --json "${QUERY}" 2>&1)" || {
  printf '%s\n' "${memory_search_json}" >&2
  fail "openclaw memory search --json"
}
printf '%s\n' "${memory_search_json}" > /tmp/openclaw-memory-search.json

node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/openclaw-memory-search.json','utf8')); const results=data.results||[]; if(!results.length||!String(results[0].snippet||'').trim()){process.exit(1)}" \
  || fail "memory_search returned no snippets"
pass "memory_search returned snippets"

sqlite_extensions="$(sqlite3 ':memory:' "SELECT sqlite_compileoption_used('ENABLE_LOAD_EXTENSION');" 2>/dev/null || true)"
if [ "${sqlite_extensions}" = "1" ]; then
  pass "sqlite extension support detected"
else
  fail "sqlite extension support probe failed"
fi
