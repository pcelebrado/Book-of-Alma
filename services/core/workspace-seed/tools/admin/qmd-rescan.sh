#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
QMD_COMMAND="${OPENCLAW_MEMORY_QMD_COMMAND:-/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd}"
QMD_AGENT_DIR="${STATE_DIR}/agents/main/qmd"
QMD_COLLECTION_NAME="${OPENCLAW_QMD_COLLECTION_NAME:-workspace}"
QMD_COLLECTION_PATTERN="${OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN:-**/*.md}"
QMD_RESCAN_MIN_INTERVAL_SECONDS="${OPENCLAW_QMD_RESCAN_MIN_INTERVAL_SECONDS:-14400}"
LOGDIR="${WORKDIR}/knowledge/qmd"
STAMPDIR="${WORKDIR}/data/qmd"
STAMPFILE="${STAMPDIR}/last_rescan_success_utc.txt"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOGFILE="${LOGDIR}/qmd-rescan-${TS}.log"

mkdir -p "${LOGDIR}" "${STAMPDIR}" "${QMD_AGENT_DIR}/xdg-config" "${QMD_AGENT_DIR}/xdg-cache"
export XDG_CONFIG_HOME="${QMD_AGENT_DIR}/xdg-config"
export XDG_CACHE_HOME="${QMD_AGENT_DIR}/xdg-cache"

if [ -f "${STAMPFILE}" ]; then
  last_success="$(cat "${STAMPFILE}" 2>/dev/null || true)"
  now_epoch="$(date +%s)"
  if [[ "${last_success}" =~ ^[0-9]+$ ]] && [ $((now_epoch - last_success)) -lt "${QMD_RESCAN_MIN_INTERVAL_SECONDS}" ]; then
    {
      echo "[qmd-rescan] start ${TS}"
      echo "[qmd-rescan] skipped: last successful rescan is newer than ${QMD_RESCAN_MIN_INTERVAL_SECONDS}s"
    } >>"${LOGFILE}" 2>&1
    echo "${LOGFILE}"
    exit 0
  fi
fi

{
  echo "[qmd-rescan] start ${TS}"
  echo "[qmd-rescan] workdir=${WORKDIR}"
  echo "[qmd-rescan] collection=${QMD_COLLECTION_NAME}"
  echo "[qmd-rescan] pattern=${QMD_COLLECTION_PATTERN}"
  echo "[qmd-rescan] note: direct workflow uses qmd search, so this maintenance pass stays incremental with qmd update only"

  if ! "${QMD_COMMAND}" collection add "${WORKDIR}" --name "${QMD_COLLECTION_NAME}" --mask "${QMD_COLLECTION_PATTERN}" >/tmp/qmd-collection-add.log 2>&1; then
    if grep -qi "already exists" /tmp/qmd-collection-add.log; then
      echo "[qmd-rescan] collection already exists"
    else
      cat /tmp/qmd-collection-add.log
      exit 1
    fi
  else
    echo "[qmd-rescan] collection created"
  fi

  "${QMD_COMMAND}" update
  date +%s >"${STAMPFILE}"
  echo "[qmd-rescan] success $(date -u +%Y%m%dT%H%M%SZ)"
} >>"${LOGFILE}" 2>&1

echo "${LOGFILE}"
