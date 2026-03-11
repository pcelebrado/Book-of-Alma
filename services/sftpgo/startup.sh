#!/bin/sh
set -eu

DATA_ROOT="${SFTPGO_DATA_ROOT:-/data/sftpgo}"
SRV_DIR="${DATA_ROOT}/srv"
LIB_DIR="${DATA_ROOT}/lib"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR:-/data/workspace}"

mkdir -p "${SRV_DIR}" "${LIB_DIR}" "${WORKSPACE_DIR}"

if [ -d /srv/sftpgo ] && [ ! -L /srv/sftpgo ]; then
  if [ -z "$(ls -A "${SRV_DIR}" 2>/dev/null || true)" ]; then
    cp -a /srv/sftpgo/. "${SRV_DIR}/" 2>/dev/null || true
  fi
  rm -rf /srv/sftpgo
fi

if [ -d /var/lib/sftpgo ] && [ ! -L /var/lib/sftpgo ]; then
  if [ -z "$(ls -A "${LIB_DIR}" 2>/dev/null || true)" ]; then
    cp -a /var/lib/sftpgo/. "${LIB_DIR}/" 2>/dev/null || true
  fi
  rm -rf /var/lib/sftpgo
fi

ln -sfn "${SRV_DIR}" /srv/sftpgo
ln -sfn "${LIB_DIR}" /var/lib/sftpgo
ln -sfn "${WORKSPACE_DIR}" "${DATA_ROOT}/workspace"
ln -sfn "${WORKSPACE_DIR}" "${SRV_DIR}/workspace"

exec sftpgo serve
