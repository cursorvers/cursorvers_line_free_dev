#!/bin/bash
# Secrets and environment verification script
# 必要なCLIツール、環境変数、GitHub Secrets/Variablesの存在をチェック

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "## 🔍 Secrets and Environment Verification"
echo ""

ERRORS=0
WARNINGS=0

# 1. CLIツールの確認
echo "### 1. CLI Tools Check"
echo ""

check_command() {
  local cmd=$1
  local name=$2
  
  if command -v "$cmd" >/dev/null 2>&1; then
    local version=$($cmd --version 2>&1 | head -1 || echo "unknown")
    echo "  ✅ $name: $version"
    return 0
  else
    echo "  ❌ $name: 未インストール"
    ((ERRORS++))
    return 1
  fi
}

check_command "gh" "GitHub CLI"
check_command "node" "Node.js"
check_command "npm" "npm"

# Supabase CLIの確認（オプション）
if command -v supabase >/dev/null 2>&1; then
  SUPABASE_VERSION=$(supabase --version 2>&1 | head -1 || echo "unknown")
  echo "  ✅ Supabase CLI: $SUPABASE_VERSION"
else
  echo "  ⚠️  Supabase CLI: 未インストール（オプション）"
  ((WARNINGS++))
fi

echo ""

# 2. GitHub Secrets確認
echo "### 2. GitHub Secrets Check"
echo ""

check_github_secret() {
  local secret=$1
  local name=$2
  
  if gh secret list 2>/dev/null | grep -q "^$secret"; then
    echo "  ✅ $name: 設定済み"
    return 0
  else
    echo "  ❌ $name: 未設定"
    ((ERRORS++))
    return 1
  fi
}

# 必須Secrets
check_github_secret "MANUS_API_KEY" "MANUS_API_KEY"
check_github_secret "PROGRESS_WEBHOOK_URL" "PROGRESS_WEBHOOK_URL"
check_github_secret "SUPABASE_SERVICE_ROLE_KEY" "SUPABASE_SERVICE_ROLE_KEY"

# オプションSecrets
if gh secret list 2>/dev/null | grep -q "^SUPABASE_URL"; then
  echo "  ✅ SUPABASE_URL: 設定済み"
else
  echo "  ⚠️  SUPABASE_URL: 未設定（Variablesに設定されている可能性があります）"
  ((WARNINGS++))
fi

if gh secret list 2>/dev/null | grep -q "^LLM_API_KEY"; then
  echo "  ✅ LLM_API_KEY: 設定済み"
else
  echo "  ⚠️  LLM_API_KEY: 未設定（オプション）"
  ((WARNINGS++))
fi

echo ""

# 3. GitHub Variables確認
echo "### 3. GitHub Variables Check"
echo ""

check_github_variable() {
  local var=$1
  local name=$2
  local required=${3:-false}
  
  if gh variable list 2>/dev/null | grep -q "^$var"; then
    local value=$(gh variable list 2>/dev/null | grep "^$var" | awk '{print $2}')
    echo "  ✅ $name: $value"
    return 0
  else
    if [ "$required" = "true" ]; then
      echo "  ❌ $name: 未設定（必須）"
      ((ERRORS++))
      return 1
    else
      echo "  ⚠️  $name: 未設定（オプション）"
      ((WARNINGS++))
      return 0
    fi
  fi
}

check_github_variable "DEVELOPMENT_MODE" "DEVELOPMENT_MODE" true
check_github_variable "MANUS_ENABLED" "MANUS_ENABLED" true
check_github_variable "MANUS_BASE_URL" "MANUS_BASE_URL" false
check_github_variable "GEMINI_COST_PER_CALL" "GEMINI_COST_PER_CALL" false

echo ""

# 4. ローカル環境変数確認（.envファイル）
echo "### 4. Local Environment Variables (.env)"
echo ""

if [ -f ".env" ]; then
  echo "  ✅ .env ファイルが存在します"
  
  # 重要な環境変数の確認
  if grep -q "^MANUS_API_KEY=" .env 2>/dev/null; then
    echo "  ✅ MANUS_API_KEY: 設定済み"
  else
    echo "  ⚠️  MANUS_API_KEY: .envに未設定"
    ((WARNINGS++))
  fi
  
  if grep -q "^DEVELOPMENT_MODE=" .env 2>/dev/null; then
    echo "  ✅ DEVELOPMENT_MODE: 設定済み"
  else
    echo "  ⚠️  DEVELOPMENT_MODE: .envに未設定"
    ((WARNINGS++))
  fi
else
  echo "  ⚠️  .env ファイルが存在しません（ローカル開発時のみ必要）"
  ((WARNINGS++))
fi

echo ""

# 5. 必須ファイルの確認
echo "### 5. Required Files Check"
echo ""

check_file() {
  local file=$1
  local name=$2
  
  if [ -f "$file" ]; then
    echo "  ✅ $name: 存在"
    return 0
  else
    echo "  ❌ $name: 不存在"
    ((ERRORS++))
    return 1
  fi
}

check_file "package.json" "package.json"
check_file ".github/workflows/line-event.yml" "line-event.yml"
check_file "orchestration/plan/production/current_plan.json" "current_plan.json"
check_file "orchestration/plan/production/degraded_plan.json" "degraded_plan.json"

echo ""

echo "### 6. Workflow Secret Coverage"
echo ""
if node scripts/checks/verify-secrets.mjs --workflow line-event.yml --workflow manus-progress.yml; then
  echo ""
  echo "  ✅ workflow secret coverage satisfied"
else
  echo ""
  echo "  ❌ Workflow secret coverage check failed"
  ((ERRORS++))
fi

echo ""

echo "### 7. Runtime Parameter Registry"
echo ""
if node scripts/checks/verify-runtime-config.mjs; then
  echo ""
  echo "  ✅ runtime parameter registry satisfied"
else
  echo ""
  echo "  ❌ Runtime parameter registry check failed"
  ((ERRORS++))
fi

echo ""

# 8. 結果サマリー
echo "## 📊 Verification Summary"
echo ""

if [ $ERRORS -eq 0 ]; then
  echo "✅ すべての必須項目が設定されています"
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  警告: $WARNINGS 件のオプション項目が未設定です"
  fi
  exit 0
else
  echo "❌ エラー: $ERRORS 件の必須項目が未設定です"
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  警告: $WARNINGS 件のオプション項目が未設定です"
  fi
  echo ""
  echo "### 対処方法"
  echo "1. 未設定のGitHub Secretsを設定:"
  echo "   gh secret set <SECRET_NAME> --body \"<value>\""
  echo ""
  echo "2. 未設定のGitHub Variablesを設定:"
  echo "   gh variable set <VARIABLE_NAME> --body \"<value>\""
  echo ""
  echo "3. ローカル開発時は .env ファイルを作成:"
  echo "   cp .env.example .env"
  echo "   # .env を編集して必要な環境変数を設定"
  exit 1
fi
