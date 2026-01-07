# セッション状態 - n8n Gmail → Discord 転送設定

日時: 2026-01-04 23:59
状態: **完了 ✅**

---

## 最終構成（並列構成）

```
                    ┌──→ [Discord Notification] 🚨 即時通知（確実）
[Gmail Trigger] ────┤
                    └──→ [AI Classification] → [Add Label]
                              │
                              ├── OpenAI (gpt-4.1-mini)
                              └── Get Labels (Gmail)
```

### ワークフロー情報
- **ワークフロー名**: `M-ISAC Email → Discord + AI分類`
- **ワークフローID**: `2ipDrit2fLO0fD4k`
- **ノード数**: 6
- **状態**: active

### フィルター設定
- **トリガー条件**: `isac_news@m-isac.jp` からの未読メール
- **ポーリング間隔**: 毎分

### 動作確認結果
- ✅ Discord通知: 正常動作（複数のテストメールで確認）
- ✅ 並列実行: Discord通知とAI分類が並列で実行
- ✅ 障害耐性: AI分類が失敗してもDiscord通知は確実に届く

---

## 完了した作業

1. **Gmail API 有効化** ✅
2. **OAuth クライアント設定** ✅
3. **n8n ワークフロー設定** ✅
   - 直列構成 → 並列構成に変更
   - Discord通知の確実性を担保
4. **動作確認テスト** ✅
   - curl直接テスト: 成功
   - n8n経由テスト: 成功

---

## 解決した問題

**問題**: n8n で実行すると成功表示だが、Discord に通知が届かない

**原因**: 直列構成で Email Classification Agent (OpenAI) を経由していたため、AI処理のエラーで通知が届かなかった

**解決策**: 並列構成に変更
- Discord通知は Gmail Trigger から直接接続（100%確実）
- AI分類は並列パスで実行（失敗しても通知に影響なし）

---

## n8n API キー

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjM3M2RlMC0wOWE2LTQ0NGQtOTJjYi0wMzM3YTcxZDQxMDUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY1Njg3OTQ5fQ.Kbngoty-XaFnG40qtzGngJmSQJOP-X_jhGdXRv3XHBU
```

---

## 運用コマンド

```bash
# ワークフロー状態確認
curl -s --header "X-N8N-API-KEY: <API_KEY>" \
  "https://n8n.srv995974.hstgr.cloud/api/v1/workflows/2ipDrit2fLO0fD4k" | jq '{name: .name, active: .active}'

# 実行履歴確認
curl -s --header "X-N8N-API-KEY: <API_KEY>" \
  "https://n8n.srv995974.hstgr.cloud/api/v1/executions?workflowId=2ipDrit2fLO0fD4k&limit=5" | jq '.data[] | {id: .id, status: .status, startedAt: .startedAt}'

# Discord Webhook テスト
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"M-ISAC Alert","content":"🚨 テスト通知"}' \
  "https://discord.com/api/webhooks/1457311304162476115/XXvNOy7xuLNAdWcGJ4LHTggVFyy7vdg24f9eMK6pEV8XI-A5dYZBFFK791ib_9OmtqY0"
```

---

作成: Claude Code
完了: 2026-01-04 23:59
