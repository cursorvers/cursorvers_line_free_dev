#!/bin/bash
# Cursorvers システム自動点検スクリプト v4.0
# 改善版: 認証エラー対応 + フォールバック機能 + 詳細ログ
set -e

# カラー定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Discord Webhook URL (環境変数から取得、フォールバック対応)
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-${DISCORD_ADMIN_WEBHOOK_URL:-${DISCORD_SYSTEM_WEBHOOK:-}}}"

if [[ -z "$DISCORD_WEBHOOK_URL" ]]; then
    echo -e "${YELLOW}⚠️ 警告: Discord Webhook URLが設定されていません${NC}"
    echo "環境変数 DISCORD_WEBHOOK_URL, DISCORD_ADMIN_WEBHOOK_URL, または DISCORD_SYSTEM_WEBHOOK を設定してください"
    echo "点検は続行しますが、Discord通知は送信されません"
    DISCORD_ENABLED=false
else
    DISCORD_ENABLED=true
fi

# Supabase設定（環境変数で上書き可能）
SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_ID:-haaxgwyimoqzzxzdaeep}"
SUPABASE_URL="${SUPABASE_URL:-https://${SUPABASE_PROJECT_ID}.supabase.co}"

# n8n設定
N8N_BASE_URL="${N8N_INSTANCE_URL:-https://n8n.srv995974.hstgr.cloud}"
# N8N_INSTANCE_URLにパスが含まれている場合の対応
N8N_API_URL=$(echo "$N8N_BASE_URL" | sed 's|/home/workflows||')

# Google Sheets設定
GOOGLE_SHEET_ID="1mSpu4NMfa8cI7ohYATzIo2jwnD7nqW5rzkcHQobKoaY"
GOOGLE_SHEET_URL="https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}"

# 日付取得
CHECK_DATE=$(date -u +"%Y-%m-%d")
CHECK_TIME=$(date -u +"%Y-%m-%d %H:%M UTC")
CHECK_TIME_JST=$(TZ=Asia/Tokyo date +"%Y-%m-%d %H:%M JST")

# ログファイルパス
LOG_DIR="docs/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/daily-check-${CHECK_DATE}.md"

echo "=========================================="
echo "Cursorvers システム自動点検 v4.0"
echo "改善版: 認証エラー対応 + フォールバック機能"
echo "実行日時: ${CHECK_TIME} (${CHECK_TIME_JST})"
echo "=========================================="
echo ""

# 結果格納用変数
LINE_BOT_STATUS="UNKNOWN"
LINE_BOT_DETAIL=""
DISCORD_STATUS="UNKNOWN"
DISCORD_DETAIL=""
N8N_STATUS="UNKNOWN"
N8N_DETAIL=""
SUPABASE_STATUS="UNKNOWN"
SUPABASE_DETAIL=""
GITHUB_STATUS="UNKNOWN"
GITHUB_DETAIL=""

# エラーカウンター
ERROR_COUNT=0
WARNING_COUNT=0

# ========================================
# 1. LINE Bot稼働確認
# ========================================
echo "🔍 1. LINE Bot稼働確認..."
LINE_BOT_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "${SUPABASE_URL}/functions/v1/line-webhook" \
    -H "Content-Type: application/json" 2>&1 || echo "000")

LINE_BOT_HTTP_CODE=$(echo "$LINE_BOT_RESPONSE" | tail -n 1)
LINE_BOT_BODY=$(echo "$LINE_BOT_RESPONSE" | sed '$d')

# 401は認証ヘッダーなしでの正常応答（期待される動作）
if [[ "$LINE_BOT_HTTP_CODE" == "200" ]] || [[ "$LINE_BOT_HTTP_CODE" == "401" ]]; then
    LINE_BOT_STATUS="✅ OK"
    LINE_BOT_DETAIL="正常稼働中 (HTTP ${LINE_BOT_HTTP_CODE})"
    echo -e "${GREEN}✅ LINE Bot: 正常稼働中 (HTTP ${LINE_BOT_HTTP_CODE})${NC}"
elif [[ "$LINE_BOT_HTTP_CODE" == "000" ]]; then
    LINE_BOT_STATUS="⚠️ WARN"
    LINE_BOT_DETAIL="接続タイムアウト（ネットワークエラーの可能性）"
    echo -e "${YELLOW}⚠️ LINE Bot: 接続タイムアウト${NC}"
    ((WARNING_COUNT++))
else
    LINE_BOT_STATUS="❌ ERROR"
    LINE_BOT_DETAIL="応答異常 (HTTP ${LINE_BOT_HTTP_CODE})"
    echo -e "${RED}❌ LINE Bot: 応答異常 (HTTP ${LINE_BOT_HTTP_CODE})${NC}"
    ((ERROR_COUNT++))
fi
echo ""

# ========================================
# 2. Discord Webhook接続テスト
# ========================================
echo "🔍 2. Discord Webhook接続テスト..."
if [[ "$DISCORD_ENABLED" == true ]]; then
    DISCORD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${DISCORD_WEBHOOK_URL}" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"🔍 Discord Webhook接続テスト - Cursorvers自動点検 v4.0 (${CHECK_TIME_JST})\"}" 2>&1 || echo "000")
    
    DISCORD_HTTP_CODE=$(echo "$DISCORD_RESPONSE" | tail -n 1)
    
    if [[ "$DISCORD_HTTP_CODE" == "204" ]] || [[ "$DISCORD_HTTP_CODE" == "200" ]]; then
        DISCORD_STATUS="✅ OK"
        DISCORD_DETAIL="接続成功 (HTTP ${DISCORD_HTTP_CODE})"
        echo -e "${GREEN}✅ Discord Webhook: 接続成功${NC}"
    else
        DISCORD_STATUS="❌ ERROR"
        DISCORD_DETAIL="接続失敗 (HTTP ${DISCORD_HTTP_CODE})"
        echo -e "${RED}❌ Discord Webhook: 接続失敗 (HTTP ${DISCORD_HTTP_CODE})${NC}"
        ((ERROR_COUNT++))
    fi
else
    DISCORD_STATUS="⚠️ SKIP"
    DISCORD_DETAIL="Webhook URL未設定"
    echo -e "${YELLOW}⚠️ Discord Webhook: スキップ（URL未設定）${NC}"
    ((WARNING_COUNT++))
fi
echo ""

# ========================================
# 3. Supabase Edge Functions確認
# ========================================
echo "🔍 3. Supabase Edge Functions確認..."
# リポジトリ内のEdge Functions一覧を確認
if [[ -d "supabase/functions" ]]; then
    FUNCTION_COUNT=$(find supabase/functions -maxdepth 1 -type d ! -name functions ! -name _shared ! -name supabase | wc -l)
    SUPABASE_STATUS="✅ OK"
    SUPABASE_DETAIL="Edge Functions構成正常 (${FUNCTION_COUNT}個のFunctionsを確認)"
    echo -e "${GREEN}✅ Supabase: Edge Functions構成正常 (${FUNCTION_COUNT}個)${NC}"
else
    SUPABASE_STATUS="❌ ERROR"
    SUPABASE_DETAIL="Edge Functionsディレクトリが見つかりません"
    echo -e "${RED}❌ Supabase: Edge Functionsディレクトリが見つかりません${NC}"
    ((ERROR_COUNT++))
fi
echo ""

# ========================================
# 4. n8nワークフロー状態確認
# ========================================
echo "🔍 4. n8nワークフロー状態確認..."
if [[ -n "$N8N_API_KEY" ]]; then
    N8N_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
        "${N8N_API_URL}/api/v1/workflows" \
        -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
        -H "Accept: application/json" \
        --max-time 10 2>&1 || echo "000")
    
    N8N_HTTP_CODE=$(echo "$N8N_RESPONSE" | tail -n 1)
    N8N_BODY=$(echo "$N8N_RESPONSE" | sed '$d')
    
    if [[ "$N8N_HTTP_CODE" == "200" ]]; then
        WORKFLOW_COUNT=$(echo "$N8N_BODY" | jq -r '. | length' 2>/dev/null || echo "0")
        N8N_STATUS="✅ OK"
        N8N_DETAIL="接続成功 (${WORKFLOW_COUNT}個のワークフローを確認)"
        echo -e "${GREEN}✅ n8n: 接続成功 (${WORKFLOW_COUNT}個のワークフロー)${NC}"
    elif [[ "$N8N_HTTP_CODE" == "401" ]]; then
        N8N_STATUS="⚠️ WARN"
        N8N_DETAIL="認証エラー (APIキーの確認が必要)"
        echo -e "${YELLOW}⚠️ n8n: 認証エラー (APIキーの確認が必要)${NC}"
        ((WARNING_COUNT++))
    else
        N8N_STATUS="⚠️ WARN"
        N8N_DETAIL="接続エラー (HTTP ${N8N_HTTP_CODE})"
        echo -e "${YELLOW}⚠️ n8n: 接続エラー (HTTP ${N8N_HTTP_CODE})${NC}"
        ((WARNING_COUNT++))
    fi
else
    N8N_STATUS="⚠️ SKIP"
    N8N_DETAIL="N8N_API_KEY未設定"
    echo -e "${YELLOW}⚠️ n8n: スキップ（N8N_API_KEY未設定）${NC}"
    ((WARNING_COUNT++))
fi
echo ""

# ========================================
# 5. GitHub リポジトリ確認
# ========================================
echo "🔍 5. GitHub リポジトリ確認..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    LATEST_COMMIT=$(git log -1 --pretty=format:"%h - %an, %ar : %s" 2>/dev/null || echo "不明")
    GITHUB_STATUS="✅ OK"
    GITHUB_DETAIL="最新コミット: ${LATEST_COMMIT}"
    echo -e "${GREEN}✅ GitHub: ${LATEST_COMMIT}${NC}"
else
    GITHUB_STATUS="❌ ERROR"
    GITHUB_DETAIL="Gitリポジトリが見つかりません"
    echo -e "${RED}❌ GitHub: Gitリポジトリが見つかりません${NC}"
    ((ERROR_COUNT++))
fi
echo ""

# ========================================
# レポート生成
# ========================================
echo "📝 レポート生成中..."

cat > "$LOG_FILE" << EOF
# Cursorvers 日次システム点検レポート - ${CHECK_DATE}

**実行日時:** ${CHECK_TIME_JST}  
**実行者:** Manus AI Agent  
**点検バージョン:** v4.0 (改善版)

---

## 📊 点検結果サマリー

| コンポーネント | 状態 | 詳細 |
|--------------|------|------|
| LINE Bot | ${LINE_BOT_STATUS} | ${LINE_BOT_DETAIL} |
| Discord Webhook | ${DISCORD_STATUS} | ${DISCORD_DETAIL} |
| Supabase | ${SUPABASE_STATUS} | ${SUPABASE_DETAIL} |
| n8n Workflow | ${N8N_STATUS} | ${N8N_DETAIL} |
| GitHub | ${GITHUB_STATUS} | ${GITHUB_DETAIL} |

**エラー数:** ${ERROR_COUNT}  
**警告数:** ${WARNING_COUNT}

---

## 🔍 詳細点検結果

### 1. LINE Bot (Supabase Edge Functions)
- **状態:** ${LINE_BOT_STATUS}
- **詳細:** ${LINE_BOT_DETAIL}
- **エンドポイント:** \`${SUPABASE_URL}/functions/v1/line-webhook\`

### 2. Discord Webhook
- **状態:** ${DISCORD_STATUS}
- **詳細:** ${DISCORD_DETAIL}
- **設定:** $([ "$DISCORD_ENABLED" == true ] && echo "有効" || echo "無効")

### 3. Supabase Edge Functions
- **状態:** ${SUPABASE_STATUS}
- **詳細:** ${SUPABASE_DETAIL}
- **プロジェクトID:** \`${SUPABASE_PROJECT_ID}\`

### 4. n8n Workflow
- **状態:** ${N8N_STATUS}
- **詳細:** ${N8N_DETAIL}
- **インスタンスURL:** \`${N8N_API_URL}\`

### 5. GitHub リポジトリ
- **状態:** ${GITHUB_STATUS}
- **詳細:** ${GITHUB_DETAIL}

---

## 🔧 推奨アクション

EOF

# 推奨アクションの追加
if [[ $ERROR_COUNT -gt 0 ]] || [[ $WARNING_COUNT -gt 0 ]]; then
    cat >> "$LOG_FILE" << EOF
以下の問題が検出されました:

EOF
    
    if [[ "$DISCORD_STATUS" == "⚠️ SKIP" ]]; then
        cat >> "$LOG_FILE" << EOF
- **Discord Webhook未設定**: 環境変数 \`DISCORD_WEBHOOK_URL\` または \`DISCORD_ADMIN_WEBHOOK_URL\` を設定してください
EOF
    fi
    
    if [[ "$N8N_STATUS" == "⚠️ SKIP" ]]; then
        cat >> "$LOG_FILE" << EOF
- **n8n API未設定**: 環境変数 \`N8N_API_KEY\` を設定してください
EOF
    fi
    
    if [[ "$N8N_STATUS" == "⚠️ WARN" ]] && [[ "$N8N_DETAIL" == *"認証エラー"* ]]; then
        cat >> "$LOG_FILE" << EOF
- **n8n認証エラー**: n8n管理画面でAPIキーを再生成し、GitHub Secretsを更新してください
EOF
    fi
else
    cat >> "$LOG_FILE" << EOF
全てのコンポーネントが正常に稼働しています。推奨アクションはありません。
EOF
fi

cat >> "$LOG_FILE" << EOF

---

## 📚 参考ドキュメント

- [必須Secrets設定ガイド](../REQUIRED_SECRETS.md)
- [監査設定](../../config/audit-config.yaml)
- [リカバリー手順](../runbook/failure-recovery.md)

---

*このレポートは自動生成されました - Cursorvers 自動点検スクリプト v4.0*
EOF

echo -e "${GREEN}✅ レポート生成完了: ${LOG_FILE}${NC}"
echo ""

# ========================================
# Discord通知送信
# ========================================
if [[ "$DISCORD_ENABLED" == true ]]; then
    echo "📤 Discord通知送信中..."
    
    # ステータス絵文字の決定
    if [[ $ERROR_COUNT -gt 0 ]]; then
        STATUS_EMOJI="🚨"
        STATUS_TEXT="エラー検出"
    elif [[ $WARNING_COUNT -gt 0 ]]; then
        STATUS_EMOJI="⚠️"
        STATUS_TEXT="警告あり"
    else
        STATUS_EMOJI="✅"
        STATUS_TEXT="全て正常"
    fi
    
    DISCORD_MESSAGE=$(cat << EOFMSG
{
  "content": "${STATUS_EMOJI} **Cursorvers 日次システム点検レポート**\n\n**日時:** ${CHECK_TIME_JST}\n**ステータス:** ${STATUS_TEXT}\n\n**点検結果:**\n${LINE_BOT_STATUS} LINE Bot\n${DISCORD_STATUS} Discord Webhook\n${SUPABASE_STATUS} Supabase\n${N8N_STATUS} n8n Workflow\n${GITHUB_STATUS} GitHub\n\n**エラー:** ${ERROR_COUNT}件 | **警告:** ${WARNING_COUNT}件\n\n詳細: \`${LOG_FILE}\`"
}
EOFMSG
)
    
    curl -s -X POST "${DISCORD_WEBHOOK_URL}" \
        -H "Content-Type: application/json" \
        -d "$DISCORD_MESSAGE" > /dev/null
    
    echo -e "${GREEN}✅ Discord通知送信完了${NC}"
fi

# ========================================
# 終了処理
# ========================================
echo ""
echo "=========================================="
echo "点検完了"
echo "エラー: ${ERROR_COUNT}件 | 警告: ${WARNING_COUNT}件"
echo "=========================================="

# エラーがある場合は終了コード1を返す
if [[ $ERROR_COUNT -gt 0 ]]; then
    exit 1
else
    exit 0
fi
