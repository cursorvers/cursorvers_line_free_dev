#!/bin/bash
# 経済サーキットブレーカのドリルテストスクリプト
# 使用方法: ./scripts/test-circuit-breaker-drill.sh [warning|emergency]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

SCENARIO="${1:-warning}"

echo "## 🚀 経済サーキットブレーカのドリルテスト: $SCENARIO"
echo ""

# BUDGET.ymlの確認
if [ ! -f "BUDGET.yml" ]; then
  echo "❌ BUDGET.yml が見つかりません"
  exit 1
fi

MONTHLY_BUDGET=$(grep -E '^monthly_budget_usd:' BUDGET.yml | awk '{print $2}' | tr -d '"' || echo "100")
WARNING_THRESHOLD=$(grep -E '^warning:' BUDGET.yml | head -1 | awk '{print $2}' | tr -d '"' || echo "0.8")
EMERGENCY_THRESHOLD=$(grep -E '^emergency:' BUDGET.yml | head -1 | awk '{print $2}' | tr -d '"' || echo "1.5")

echo "📊 予算設定:"
echo "  月次予算: \$$MONTHLY_BUDGET USD"
echo "  警告閾値: ${WARNING_THRESHOLD} ($(echo "$MONTHLY_BUDGET * $WARNING_THRESHOLD" | bc) USD)"
echo "  緊急閾値: ${EMERGENCY_THRESHOLD} ($(echo "$MONTHLY_BUDGET * $EMERGENCY_THRESHOLD" | bc) USD)"
echo ""

if [ "$SCENARIO" = "warning" ]; then
  echo "### シナリオ1: 警告閾値（80%）到達テスト"
  echo ""
  
  # コストデータ生成（80% = $80）
  TARGET_COST=$(echo "$MONTHLY_BUDGET * $WARNING_THRESHOLD" | bc)
  ANTHROPIC_COST=$(echo "$TARGET_COST * 0.5625" | bc | awk '{printf "%.2f", $1}')
  FIREBASE_COST=$(echo "$TARGET_COST * 0.25" | bc | awk '{printf "%.2f", $1}')
  GITHUB_MINUTES=150
  
  echo "目標コスト: \$$TARGET_COST USD (${WARNING_THRESHOLD}%)"
  echo ""
  
  COST_DATA=$(node scripts/budget/collect-costs.js --sample --sample-anthropic "$ANTHROPIC_COST" --sample-firebase "$FIREBASE_COST" --sample-github-minutes "$GITHUB_MINUTES" 2>&1)
  TOTAL_COST=$(echo "$COST_DATA" | jq -r '.costs.total_usd')
  
  echo "✅ 生成されたコストデータ:"
  echo "$COST_DATA" | jq '.'
  echo ""
  echo "総コスト: \$$TOTAL_COST USD"
  echo "使用率: $(echo "scale=2; $TOTAL_COST * 100 / $MONTHLY_BUDGET" | bc)%"
  echo ""
  echo "### 期待される動作:"
  echo "  - 警告Issueが作成される"
  echo "  - threshold_state=warning がSupabaseに記録される"
  echo "  - MANUS_ENABLED は変更されない（trueのまま）"
  
elif [ "$SCENARIO" = "emergency" ]; then
  echo "### シナリオ2: 緊急閾値（150%）到達テスト"
  echo ""
  
  # コストデータ生成（150% = $150）
  TARGET_COST=$(echo "$MONTHLY_BUDGET * $EMERGENCY_THRESHOLD" | bc)
  ANTHROPIC_COST=$(echo "$TARGET_COST * 0.6" | bc | awk '{printf "%.2f", $1}')
  FIREBASE_COST=$(echo "$TARGET_COST * 0.2667" | bc | awk '{printf "%.2f", $1}')
  GITHUB_MINUTES=200
  
  echo "目標コスト: \$$TARGET_COST USD (${EMERGENCY_THRESHOLD}%)"
  echo ""
  
  COST_DATA=$(node scripts/budget/collect-costs.js --sample --sample-anthropic "$ANTHROPIC_COST" --sample-firebase "$FIREBASE_COST" --sample-github-minutes "$GITHUB_MINUTES" 2>&1)
  TOTAL_COST=$(echo "$COST_DATA" | jq -r '.costs.total_usd')
  
  echo "✅ 生成されたコストデータ:"
  echo "$COST_DATA" | jq '.'
  echo ""
  echo "総コスト: \$$TOTAL_COST USD"
  echo "使用率: $(echo "scale=2; $TOTAL_COST * 100 / $MONTHLY_BUDGET" | bc)%"
  echo ""
  echo "### 期待される動作:"
  echo "  - 緊急Issueが作成される"
  echo "  - threshold_state=emergency がSupabaseに記録される"
  echo "  - MANUS_ENABLED が false に変更される"
  echo "  - degraded.flag ファイルが作成される"
  echo ""
  echo "⚠️  注意: このドリル実行後は復旧手順を実行してください"
  
else
  echo "❌ 無効なシナリオ: $SCENARIO"
  echo "使用方法: $0 [warning|emergency]"
  exit 1
fi

echo ""
echo "## ✅ ドリルテスト準備完了"
echo ""
echo "次のステップ:"
echo "1. GitHub Actionsで economic-circuit-breaker.yml を実行"
echo "2. ログで期待される動作を確認"
if [ "$SCENARIO" = "emergency" ]; then
  echo "3. 復旧手順を実行（MANUS_ENABLED=true, degraded.flag削除）"
fi

