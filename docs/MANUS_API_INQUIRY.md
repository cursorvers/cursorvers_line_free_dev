# Manus API連携 - 問い合わせ情報

## 件名
Manus API連携用の接続情報について

---

## 1. APIエンドポイント

### 現在の実装状況

コードベース内で以下の不一致が確認されています：

- **実装コード**: `https://api.manus.ai` (デフォルト値)
  - ファイル: `scripts/lib/manus-api.js`
  - 実際のログでも使用されている

- **ドキュメント**: `https://api.manus.im` (多くのドキュメントで記載)
  - 設定ファイル: `.cursor/manus-config.json`
  - 複数のドキュメントで記載

### 確認事項

1. **本番環境の正しいBase URL**
   - `https://api.manus.ai` と `https://api.manus.im` のどちらが正しいか
   - Sandbox/Beta環境があればそのURLも

2. **リージョン/環境の違い**
   - 利用可能なリージョンや環境（sandbox / production）
   - 環境ごとのURLの違い

---

## 2. 認証情報

### 現在の実装

```javascript
// ヘッダー形式
{
  "API_KEY": "${MANUS_API_KEY}",
  "Content-Type": "application/json",
  "User-Agent": "cursorvers-line-free-dev/1.0.0"
}
```

**重要**: `Authorization: Bearer`ではなく、`API_KEY`ヘッダーを使用しています。

### 確認事項

1. **API Key形式**
   - 現在のAPIキー形式: `sk-tF3nImDcsAP5McOSmpNvXIjR92PZWkhNmAvqKBD1rNqAajItOKlIUa1d6pbWhHcLG_bJbqFhOWtQcEJEY5PSB1jN_aRY`
   - この形式が正しいか、または別の形式が必要か

2. **Service Account単位の認証**
   - Service Account単位でAPIキーを発行する場合、対象SA名の指定が必要か

3. **追加ヘッダー**
   - 組織IDやその他の追加ヘッダーが必要か

4. **認証方式の変更予定**
   - `API_KEY`ヘッダーから`Authorization: Bearer`への移行予定があるか

---

## 3. コールバック / Webhook設定

### 現在の実装

```javascript
// リクエストボディ
{
  "prompt": "...",
  "webhook_url": "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/relay"
}
```

### 確認事項

1. **Webhook URLの設定**
   - ManusからGitHub Actionsまたはその他システムへ返す際の設定要否
   - Webhook URLの形式や要件

2. **シークレットキー・署名方式**
   - Webhookの署名検証が必要か
   - 署名方式（HMAC-SHA256等）とシークレットキーの設定方法

3. **コールバック形式**
   - ProgressEventの形式とフィールド
   - エラー時のコールバック形式

---

## 4. APIエンドポイント詳細

### 現在使用しているエンドポイント

1. **タスク作成**
   ```
   POST /v1/tasks
   ```

2. **タスク取得**
   ```
   GET /v1/tasks/{taskId}
   ```

3. **タスクキャンセル**
   ```
   DELETE /v1/tasks/{taskId}
   ```

### 確認事項

1. **APIバージョン**
   - `/v1/`が正しいバージョンか
   - 他に利用可能なバージョンがあるか

2. **追加エンドポイント**
   - タスク一覧取得、ステータス確認などの追加エンドポイントがあるか

3. **エンドポイントの変更予定**
   - 近い将来のAPI変更予定があるか

---

## 5. 制限事項

### 確認事項

1. **Rate Limit**
   - リクエスト頻度の制限（例: 100リクエスト/分）
   - レート制限超過時のエラーレスポンス形式

2. **使用上の注意点**
   - トークン有効期限
   - PINやその他の認証要件
   - 同時実行数の制限

3. **リクエストサイズ制限**
   - リクエストボディの最大サイズ
   - `prompt`フィールドの最大文字数

---

## 6. リクエスト/レスポンス形式

### 現在の実装

```javascript
// リクエスト
POST /v1/tasks
{
  "prompt": "【MANUS_EXECUTION_BRIEF】\n\n...\n\nPlan JSON:\n{...}",
  "webhook_url": "https://..."
}

// レスポンス（成功時）
{
  "task_id": "task-123456",
  "status": "created",
  "created_at": "2025-11-01T12:34:56Z"
}
```

### 確認事項

1. **リクエスト形式**
   - `prompt`フィールドの形式が正しいか
   - `brief`と`plan`を分離する形式への変更予定があるか

2. **レスポンス形式**
   - 成功時のレスポンスフィールド
   - エラー時のレスポンス形式
   - タスクURL（`https://manus.im/app/{taskId}`）の取得方法

---

## 7. ドキュメント

### 確認事項

1. **APIリファレンス**
   - 公式APIドキュメントのURL
   - 最新版のドキュメントの場所

2. **サポート窓口**
   - 緊急時連絡先
   - 技術サポートの連絡方法
   - コミュニティフォーラムやSlack等の有無

3. **変更履歴**
   - APIの変更履歴やChangelogの場所
   - 破壊的変更の通知方法

---

## 8. 現在の設定値（参考）

### GitHub Variables（設定予定）

- `MANUS_BASE_URL`: `https://api.manus.im` または `https://api.manus.ai`（要確認）
- `MANUS_ENABLED`: `true` / `false`
- `DEVELOPMENT_MODE`: `true` / `false`

### GitHub Secrets（設定予定）

- `MANUS_API_KEY`: （要取得）
- `PROGRESS_WEBHOOK_URL`: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/relay`

---

## 9. 実装ファイル（参考）

- `scripts/lib/manus-api.js`: Manus API呼び出し実装
- `scripts/manus-api.js`: CLIツール
- `.cursor/manus-config.json`: 設定ファイル（ローカル）
- `docs/MANUS_API_JSON_FORMAT.md`: JSON形式の詳細
- `docs/MANUS_API.md`: 連動ガイド

---

## 10. 問い合わせ後の対応

回答を受け取ったら、以下を実施：

1. **設定値の更新**
   - `scripts/lib/manus-api.js`のデフォルトURL修正
   - ドキュメントの統一
   - GitHub Variables/Secretsの設定

2. **検証**
   - `npm run runtime:verify`で設定確認
   - 実際のAPI呼び出しテスト

3. **ドキュメント更新**
   - 正しい情報でドキュメントを更新
   - Runbookへの反映

---

## 連絡先

この情報をManus API担当者またはサポート窓口へ送付してください。

