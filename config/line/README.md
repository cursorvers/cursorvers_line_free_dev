# LINE Official Account 設定

LINE Official Account Manager の設定をバージョン管理するためのディレクトリです。

## ファイル一覧

| ファイル | 説明 |
|---------|------|
| `welcome-message.json` | あいさつメッセージ設定 |

## 設定の取得方法

### 方法1: 手動取得

1. [LINE Official Account Manager](https://manager.line.biz/account/@529ybhfo) にログイン
2. 応答設定 > あいさつメッセージ を開く
3. メッセージ内容を `welcome-message.json` に転記
4. `_lastUpdated` と `_updatedBy` を更新してコミット

### 方法2: Manus API 経由

```bash
# Manus タスクを作成して設定を取得
curl -X POST "https://api.manus.ai/v1/tasks" \
  -H "Content-Type: application/json" \
  -H "API_KEY: $MANUS_API_KEY" \
  -d '{
    "prompt": "LINE Official Account Manager (https://manager.line.biz/account/@529ybhfo/autoresponse/welcome) にログインし、あいさつメッセージの設定内容をJSON形式で取得してください。",
    "agentProfile": "manus-1.6",
    "taskMode": "agent",
    "locale": "ja"
  }'
```

## 設定変更時の注意

- LINE Manager での変更後は、このファイルも必ず更新してください
- 変更履歴はGitコミットログで管理されます
- 本番反映前にPRでレビューを受けることを推奨します
