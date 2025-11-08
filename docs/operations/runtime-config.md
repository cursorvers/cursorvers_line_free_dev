# Runtime Configuration Registry

LINE 自動化で利用する主要な GitHub Variables / Secrets を一覧化します。  
`config/workflows/runtime-parameters.json` をソース・オブ・トゥルースとし、下表は同ファイルの内容を反映しています。

| ID | 種別 | 必須 | 保存場所 | オーナー | 既定値 | 説明 |
| --- | --- | --- | --- | --- | --- | --- |
| MANUS_ENABLED | boolean | ✅ | variable | ops | true | Manus 連携を有効化するフラグ。false で Supabase/Sheets のみで処理。 |
| DEVELOPMENT_MODE | boolean | ✅ | variable | ops | false | 開発用の分岐（PlanDelta、dry-run返信など）を許可。 |
| DEGRADED_MODE | boolean | ❌ | variable | ops | false | 強制的に縮退プランを選択する際に true。 |
| MANUS_BASE_URL | string | ✅ | variable | devops | — | Manus API のベース URL。 |
| MANUS_LINE_CONFIG_PATH | string | ❌ | variable | devops | /v1/config/line | Manus から LINE 設定を取得するエンドポイントパス。 |
| SUPABASE_URL | string | ✅ | variable | devops | — | Supabase REST エンドポイント。 |
| SUPABASE_SERVICE_ROLE_KEY | string | ✅ | secret | devops | — | Supabase Service Role Key（書き込み権限）。 |
| GOOGLE_SERVICE_ACCOUNT_JSON | string | ✅ | secret | ops | — | Google Sheets 更新用サービスアカウント JSON。 |
| GOOGLE_SHEET_ID | string | ✅ | variable | ops | — | 顧客台帳用 Google Sheets のシート ID。 |
| MANUS_API_KEY | string | ✅ | secret | ops | — | Manus タスク作成用 API キー。 |
| NOTIFY_WEBHOOK_URL | string | ❌ | secret | ops | — | 通常時の通知 Webhook。 |
| PROGRESS_WEBHOOK_URL | string | ❌ | secret | ops | — | フォールバック通知 Webhook。 |
| GEMINI_API_KEY | string | ✅ | secret | devops | — | Gemini ログ要約で使用する API キー。 |
| GEMINI_COST_PER_CALL | number | ❌ | variable | ops | 0 | Gemini 呼び出しのコスト換算値（レポート用）。 |
| LINE_CHANNEL_ACCESS_TOKEN | string | ✅ | secret | ops | — | LINE Reply API で使用するチャネルアクセストークン。 |
| LINE_CASE_STUDIES_URL | string | ❌ | variable | ops | https://example.com/case-studies | 開発事例ランディングページ。 |
| LINE_GUIDE_URL | string | ❌ | variable | ops | https://example.com/guide | ノウハウ資料／ガイドコンテンツ。 |
| LINE_GIFT_URL | string | ❌ | variable | ops | https://example.com/gift | LINE限定プレゼント受け取りページ。 |
| LINE_PREMIUM_URL | string | ❌ | variable | ops | https://example.com/premium | プレミアム/導入支援メニューのLP。 |
| LINE_MAX_BROADCASTS_PER_MONTH | number | ❌ | variable | ops | 3 | ユーザーごとの月間ブロードキャスト上限。 |
| LINE_PROMO_COOLDOWN_DAYS | number | ❌ | variable | ops | 30 | プロモーション送付のクールダウン日数。 |
| LINE_PROMO_TEMPLATES | string | ❌ | variable | ops | scenario_cmd_gift | プロモーション扱いとなるテンプレートID（カンマ区切り）。 |

## 確認コマンド

```bash
npm run runtime:verify

# Secrets/Variables 実値で検証
RUNTIME_CONFIG_VALUES=env npm run runtime:verify
```

- GitHub Actions では `.github/actions/check-runtime-config` から呼び出し、Step Summary に結果が出力されます。
- ローカルで検証する場合は `--values path/to/overrides.json` を指定すると、JSON に記載された値を優先してチェックできます。

## 運用メモ

- 値の更新は必ず GitHub Variables/Secrets に対して行い、Pull Request で差分を共有してください。
- 未設定の必須フラグがある場合、`line-event.yml` / `manus-progress.yml` などのワークフローはプロローグ段階で失敗します。
- 新しいパラメータを追加する際は `runtime-parameters.json` と本ドキュメントを同時に更新し、検証コマンドが通ることを確認してください。
