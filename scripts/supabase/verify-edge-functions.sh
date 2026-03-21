#!/usr/bin/env bash
# Post-deploy HTTP verification for Supabase Edge Functions.
# Detects ghost functions (404) caused by Supabase CLI bug #3831
# and attempts hash-bust recovery.
#
# Usage: $0 <SUPABASE_URL> <function_name> [function_name ...]
# Env:   PROJECT_REF (required), SUPABASE_ACCESS_TOKEN (required)

set -euo pipefail

if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  echo "ERROR: Bash 4+ required (found ${BASH_VERSION})" >&2
  exit 2
fi

usage() {
  echo "Usage: $0 <SUPABASE_URL> <function_name> [function_name ...]" >&2
  exit 2
}

if [ "$#" -lt 2 ]; then
  usage
fi

SUPABASE_URL="${1%/}"
shift
FUNCTIONS=("$@")

: "${PROJECT_REF:?PROJECT_REF is required}"

# Functions deployed with --no-verify-jwt (external webhook receivers)
NO_VERIFY_JWT_FUNCTIONS=(
  line-webhook
  stripe-webhook
  create-checkout-session
  ingest-hij
  generate-sec-brief
  line-register
  line-bot
  manus-code-fixer
  discord-bot
)

declare -A NO_VERIFY_JWT_MAP=()
for func in "${NO_VERIFY_JWT_FUNCTIONS[@]}"; do
  NO_VERIFY_JWT_MAP["$func"]=1
done

verified=0
ghost_recovered=0
failed_functions=()
busted_files=()

log() {
  printf '[verify-edge-functions] %s\n' "$*" >&2
}

probe_status() {
  local func_name="$1"
  local url="${SUPABASE_URL}/functions/v1/${func_name}"
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo "000"
}

# Ghost detection: only 404 and connection failures (000/empty) are unhealthy.
# 401 = JWT-protected function exists (healthy)
# 500 = function exists but has runtime error (healthy for ghost detection, warn)
# 404 = function missing from Edge Runtime (ghost)
is_ghost() {
  local status="$1"
  case "$status" in
    404|"000"|"")
      return 0  # ghost / unreachable
      ;;
    5[0-9][0-9])
      log "WARNING: ${2:-unknown} returned ${status} (function exists but may have runtime error)"
      return 1  # not ghost, but warn
      ;;
    *)
      return 1  # healthy
      ;;
  esac
}

hash_bust_source() {
  local func_name="$1"
  local timestamp="$2"
  local file_path="supabase/functions/${func_name}/index.ts"
  local marker="// deploy-verify: ${timestamp}"

  if [ ! -f "$file_path" ]; then
    log "CRITICAL: source file not found: ${file_path}"
    return 1
  fi

  # If last line already has a deploy-verify marker, replace only that last line
  if tail -n 1 "$file_path" | grep -Eq '^// deploy-verify: [0-9]+$'; then
    # GNU sed: $ addresses last line only
    sed -i -E "$ s|^// deploy-verify: [0-9]+$|${marker}|" "$file_path"
  else
    printf '\n%s\n' "$marker" >> "$file_path"
  fi

  busted_files+=("$file_path")
}

redeploy_function() {
  local func_name="$1"
  local args=(supabase functions deploy "$func_name" --project-ref "$PROJECT_REF")

  if [ "${NO_VERIFY_JWT_MAP[$func_name]+x}" = "x" ]; then
    args+=(--no-verify-jwt)
  fi

  log "Re-deploying ${func_name}: ${args[*]}"
  "${args[@]}" >&2
}

cleanup_busted_files() {
  if [ "${#busted_files[@]}" -gt 0 ]; then
    log "Reverting hash-bust changes in ${#busted_files[@]} file(s)"
    git checkout -- "${busted_files[@]}" 2>/dev/null || true
  fi
}

trap cleanup_busted_files EXIT

json_failed_array() {
  local first=1
  printf '['
  for func_name in "${failed_functions[@]}"; do
    if [ "$first" -eq 0 ]; then
      printf ', '
    fi
    printf '"%s"' "$func_name"
    first=0
  done
  printf ']'
}

# Wait for edge propagation before first probe
log "Waiting 5 seconds for edge propagation"
sleep 5

for func_name in "${FUNCTIONS[@]}"; do
  status="$(probe_status "$func_name")"

  if ! is_ghost "$status" "$func_name"; then
    verified=$((verified + 1))
    log "PASS ${func_name} (HTTP ${status})"
    continue
  fi

  log "GHOST DETECTED: ${func_name} (HTTP ${status})"

  timestamp="$(date +%s)"
  if ! hash_bust_source "$func_name" "$timestamp"; then
    failed_functions+=("$func_name")
    continue
  fi

  if ! redeploy_function "$func_name"; then
    log "CRITICAL: redeploy failed for ${func_name}"
    failed_functions+=("$func_name")
    continue
  fi

  # Wait for edge propagation after redeploy
  sleep 5
  retry_status="$(probe_status "$func_name")"

  if ! is_ghost "$retry_status" "$func_name"; then
    verified=$((verified + 1))
    ghost_recovered=$((ghost_recovered + 1))
    log "RECOVERED ${func_name} (HTTP ${retry_status})"
  else
    log "CRITICAL FAIL: ${func_name} still ghosted after retry (HTTP ${retry_status})"
    failed_functions+=("$func_name")
  fi
done

printf '{"verified": %d, "ghost_recovered": %d, "failed": %s}\n' \
  "$verified" \
  "$ghost_recovered" \
  "$(json_failed_array)"

if [ "${#failed_functions[@]}" -gt 0 ]; then
  exit 1
fi
