#!/bin/bash
# actシナリオテスト実行ヘルパースクリプト
# 使用方法: ./scripts/test-act-scenarios.sh [normal|degraded]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# 引数チェック
MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "使用方法: $0 [normal|degraded]"
  echo ""
  echo "例:"
  echo "  $0 normal    # 正常系テスト"
  echo "  $0 degraded  # 縮退系テスト"
  exit 1
fi

if [ "$MODE" != "normal" ] && [ "$MODE" != "degraded" ]; then
  echo "❌ エラー: モードは 'normal' または 'degraded' を指定してください"
  exit 1
fi

# actのインストール確認
if ! command -v act >/dev/null 2>&1; then
  echo "❌ act がインストールされていません"
  echo "インストール: brew install act"
  exit 1
fi

# Dockerの起動確認
if ! docker ps >/dev/null 2>&1; then
  echo "❌ Docker が起動していません"
  echo "Docker Desktop を起動してください"
  exit 1
fi

echo "## 🚀 actシナリオテスト: $MODE モード"
echo ""

# 環境変数・シークレットの確認
echo "### 環境変数・シークレットの確認"
echo ""

# .secretsファイルの確認
if [ -f ".secrets" ]; then
  echo "✅ .secrets ファイルが見つかりました"
  SECRET_FILE="--secret-file .secrets"
else
  echo "⚠️  .secrets ファイルが見つかりません"
  echo "   シークレットは -s オプションで直接指定する必要があります"
  SECRET_FILE=""
fi

echo ""

# テスト実行
if [ "$MODE" = "normal" ]; then
  echo "### 正常系テスト実行"
  echo ""
  
  # シークレットの設定確認（非対話モード）
  if [ -z "$SECRET_FILE" ]; then
    echo "⚠️  以下のシークレットを設定してください:"
    echo "   -s MANUS_ENABLED=true"
    echo "   -s DEVELOPMENT_MODE=true"
    echo "   -s SUPABASE_SERVICE_ROLE_KEY=..."
    echo "   -s SUPABASE_URL=..."
    echo "   -s MANUS_API_KEY=..."
    echo "   -s PROGRESS_WEBHOOK_URL=..."
    echo ""
    echo "非対話モードで続行します（必要なシークレットが不足している可能性があります）..."
  fi
  
  echo "実行コマンド:"
  echo "act repository_dispatch \\"
  echo "  -W .github/workflows/line-event.yml \\"
  echo "  --eventpath .github/workflows/.act/line-event-repository-dispatch-normal.json \\"
  echo "  $SECRET_FILE"
  echo ""
  
  act repository_dispatch \
    -W .github/workflows/line-event.yml \
    --eventpath .github/workflows/.act/line-event-repository-dispatch-normal.json \
    $SECRET_FILE \
    -s MANUS_ENABLED=true \
    -s DEVELOPMENT_MODE=true \
    -e GITHUB_TOKEN="${GITHUB_TOKEN:-dummy-token}"
    
elif [ "$MODE" = "degraded" ]; then
  echo "### 縮退系テスト実行"
  echo ""
  
  # シークレットの設定確認（非対話モード）
  if [ -z "$SECRET_FILE" ]; then
    echo "⚠️  以下のシークレットを設定してください:"
    echo "   -s MANUS_ENABLED=false"
    echo "   -s DEVELOPMENT_MODE=false"
    echo ""
    echo "非対話モードで続行します..."
  fi
  
  echo "実行コマンド:"
  echo "act repository_dispatch \\"
  echo "  -W .github/workflows/line-event.yml \\"
  echo "  --eventpath .github/workflows/.act/line-event-repository-dispatch-degraded.json \\"
  echo "  $SECRET_FILE"
  echo ""
  
  act repository_dispatch \
    -W .github/workflows/line-event.yml \
    --eventpath .github/workflows/.act/line-event-repository-dispatch-degraded.json \
    $SECRET_FILE \
    -s MANUS_ENABLED=false \
    -s DEVELOPMENT_MODE=false \
    -e GITHUB_TOKEN="${GITHUB_TOKEN:-dummy-token}"
fi

echo ""
echo "## ✅ テスト実行完了"
echo ""
echo "### 確認ポイント"
echo "1. Resolve Plan Mode ステップの出力を確認"
if [ "$MODE" = "normal" ]; then
  echo "   - mode=normal が表示されること"
  echo "   - current_plan.json が使用されること"
elif [ "$MODE" = "degraded" ]; then
  echo "   - mode=degraded が表示されること"
  echo "   - reason=manus_disabled が表示されること"
  echo "   - degraded_plan.json が使用されること"
fi
echo ""
echo "2. Dispatch to Manus ステップ"
if [ "$MODE" = "normal" ]; then
  echo "   - ステップが実行されること"
elif [ "$MODE" = "degraded" ]; then
  echo "   - ステップがスキップされること"
fi

