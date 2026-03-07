#!/usr/bin/env bash

set -euo pipefail

FUNCTION_NAME="${1:?function name is required}"
PROJECT_REF="${2:?project ref is required}"
DEPLOY_LOG="${3:?deploy log path is required}"
shift 3

LOCKFILE_PATH="supabase/functions/deno.lock"
LOCKFILE_BACKUP=""

cleanup() {
  if [[ -n "$LOCKFILE_BACKUP" && -f "$LOCKFILE_BACKUP" ]]; then
    mv "$LOCKFILE_BACKUP" "$LOCKFILE_PATH"
  fi
}

trap cleanup EXIT

if [[ "$FUNCTION_NAME" == "manus-intelligent-repair" && -f "$LOCKFILE_PATH" ]]; then
  LOCKFILE_BACKUP="${LOCKFILE_PATH}.bak.kernel"
  echo "[deploy-helper] temporarily disabling deno.lock for ${FUNCTION_NAME}" | tee -a "$DEPLOY_LOG"
  mv "$LOCKFILE_PATH" "$LOCKFILE_BACKUP"
fi

supabase functions deploy "$FUNCTION_NAME" --project-ref "$PROJECT_REF" "$@" 2>&1 | tee -a "$DEPLOY_LOG"
