#!/bin/bash
set -euo pipefail

unset BUN_INSTALL

DATA_ROOT="${OPENCLAW_DATA_ROOT:-/data}"
STATE_DIR="${OPENCLAW_STATE_DIR:-${DATA_ROOT}/.openclaw}"
WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR:-${DATA_ROOT}/workspace}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${WORKSPACE_VOLUME_DIR}}"
WORKSPACE_COMPAT_DIR="${OPENCLAW_WORKSPACE_COMPAT_DIR:-/root/.openclaw/workspace}"
ROOT_HOME_OPENCLAW_DIR="$(dirname "${WORKSPACE_COMPAT_DIR}")"
CREDENTIALS_DIR="${STATE_DIR}/credentials"
CLAUDE_STATE_DIR="${OPENCLAW_CLAUDE_STATE_DIR:-${DATA_ROOT}/.claude}"
CLAUDE_COMPAT_DIR="${OPENCLAW_CLAUDE_COMPAT_DIR:-/root/.claude}"
SFTPGO_DATA_ROOT="${SFTPGO_DATA_ROOT:-${DATA_ROOT}/sftpgo}"
SFTPGO_SRV_DIR="${SFTPGO_DATA_ROOT}/srv"
QMD_COMMAND="${OPENCLAW_MEMORY_QMD_COMMAND:-/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd}"
QMD_WORKSPACE_PATTERN="${OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN:-**/*.md}"
QMD_STATE_DIR="${STATE_DIR}/agents/main/qmd"
QMD_XDG_CONFIG_HOME="${QMD_STATE_DIR}/xdg-config"
QMD_XDG_CACHE_HOME="${QMD_STATE_DIR}/xdg-cache"
BOOTSTRAP_DATE="$(date -u +%F)"
BOOTSTRAP_MEMORY_FILE="${WORKSPACE_DIR}/MEMORY.md"
BOOTSTRAP_DAILY_MEMORY_FILE="${WORKSPACE_DIR}/memory/${BOOTSTRAP_DATE}.md"
LEGACY_ALMA_MEMORY_FILE="${WORKSPACE_DIR}/memory/railway-alma-verification.md"
MEMORY_SEARCH_CACHE_DIR="${OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR:-${STATE_DIR}/models/node-llama-cpp}"
MEMORY_SEARCH_STORE_PATH="${OPENCLAW_MEMORY_SEARCH_STORE_PATH:-${STATE_DIR}/memory/{agentId}.sqlite}"
QMD_WARMUP_QUERY="${OPENCLAW_MEMORY_QMD_WARMUP_QUERY:-test}"

log() {
  printf '[runtime-bootstrap] %s\n' "$*"
}

bool_env_true() {
  local value="${1:-}"
  case "$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

dir_has_files() {
  local dir="$1"
  find "$dir" -mindepth 1 -print -quit 2>/dev/null | grep -q .
}

ensure_dir() {
  mkdir -p "$1"
}

ensure_mode() {
  local path="$1"
  local mode="$2"
  if [ -e "$path" ]; then
    chmod "$mode" "$path" 2>/dev/null || true
  fi
}

ensure_writable_dir() {
  local dir="$1"
  local probe="${dir}/.write-test"
  ensure_dir "${dir}"
  ensure_mode "${dir}" 700
  if ! printf 'ok' > "${probe}" 2>/dev/null; then
    log "Warning: ${dir} is not writable"
    return 1
  fi
  rm -f "${probe}" 2>/dev/null || true
}

backup_path() {
  local src="$1"
  local label="$2"
  if [ ! -e "$src" ] && [ ! -L "$src" ]; then
    return 0
  fi

  local backup_root="${DATA_ROOT}/backups"
  local dest="${backup_root}/${label}-$(timestamp)"
  ensure_dir "$backup_root"
  mv "$src" "$dest"
  log "Backed up ${src} -> ${dest}"
}

sync_if_target_empty() {
  local src="$1"
  local dst="$2"
  if [ ! -d "$src" ]; then
    return 0
  fi
  if dir_has_files "$src" && ! dir_has_files "$dst"; then
    cp -a "${src}/." "${dst}/"
    log "Migrated contents from ${src} -> ${dst}"
  fi
}

ensure_workspace_target() {
  ensure_dir "$(dirname "${WORKSPACE_DIR}")"
  ensure_dir "${WORKSPACE_VOLUME_DIR}"

  if [ "${WORKSPACE_DIR}" = "${WORKSPACE_COMPAT_DIR}" ]; then
    if [ -L "${WORKSPACE_DIR}" ]; then
      local target
      target="$(readlink -f "${WORKSPACE_DIR}" || true)"
      if [ "${target}" = "${WORKSPACE_VOLUME_DIR}" ]; then
        return 0
      fi
      backup_path "${WORKSPACE_DIR}" "root-openclaw-workspace-link"
    elif [ -e "${WORKSPACE_DIR}" ]; then
      sync_if_target_empty "${WORKSPACE_DIR}" "${WORKSPACE_VOLUME_DIR}"
      backup_path "${WORKSPACE_DIR}" "root-openclaw-workspace"
    fi

    ln -sfn "${WORKSPACE_VOLUME_DIR}" "${WORKSPACE_DIR}"
    log "Linked ${WORKSPACE_DIR} -> ${WORKSPACE_VOLUME_DIR}"
    return 0
  fi

  if [ -L "${WORKSPACE_DIR}" ]; then
    local target
    target="$(readlink -f "${WORKSPACE_DIR}" || true)"
    if [ "${target}" = "${WORKSPACE_VOLUME_DIR}" ]; then
      rm -f "${WORKSPACE_DIR}"
      ensure_dir "${WORKSPACE_DIR}"
      sync_if_target_empty "${WORKSPACE_VOLUME_DIR}" "${WORKSPACE_DIR}"
      log "Promoted ${WORKSPACE_DIR} from symlinked volume path to direct workspace directory"
      return 0
    fi
    if [ "${target}" = "$(readlink -f "${WORKSPACE_DIR}")" ]; then
      return 0
    fi
    backup_path "${WORKSPACE_DIR}" "configured-workspace-link"
  fi

  if [ ! -e "${WORKSPACE_DIR}" ]; then
    ensure_dir "${WORKSPACE_DIR}"
  fi

  if [ "${WORKSPACE_DIR}" != "${WORKSPACE_VOLUME_DIR}" ]; then
    sync_if_target_empty "${WORKSPACE_VOLUME_DIR}" "${WORKSPACE_DIR}"
  fi
}

ensure_workspace_compat_link() {
  ensure_dir "${ROOT_HOME_OPENCLAW_DIR}"

  if [ "${WORKSPACE_DIR}" = "${WORKSPACE_COMPAT_DIR}" ]; then
    return 0
  fi

  if [ -L "${WORKSPACE_COMPAT_DIR}" ]; then
    local target
    target="$(readlink -f "${WORKSPACE_COMPAT_DIR}" || true)"
    if [ "${target}" = "$(readlink -f "${WORKSPACE_DIR}")" ]; then
      return 0
    fi
    backup_path "${WORKSPACE_COMPAT_DIR}" "root-openclaw-workspace-link"
  elif [ -e "${WORKSPACE_COMPAT_DIR}" ]; then
    sync_if_target_empty "${WORKSPACE_COMPAT_DIR}" "${WORKSPACE_DIR}"
    backup_path "${WORKSPACE_COMPAT_DIR}" "root-openclaw-workspace"
  fi

  ln -sfn "${WORKSPACE_DIR}" "${WORKSPACE_COMPAT_DIR}"
  log "Linked ${WORKSPACE_COMPAT_DIR} -> ${WORKSPACE_DIR}"
}

ensure_legacy_workspace_mapping() {
  local legacy="/workspace"
  if [ -L "${legacy}" ]; then
    local target
    target="$(readlink -f "${legacy}" || true)"
    if [ "${target}" = "$(readlink -f "${WORKSPACE_DIR}")" ]; then
      return 0
    fi
    backup_path "${legacy}" "legacy-workspace-link"
  elif [ -e "${legacy}" ]; then
    sync_if_target_empty "${legacy}" "${WORKSPACE_DIR}"
    backup_path "${legacy}" "legacy-workspace"
  fi

  ln -sfn "${WORKSPACE_DIR}" "${legacy}"
  log "Mapped ${legacy} -> ${WORKSPACE_DIR}"
}

fix_permissions() {
  ensure_dir "${STATE_DIR}"
  ensure_dir "${CREDENTIALS_DIR}"
  ensure_dir "${CLAUDE_STATE_DIR}"

  ensure_mode "${DATA_ROOT}" 755
  ensure_mode "${STATE_DIR}" 700
  ensure_mode "${CREDENTIALS_DIR}" 700
  ensure_mode "${CLAUDE_STATE_DIR}" 700
  ensure_mode "${ROOT_HOME_OPENCLAW_DIR}" 700

  while IFS= read -r -d '' file; do
    chmod 600 "$file" 2>/dev/null || true
  done < <(find "${STATE_DIR}" -type f \( \
    -name '*.json' -o \
    -name '*.json5' -o \
    -name '*.key' -o \
    -name '*.pem' -o \
    -name '*.token' -o \
    -name '.env' \
  \) -print0 2>/dev/null)
}

ensure_claude_cli_state() {
  ensure_dir "${CLAUDE_STATE_DIR}"

  if [ -L "${CLAUDE_COMPAT_DIR}" ]; then
    local target
    target="$(readlink -f "${CLAUDE_COMPAT_DIR}" || true)"
    if [ "${target}" = "$(readlink -f "${CLAUDE_STATE_DIR}")" ]; then
      return 0
    fi
    backup_path "${CLAUDE_COMPAT_DIR}" "root-claude-link"
  elif [ -e "${CLAUDE_COMPAT_DIR}" ]; then
    sync_if_target_empty "${CLAUDE_COMPAT_DIR}" "${CLAUDE_STATE_DIR}"
    backup_path "${CLAUDE_COMPAT_DIR}" "root-claude"
  fi

  ln -sfn "${CLAUDE_STATE_DIR}" "${CLAUDE_COMPAT_DIR}"
  log "Linked ${CLAUDE_COMPAT_DIR} -> ${CLAUDE_STATE_DIR}"
}

seed_memory_corpus() {
  ensure_dir "${WORKSPACE_DIR}/memory"

  if [ ! -f "${BOOTSTRAP_MEMORY_FILE}" ]; then
    cat > "${BOOTSTRAP_MEMORY_FILE}" <<EOF
# Railway Workspace Memory

- Active OpenClaw workspace path: ${WORKSPACE_DIR}
- Persistent workspace volume path: ${WORKSPACE_VOLUME_DIR}
- Persistent OpenClaw state path: ${STATE_DIR}
- SFTPGo transfer path: ${WORKSPACE_DIR}
- Search query hint: railway persistent workspace
EOF
    chmod 600 "${BOOTSTRAP_MEMORY_FILE}" 2>/dev/null || true
    log "Seeded ${BOOTSTRAP_MEMORY_FILE}"
  fi

  if [ ! -f "${BOOTSTRAP_DAILY_MEMORY_FILE}" ]; then
    cat > "${BOOTSTRAP_DAILY_MEMORY_FILE}" <<EOF
# Boot Note ${BOOTSTRAP_DATE}

This deployment stores the active OpenClaw workspace at ${WORKSPACE_DIR}.
The compatibility path ${WORKSPACE_COMPAT_DIR} must resolve to the same workspace.
EOF
    chmod 600 "${BOOTSTRAP_DAILY_MEMORY_FILE}" 2>/dev/null || true
    log "Seeded ${BOOTSTRAP_DAILY_MEMORY_FILE}"
  fi

  if [ -f "${LEGACY_ALMA_MEMORY_FILE}" ]; then
    rm -f "${LEGACY_ALMA_MEMORY_FILE}" 2>/dev/null || true
    log "Removed legacy Alma verification seed ${LEGACY_ALMA_MEMORY_FILE}"
  fi
}

expose_workspace_for_sftpgo() {
  ensure_dir "${SFTPGO_SRV_DIR}"
  ln -sfn "${WORKSPACE_DIR}" "${SFTPGO_DATA_ROOT}/workspace"
  ln -sfn "${WORKSPACE_DIR}" "${SFTPGO_SRV_DIR}/workspace"
}

sqlite_extension_probe() {
  if ! command -v sqlite3 >/dev/null 2>&1; then
    log "sqlite3 not found on PATH"
    return 1
  fi
  sqlite3 ':memory:' "SELECT sqlite_compileoption_used('ENABLE_LOAD_EXTENSION');" 2>/dev/null | grep -q '^1$'
}

prepare_qmd_dirs() {
  ensure_dir "${QMD_XDG_CONFIG_HOME}"
  ensure_dir "${QMD_XDG_CACHE_HOME}/qmd"
}

prepare_memory_search_dirs() {
  local concrete_store_path="${MEMORY_SEARCH_STORE_PATH/\{agentId\}/main}"
  ensure_writable_dir "${MEMORY_SEARCH_CACHE_DIR}" || true
  ensure_writable_dir "$(dirname "${concrete_store_path}")" || true
}

warm_qmd() {
  if ! command -v "${QMD_COMMAND}" >/dev/null 2>&1; then
    log "Skipping QMD warmup: ${QMD_COMMAND} not found"
    return 0
  fi

  prepare_qmd_dirs

  export XDG_CONFIG_HOME="${QMD_XDG_CONFIG_HOME}"
  export XDG_CACHE_HOME="${QMD_XDG_CACHE_HOME}"
  export NO_COLOR=1

  log "QMD version: $(${QMD_COMMAND} --version 2>/dev/null || echo unavailable)"
  log "Skipping direct qmd update/embed warmup; OpenClaw manages QMD collections and boot refresh"
  "${QMD_COMMAND}" query "${QMD_WARMUP_QUERY}" --json -n 1 >/dev/null 2>&1 || true
}

prepare_runtime() {
  ensure_dir "${DATA_ROOT}"
  ensure_dir "${WORKSPACE_VOLUME_DIR}"
  ensure_dir "${STATE_DIR}"
  ensure_workspace_target
  ensure_workspace_compat_link
  ensure_legacy_workspace_mapping
  fix_permissions
  ensure_claude_cli_state
  seed_memory_corpus
  expose_workspace_for_sftpgo
  prepare_qmd_dirs
  prepare_memory_search_dirs

  if sqlite_extension_probe; then
    log "sqlite3 extension support detected"
  else
    log "sqlite3 extension support probe failed"
  fi

  log "Active workspace configured at ${WORKSPACE_DIR}"
  log "Active workspace resolves to $(readlink -f "${WORKSPACE_DIR}" || echo unresolved)"
  log "Compatibility workspace resolves to $(readlink -f "${WORKSPACE_COMPAT_DIR}" || echo unresolved)"
  log "Claude CLI state resolves to $(readlink -f "${CLAUDE_COMPAT_DIR}" || echo unresolved)"
  log "Memory search cache dir prepared at ${MEMORY_SEARCH_CACHE_DIR}"
  log "Memory search store template prepared at ${MEMORY_SEARCH_STORE_PATH}"
}

case "${1:-prepare}" in
  prepare)
    prepare_runtime
    ;;
  warm-qmd)
    warm_qmd
    ;;
  *)
    echo "Usage: $0 {prepare|warm-qmd}" >&2
    exit 64
    ;;
esac
