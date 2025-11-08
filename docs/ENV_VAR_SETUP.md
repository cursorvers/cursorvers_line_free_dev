# 環境変数・GitHub Secrets/Variables 設定ガイド

Cursorvers LINE Funnel を運用する際に必要な環境変数・GitHub Secrets・リポジトリ Variables をまとめています。開発段階と本番段階で値を切り替え、コンフィギュレーションを確実に管理してください。

---

## 1. ローカル `.env` の設定

ローカルでスクリプトやテストを実行する場合は `.env` に API キー等を格納します。`.env` は `.gitignore` 済みです。

```bash
cat <<'ENV' > .env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5
DEVELOPMENT_MODE=true
ENV
```

`.env` を読み込むシェルを利用している場合は `source .env` を忘れずに。実行中スクリプトに反映されないときは新しいターミナルを開くか再実行してください。

確認コマンド:

```bash
grep -E 'OPENAI_|DEVELOPMENT_MODE' .env
```

---

## 2. GitHub Secrets

GitHub Actions から参照するシークレット一覧です。CLI 例は `gh secret set` を利用しています。

| Secret | 用途 | セット方法例 |
|---|---|---|
| `MANUS_API_KEY` | Manus API 認証キー | `gh secret set MANUS_API_KEY --body "sk-manus-..."` |
| `PROGRESS_WEBHOOK_URL` | Manus → Front Door Webhook URL | `gh secret set PROGRESS_WEBHOOK_URL --body "https://example.com/relay"` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー | `gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$(cat service-role.key)"` |
| `SUPABASE_URL` | Supabase プロジェクトURL (必要に応じて) | `gh secret set SUPABASE_URL --body "https://xyz.supabase.co"` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sheets 連携用 Service Account JSON | `gh secret set GOOGLE_SERVICE_ACCOUNT_JSON --body "$(cat sa.json)"` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging APIの返信用アクセストークン | `gh secret set LINE_CHANNEL_ACCESS_TOKEN --body "XXXXXXXX"` |

Secrets が設定済みかは次のコマンドで確認できます（値は表示されません）：

```bash
gh secret list
```

---

## 3. GitHub Repository Variables（Feature Flags 含む）

リポジトリ変数は GitHub Actions の `vars.*` で参照され、挙動を切り替えます。以下は開発モードの推奨値です。

```bash
gh variable set DEVELOPMENT_MODE --body "true"
gh variable set MANUS_ENABLED --body "true"
gh variable set MANUS_BASE_URL --body "https://api.manus.ai"
gh variable set DEGRADED_MODE --body "false"
gh variable set SUPABASE_URL --body "https://xyz.supabase.co"
gh variable set LINE_CASE_STUDIES_URL --body "https://example.com/case-studies"
gh variable set LINE_GUIDE_URL --body "https://example.com/guide"
gh variable set LINE_GIFT_URL --body "https://example.com/gift"
gh variable set LINE_PREMIUM_URL --body "https://example.com/premium"
gh variable set MANUS_LINE_CONFIG_PATH --body "/v1/config/line"
gh variable set LINE_MAX_BROADCASTS_PER_MONTH --body "3"
gh variable set LINE_PROMO_COOLDOWN_DAYS --body "30"
gh variable set LINE_PROMO_TEMPLATES --body "scenario_cmd_gift"
```

本番運用に切り替える際は `DEVELOPMENT_MODE=false`、`MANUS_ENABLED=false` に変更してください。変数一覧は `gh variable list` で確認できます。

---

## 4. Supabase Edge / Functions Secrets

Front Door (Supabase Edge Function) では次のシークレットを利用します。

| Secret | 用途 | 設定例 |
|---|---|---|
| `HASH_SALT` | LINEユーザーIDハッシュ用ソルト | `supabase secrets set HASH_SALT="random-string" --project-ref <ref>` |
| `FEATURE_BOT_ENABLED` | Kill-Switch（falseで即停止） | `supabase secrets set FEATURE_BOT_ENABLED=true --project-ref <ref>` |

確認は `supabase secrets list --project-ref <ref>` で行えます。

---

## 5. Secrets & Environment Verification

環境設定を確認するためのスクリプトが用意されています：

```bash
# Secretsと環境変数の確認
./scripts/verify-secrets.sh

# Runtimeパラメータ検証（registryベース）
npm run runtime:verify

# 実際のSecrets/Variablesを検証したい場合
RUNTIME_CONFIG_VALUES=env npm run runtime:verify

# フィーチャーフラグの動作確認（両モード）
npm run test:feature-flags
```

このスクリプトは以下をチェックします：
- ✅ CLIツール（gh CLI、Node.js、npm、Supabase CLI）
- ✅ GitHub Secrets（MANUS_API_KEY、PROGRESS_WEBHOOK_URL、SUPABASE_SERVICE_ROLE_KEY等）
- ✅ GitHub Variables（DEVELOPMENT_MODE、MANUS_ENABLED等）
- ✅ ローカル環境変数（.envファイル）
- ✅ 必須ファイルの存在

### 使用方法

```bash
# 基本的な確認
./scripts/verify-secrets.sh

# CI/CDでの実行
# .github/workflows/verify-secrets.yml から呼び出されます
```

### エラー時の対処

スクリプトがエラーを報告した場合：

1. **未設定のGitHub Secretsを設定**
   ```bash
   gh secret set <SECRET_NAME> --body "<value>"
   ```

2. **未設定のGitHub Variablesを設定**
   ```bash
   gh variable set <VARIABLE_NAME> --body "<value>"
   ```

3. **ローカル開発時は.envファイルを作成**
   ```bash
   cp .env.example .env  # もし存在する場合
   # .env を編集して必要な環境変数を設定
   ```

詳細は `scripts/verify-secrets.sh` のソースコードを参照してください。

---

## 6. Feature Flag チェックリスト

| Flag | 設定場所 | 説明 | 開発既定値 | 本番既定値 |
|---|---|---|---|---|
| `vars.DEVELOPMENT_MODE` | GitHub Variables | PlanDelta生成・Manus dispatch の可否 | true | false |
| `vars.MANUS_ENABLED` | GitHub Variables | Manus連携の有効/無効 | true | false |
| `vars.MANUS_BASE_URL` | GitHub Variables | Manus APIエンドポイント | https://api.manus.ai | https://api.manus.ai |
| `vars.DEGRADED_MODE` | GitHub Variables | 強制デグレードモード切替 | false | false |
| `FEATURE_BOT_ENABLED` | Supabase Secrets | Edge Relay Kill-Switch | true | true |

最新のトレーサビリティ表とテストカバレッジは `.sdd/specs/line-funnel/traceability.md` を参照してください。

---

## 6. OpenAI / Miyabi スクリプト向け設定例

ローカルで Miyabi CLI を使う場合の例です。

```bash
export OPENAI_API_KEY="sk-proj-..."
export OPENAI_MODEL="gpt-5"
./scripts/miyabi-chat.sh
```

環境変数が有効かは `echo $OPENAI_API_KEY` 等で確認できます。

---

## 7. トラブルシューティング

| 症状 | チェック項目 | 解決策 |
|---|---|---|
| Manus API ステップがスキップされる | `vars.DEVELOPMENT_MODE`, `vars.MANUS_ENABLED` | 必要に応じて `gh variable set ...` で再設定 |
| Supabase への書き込みが失敗 | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | Secrets/Variables のタイポを確認。`scripts/diagnose-manus-stack.sh` でもチェック可 |
| Edge Relay が 403 を返す | `FEATURE_BOT_ENABLED`, `HASH_SALT` | Supabase secrets を再確認し、必要なら再デプロイ |
