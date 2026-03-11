#!/bin/bash
set -euo pipefail

DATA_ROOT="${OPENCLAW_DATA_ROOT:-/data}"
STATE_DIR="${OPENCLAW_STATE_DIR:-${DATA_ROOT}/.openclaw}"
WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR:-${DATA_ROOT}/workspace}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${WORKSPACE_VOLUME_DIR}}"
WORKSPACE_COMPAT_DIR="${OPENCLAW_WORKSPACE_COMPAT_DIR:-/root/.openclaw/workspace}"
ROOT_HOME_OPENCLAW_DIR="$(dirname "${WORKSPACE_COMPAT_DIR}")"
CREDENTIALS_DIR="${STATE_DIR}/credentials"
SFTPGO_DATA_ROOT="${SFTPGO_DATA_ROOT:-${DATA_ROOT}/sftpgo}"
SFTPGO_SRV_DIR="${SFTPGO_DATA_ROOT}/srv"
QMD_COMMAND="${OPENCLAW_MEMORY_QMD_COMMAND:-qmd}"
QMD_STATE_DIR="${STATE_DIR}/agents/main/qmd"
QMD_XDG_CONFIG_HOME="${QMD_STATE_DIR}/xdg-config"
QMD_XDG_CACHE_HOME="${QMD_STATE_DIR}/xdg-cache"
BOOTSTRAP_DATE="$(date -u +%F)"
BOOTSTRAP_MEMORY_FILE="${WORKSPACE_DIR}/MEMORY.md"
BOOTSTRAP_DAILY_MEMORY_FILE="${WORKSPACE_DIR}/memory/${BOOTSTRAP_DATE}.md"

log() {
  printf '[runtime-bootstrap] %s\n' "$*"
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

  ensure_mode "${DATA_ROOT}" 755
  ensure_mode "${STATE_DIR}" 700
  ensure_mode "${CREDENTIALS_DIR}" 700
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

qmd_collection_exists() {
  local name="$1"
  qmd collection list --json 2>/dev/null | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"${name}\""
}

ensure_qmd_collection() {
  local name="$1"
  local root="$2"
  local pattern="$3"
  ensure_dir "$root"
  if qmd_collection_exists "$name"; then
    return 0
  fi
  qmd collection add "$name" "$root" --pattern "$pattern" >/dev/null
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

  ensure_qmd_collection "memory-root" "${WORKSPACE_DIR}" "MEMORY.md" || true
  ensure_qmd_collection "memory-alt" "${WORKSPACE_DIR}" "memory.md" || true
  ensure_qmd_collection "memory-dir" "${WORKSPACE_DIR}/memory" "**/*.md" || true

  "${QMD_COMMAND}" update || true
  "${QMD_COMMAND}" embed || true
}

prepare_runtime() {
  ensure_dir "${DATA_ROOT}"
  ensure_dir "${WORKSPACE_VOLUME_DIR}"
  ensure_dir "${STATE_DIR}"
  ensure_workspace_target
  ensure_workspace_compat_link
  ensure_legacy_workspace_mapping
  fix_permissions
  seed_memory_corpus
  expose_workspace_for_sftpgo
  prepare_qmd_dirs

  if sqlite_extension_probe; then
    log "sqlite3 extension support detected"
  else
    log "sqlite3 extension support probe failed"
  fi

  log "Active workspace configured at ${WORKSPACE_DIR}"
  log "Active workspace resolves to $(readlink -f "${WORKSPACE_DIR}" || echo unresolved)"
  log "Compatibility workspace resolves to $(readlink -f "${WORKSPACE_COMPAT_DIR}" || echo unresolved)"
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
