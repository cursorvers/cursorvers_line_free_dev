#!/bin/bash
# detect-errors.sh
# GitHub Actions実行結果からエラーを検出し、分類するスクリプト

set -e

# 引数チェック
if [ $# -lt 1 ]; then
  echo "Usage: $0 <response_body>"
  exit 1
fi

RESPONSE_BODY=$1
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)

# エラーパターン検出
ERROR_TYPE="unknown"
ERROR_MESSAGE=""
FIX_SCRIPT=""

# HTTP 401: Missing authorization header
if echo "$RESPONSE_BODY" | grep -q "Missing authorization header"; then
  ERROR_TYPE="missing_auth_header"
  ERROR_MESSAGE="Authorization header is missing"
  FIX_SCRIPT="fix-auth-headers.sh"
fi

# HTTP 401: Invalid JWT
if echo "$RESPONSE_BODY" | grep -q "Invalid JWT"; then
  ERROR_TYPE="invalid_jwt"
  ERROR_MESSAGE="JWT token is invalid or expired"
  FIX_SCRIPT="manual_api_key_update"
fi

if echo "$RESPONSE_BODY" | grep -q "Bad credentials"; then
  ERROR_TYPE="github_bad_credentials"
  ERROR_MESSAGE="GitHub token is invalid or expired"
  FIX_SCRIPT="manual_github_token_refresh"
fi

# YAML syntax error
if echo "$RESPONSE_BODY" | grep -q "yaml syntax"; then
  ERROR_TYPE="yaml_syntax"
  ERROR_MESSAGE="YAML syntax error detected"
  FIX_SCRIPT="fix-yaml-syntax.sh"
fi

# HTTP 500
if echo "$RESPONSE_BODY" | grep -q "500"; then
  ERROR_TYPE="server_error"
  ERROR_MESSAGE="Internal server error"
  FIX_SCRIPT="manual_investigation"
fi

# エラー情報をJSON形式で出力
cat <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "error_type": "${ERROR_TYPE}",
  "error_message": "${ERROR_MESSAGE}",
  "fix_script": "${FIX_SCRIPT}",
  "raw_response": $(echo "$RESPONSE_BODY" | jq -Rs .)
}
EOF
