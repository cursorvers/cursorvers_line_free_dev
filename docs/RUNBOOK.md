# RUNBOOK - LINE友だち登録システム運用手順書

## 1. 緊急停止（Kill-Switch）

### 即座に停止する方法

```bash
# Supabase Edge Functionの環境変数を設定
supabase secrets set FEATURE_BOT_ENABLED=false --project-ref <your-project-ref>

# または、LINE Developers ConsoleでWebhookをOFF
```

### 確認

```bash
# Front Doorにリクエストを送信
curl https://<your-domain>/functions/v1/relay

# 503 "Bot is disabled" が返ればOK
```

---

## 2. 復旧手順

### 2-1. Front Door疎通確認

```bash
# 署名なしでテスト（開発環境のみ）
curl -X POST https://<your-domain>/functions/v1/relay \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# 200 OKが返ればFront Doorは正常
```

### 2-2. GitHub Actions疎通確認

```bash
# 手動でワークフローをトリガー
gh workflow run manus-progress.yml

# 実行状況を確認
gh run list --workflow=manus-progress.yml
```

### 2-3. GPT疎通確認

```bash
# GitHub Secretsを確認
gh secret list

# LLM_ENDPOINT, LLM_API_KEYが設定されているか確認
```

### 2-4. Manus疎通確認

```bash
# Manus APIにリクエスト
curl -X POST https://api.manus.im/v1/tasks \
  -H "Authorization: Bearer $MANUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello"}'
```

### 2-5. 本番復旧

```bash
# FEATURE_BOT_ENABLEDをtrueに戻す
supabase secrets set FEATURE_BOT_ENABLED=true --project-ref <your-project-ref>

# LINE Developers ConsoleでWebhookをON
```

---

## 3. ロールバック手順

### 3-1. 未マージPRのクローズ

```bash
# PRをクローズ
gh pr close <PR番号>

# ブランチを削除
git push origin --delete <ブランチ名>
```

### 3-2. Secrets回収

```bash
# 未使用のSecretsを削除
gh secret delete <SECRET_NAME>

# 監査ログに記録
echo "$(date): Deleted secret <SECRET_NAME>" >> logs/audit.log
git add logs/audit.log
git commit -m "audit: delete unused secret"
git push
```

### 3-3. Front DoorのURL切替

```bash
# DNSを旧URLに戻す
# または、LINE Developers ConsoleでWebhook URLを変更
```

### 3-4. Manusタスクのキャンセル

```bash
# 保留中のタスクを確認
# TODO: Manus APIでタスク一覧を取得

# タスクをキャンセル
# TODO: Manus APIでタスクをキャンセル
```

---

## 4. 監視

### 4-1. 外形監視

- **Front Doorの200率**: UptimeRobotで5分間隔
- **目標**: 99.9% uptime

### 4-2. SLO監視

| 指標 | 目標値 | 確認方法 |
|-----|-------|---------|
| delivery latency (p50) | < 2s | logs/progress/*.json |
| delivery latency (p95) | < 10s | logs/progress/*.json |
| error_rate (5分移動窓) | < 1% | logs/progress/*.json |
| heartbeat_miss | < 2/10min | GitHub Actions logs |

### 4-3. コスト監視

```bash
# 1日のManus使用量を確認
python orchestration/cost.py orchestration/plan/current_plan.json

# 予算超過の場合はデグレード
```

---

## 5. メッセージ配信ポリシー

- **頻度制限**: 同一ユーザー宛の自動配信は 1 日 1 通、週次最大 3 通まで。`line-event.yml` の `dedupe_key`／`retry_after_seconds` および PlanDelta 判定で超過を防止する。
- **例外運用**: イベント告知など緊急性の高い配信は Ops Lead の承認を経て実施し、`logs/progress/` にメモを残す。
- **セグメント**: 初期リリースは全ユーザー一律。`cta_tags` を基にした手動セグメントから検証し、エンゲージメント指標による自動セグメントは後続フェーズで段階導入。
- **レビュー**: Product/Ops が月次で KPI レポートを確認し、必要に応じて上限値やセグメント方針を更新する。更新内容は `.sdd/specs/line-funnel/decisions.md` と本 Runbook に反映する。

---

## 6. Google Sheets 台帳管理

- **用途**: Supabase 完全移行までの暫定 CRM。`scripts/sheets/upsert-line-member.js` が `line-event.yml` から呼ばれ、`user_hash` をキーに upsert。
- **保持期間**: 移行完了までアクティブデータは保持。Supabase へ移行後は 6 か月でアーカイブ削除。過去データは Supabase 側で永続化する。
- **アクセス権限**: 編集は Tech Lead / Ops Lead のみ。閲覧は Marketing チームと Product Lead に限定。Google Workspace Admin で監査ログを有効化。
- **監査と照合**: 月次で `node scripts/reconcile-ledgers.js` を実行し、Supabase と Sheets の差分レポートを取得。重大な差分は Slack `#line-ops` に報告し、結果を `logs/progress/` もしくは KPI レポートに添付する（一時的に CLI が使えない場合は手動クロスチェック）。

---

## 7. ログローテーション

- **自動化**: `scripts/rotate-logs.sh` が 90 日超過の `logs/progress/*.json` を gzip 圧縮して `logs/progress/archive/YYYY-MM/` に移動し、1 年超過分を削除。
- **スケジュール**: `.github/workflows/rotate-logs.yml` が毎週月曜 03:00 JST に実行。手動実行は GitHub の `workflow_dispatch` またはローカルで `bash scripts/rotate-logs.sh`。
- **リポジトリ監視**: スクリプト内で `git count-objects -vH` を利用し、100MB 超で警告、200MB 超で強制アーカイブを実施。Actions 実行時のみ自動コミットを行う。
- **運用メモ**: アーカイブされた gzip は Git LFS を使わずそのまま保持。四半期ごとに保持期間の妥当性を見直し、必要なら閾値を更新。

---

## 8. 予算管理

### 8-1. 予算設定

- **BUDGET_DAY**: 50pt/day
- **BUDGET_WEEK**: 200pt/week

### 8-2. 自動デグレードと縮退運用

- `economic-circuit-breaker.yml` が `BUDGET.yml` の閾値を監視し、閾値超過時に `MANUS_ENABLED=false` と `orchestration/plan/production/degraded.flag` を設定して縮退モードへ移行。
- 縮退中は Manus API 呼び出しを停止し、`line-event.yml` が `docs/alerts/line_degraded_outreach.ics` を通知に添付。Supabase と Google Sheets への書き込みは継続する。
- Ops Lead は通知後 24 時間以内に対象リードを手動フォローし、結果を `logs/progress/` に追記。Slack `#line-ops` で担当割り当てとフォロー完了を共有する。
- 手動対応時も医療ガードレール（個別診断を避け、緊急時は医療機関受診を案内）を必ず付与する。

### 8-3. 復旧手順

1. 予算消化が閾値内に戻ったことを Finance/Ops が確認。
2. `economic-circuit-breaker.yml` を手動実行し、`MANUS_ENABLED=true` に戻す。
3. `degraded.flag` を削除して通常プランへ復帰後、`line-event.yml` の GitHub Step Summary でモードが `normal` に戻ったことを確認。
4. ICS テンプレートやフォロー記録を見直し、`weekly-kpi-report.yml` で縮退期間中の件数を報告。

---

## 9. 連絡網

### 9-1. 管理者連絡先

- **LINE**: @529ybhfo
- **Gmail**: mo666.med@gmail.com

### 9-2. エスカレーション

| レベル | 対応者 | 連絡方法 |
|-------|-------|---------|
| L1: 軽微な障害 | 開発者 | GitHub Issues |
| L2: 中程度の障害 | 技術責任者 | LINE + Gmail |
| L3: 重大な障害 | 経営層 | 電話 |

### 9-3. 法務・税務窓口

- **法務顧問**: 月3万円／5万円枠
- **税務顧問**: 固定費設計に依拠

---

## 10. よくあるトラブルと対処法

### 10-1. Front Doorが503を返す

**原因**: FEATURE_BOT_ENABLED=false

**対処**: 
```bash
supabase secrets set FEATURE_BOT_ENABLED=true --project-ref <your-project-ref>
```

### 10-2. GitHub Actionsが動かない

**原因**: Secretsが未設定

**対処**:
```bash
gh secret list
# 不足しているSecretsを追加
gh secret set <SECRET_NAME> --body "<value>"
```

### 10-3. GPT解析が失敗する

**原因**: LLM_API_KEYが無効

**対処**:
```bash
# 新しいAPIキーを発行
gh secret set LLM_API_KEY --body "sk-..."
```

### 10-4. Manusポイントが足りない

**原因**: 予算超過

**対処**:
- `gh workflow run economic-circuit-breaker.yml` を実行し、`MANUS_ENABLED=false` と `orchestration/plan/production/degraded.flag` が生成されたことを確認する。
- `docs/alerts/line_degraded_outreach.ics` のテンプレートで通知を送り、Ops Lead が 24 時間以内に手動フォローを開始する。
- フォロー完了後、`logs/progress/` に結果を記録し、`weekly-kpi-report.yml` のレポートで縮退件数を共有する。

---

## 11. 定期メンテナンス

### 11-1. 週次

- [ ] `logs/progress/` の最新ログと `logs/progress/archive/` を確認
- [ ] SLO達成状況と GitHub Step Summary をレビュー
- [ ] Manusポイント消費量を確認 (`economic-circuit-breaker.yml` の履歴含む)
- [ ] `.github/workflows/rotate-logs.yml` の実行結果と自動コミットをチェック
- [ ] Slack `#line-ops` で手動フォロー案件の進捗を共有

### 11-2. 月次

- [ ] Secretsのローテーション
- [ ] Supabase Edge (Front Door) の証明書更新確認
- [ ] Supabase と Google Sheets の差分を照合（`node scripts/reconcile-ledgers.js` のレポートを添付）
- [ ] `.sdd/specs/line-funnel/decisions.md` / Runbook の内容を最新化

---

## 12. GitHub Actions メンテナンス

### 12-1. ベンダースクリプトの同期

```bash
# 変更がないか検証のみ
npm run vendor:verify

# Pinned commit から取得して manifest を更新
npm run vendor:sync

# 差分を確認し、必要なら PR を作成
git diff scripts/vendor/
```

### 12-2. Webhook ルーターの更新

- 正常系のラベル更新は `scripts/webhook-router.mjs` が担当。Issue / コメントごとにユースケースを追加する際は Node テストを先に書き、`npm run test:actions` で検証する。
- CLI での動作確認例: `node scripts/webhook-router.mjs issue opened 123`。
- 旧 `webhook-event-router.yml` は廃止済み。新しいハンドラー `webhook-handler.yml` のみがイベントルーティングを担う。

### 12-3. ログの Artifact 退避

- `.github/actions/persist-progress` が `line-event.yml` / `manus-progress.yml` から呼ばれ、push 失敗時に Artifact を作成する。
- Artifact 名は `progress-log-YYYYMMDDHHMMSS` 等で `tmp/log-artifacts/` 配下に展開される構成を保持。
- 取得手順: GitHub Actions の実行ページ → `Artifacts` → 対象をダウンロード → 展開したファイルを参照し、必要に応じて再コミットする。
- Artifact の保持期間は既定で 90 日。必要に応じて `retention-days` を変更可能。

### 12-4. 設定バリデーション

- `.github/actions/validate-config` が主要ワークフロー起動前に必須 Secrets/Vars を検証する。
- ルールは `config/workflows/required-secrets.json` で管理され、投入忘れがあると早期に失敗する。
- 緊急時は環境変数 `SKIP_CONFIG_VALIDATION=true` を指定して一時的にスキップ可能（恒久運用は禁止）。

### 12-5. 重要パラメータと健全性チェック

| Name | Scope | 用途 | チェックコマンド |
| --- | --- | --- | --- |
| `MANUS_ENABLED` | GitHub Variables | Manus API 連携の有効／無効を切り替えるフラグ | `./scripts/verify-secrets.sh` |
| `DEGRADED_MODE` | GitHub Variables | 縮退モードの有効化フラグ（Front Door との整合性必須） | `./scripts/verify-secrets.sh` |
| `GEMINI_COST_PER_CALL` | GitHub Variables | Gemini 要約ステップのコスト試算に利用 | `./scripts/verify-secrets.sh` |
| `MANUS_BASE_URL` | GitHub Variables | Manus エンドポイントのベース URL。開発／本番で切り替え | `./scripts/verify-secrets.sh` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Variables / Secrets | Supabase REST への書き込みに利用 | `npm run lint`（`validate-config` 経由） |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SHEET_ID` | Secrets | Google Sheets 台帳の更新に利用 | `npm run lint`（`validate-config` 経由） |

- GitHub CLI が利用できる場合は `./scripts/verify-secrets.sh` を実行すると Secrets/Variables の一覧と不足がその場で表示される。
- CI では `npm run lint`（`.github/actions/validate-config`）で同じ欠落を検出するため、手動変更時も PR 内で早期に気付ける。

### 12-6. 運用メトリクスの収集

- LINE/Gemini 連携の要約は `scripts/automation/run-gemini-log-summary.mjs` が `tmp/gemini/log-summary.json` と Artifact (`gemini-metrics`) に保存する。
- 週次レポートやコスト集計は `scripts/automation/report-gemini-metrics.mjs` で取得し、`docs/automation/GEMINI_POC_REPORT.md` へ反映する。
- ログコミット結果は `.github/actions/persist-progress` の Artifact 名（`line-event-*` / `manus-progress-*`）で追跡できる。SLO 監視には GitHub Actions の履歴と合わせて確認する。

### 12-7. Manus API問い合わせワークフロー（成功事例）

2025-11-06に`manus-api-inquiry.yml`ワークフローを実装・実行し、Manus APIへの接続確認を自動化しました。

**実装内容**:
- `scripts/manus/inquire-api.mjs`: 複数エンドポイント（`api.manus.ai` / `api.manus.im`）への接続テストスクリプト
- `.github/workflows/manus-api-inquiry.yml`: GitHub Actionsワークフロー定義
- Debug Secretsステップ: `MANUS_API_KEY`と`MANUS_BASE_URL`の設定状況を確認

**実行方法**:
```bash
# GitHub Actionsから実行
gh workflow run manus-api-inquiry.yml -f create_issue=true

# またはAPI経由でブランチ指定実行
gh api repos/mo666-med/cursorvers_line_free_dev/actions/workflows/manus-api-inquiry.yml/dispatches \
  -X POST --input - <<EOF
{
  "ref": "chore-run-tests-CcDmo",
  "inputs": {
    "create_issue": "true"
  }
}
EOF
```

**確認ポイント**:
1. Debug Secretsステップで`MANUS_API_KEY length`が0でないことを確認
2. `MANUS_BASE_URL`が正しく設定されていることを確認
3. Artifact `manus-api-inquiry-results`から結果ファイルを取得
4. 自動作成されたIssueで結果を確認

**実行結果（2025-11-06）**:
- ✅ 両エンドポイント（`api.manus.ai` / `api.manus.im`）で認証テストが成功（200 OK）
- ✅ `/v1/tasks`エンドポイントが正常に動作
- ⚠️ `/health`と`/v1`エンドポイントは404（存在しない）
- ✅ 正しいエンドポイントは`https://api.manus.ai/v1/tasks`または`https://api.manus.im/v1/tasks`

**注意事項**:
- GitHub Actionsワークフローファイルでは`x-owner`のようなカスタムフィールドは使用不可（検証エラーになる）
- 必要なメタ情報はコメントまたはドキュメント側で管理

**参考**:
- 実行例: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
- Issue例: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- Artifact: `manus-api-inquiry-results` (実行ごとに生成)

---

## 12-8. Runtimeレジストリ更新手順

Runtimeレジストリ（`config/workflows/runtime-parameters.json`）は、GitHub Actionsで使用するSecrets/Variablesの定義を管理します。

### レジストリの確認

```bash
# 現在の設定を確認
npm run runtime:verify

# 特定のレジストリファイルを指定
npm run runtime:verify -- --registry config/workflows/runtime-parameters.json
```

### 新しいパラメータの追加

1. **`config/workflows/runtime-parameters.json`を編集**
   ```json
   {
     "parameters": [
       {
         "id": "NEW_PARAMETER_NAME",
         "type": "string",
         "required": true,
         "location": "secret",  // または "variable"
         "owner": "ops",
         "description": "パラメータの説明"
       }
     ]
   }
   ```

2. **GitHub Secrets/Variablesに設定**
   ```bash
   # Secretの場合
   gh secret set NEW_PARAMETER_NAME --body "value"
   
   # Variableの場合
   gh variable set NEW_PARAMETER_NAME --body "value"
   ```

3. **設定を確認**
   ```bash
   npm run runtime:verify
   ```

### LINE関連パラメータの設定

**必須パラメータ**:
- `LINE_CHANNEL_ACCESS_TOKEN` (Secret) - LINE Messaging APIのチャネルアクセストークン

**オプションパラメータ**（Manus APIから自動取得可能）:
- `LINE_CASE_STUDIES_URL` (Variable) - 事例紹介ページのURL
- `LINE_GUIDE_URL` (Variable) - ガイドページのURL
- `LINE_GIFT_URL` (Variable) - プレゼントページのURL
- `LINE_PREMIUM_URL` (Variable) - プレミアム/導入支援ページのURL

**設定手順**:
1. Manus側の`/v1/config/line`エンドポイントにURLを登録
2. `line-event.yml`ワークフロー実行時に`scripts/manus/export-config.mjs`が自動取得
3. 取得したURLが`$GITHUB_ENV`に設定され、テンプレートビルド時に使用される

**手動設定**（Manus APIを使用しない場合）:
```bash
gh variable set LINE_CASE_STUDIES_URL --body "https://example.com/case-studies"
gh variable set LINE_GUIDE_URL --body "https://example.com/guide"
gh variable set LINE_GIFT_URL --body "https://example.com/gift"
gh variable set LINE_PREMIUM_URL --body "https://example.com/premium"
```

### レジストリの検証

```bash
# ローカル環境で検証（環境変数から読み込み）
npm run runtime:verify

# GitHub Actionsでの検証
# .github/actions/check-runtime-config を使用
```

---

## 12-9. LINE返信ログの取得方法

LINE返信の実行ログは複数の場所に記録されます。

### 1. GitHub Actions実行ログ

**取得方法**:
```bash
# 最新の実行を確認
gh run list --workflow=line-event.yml --limit 5

# 特定の実行のログを取得
gh run view <run-id> --log > line-event-log.txt

# 実行IDを指定してログを取得
gh run view <run-id> --log | grep -A 10 "Dispatch LINE replies"
```

**確認ポイント**:
- `Fetch Manus LINE Config`ステップ: Manus設定の取得状況
- `Build LINE Templates`ステップ: テンプレートビルドの成功/失敗
- `Evaluate orchestration spec constraints`ステップ: spec評価結果
- `Dispatch LINE replies`ステップ: 実際のLINE返信実行状況

### 2. Artifactからの取得

**取得方法**:
```bash
# 実行IDを指定してArtifactをダウンロード
gh run download <run-id>

# 特定のArtifactのみダウンロード
gh run download <run-id> --name manus-api-inquiry-results
```

**Artifactの内容**:
- `tmp/manus-line-config.json` - Manusから取得したLINE設定
- `tmp/orchestration/spec-evaluation.json` - spec評価結果
- `tmp/event.json` - LINEイベントペイロード

### 3. Supabaseログ

**取得方法**:
```bash
# Supabase CLIを使用
supabase functions logs relay --project-ref <project-ref>

# 特定の期間のログを取得
supabase functions logs relay --project-ref <project-ref> --since 1h
```

**確認ポイント**:
- LINE Webhookの受信状況
- GitHub Actionsへの`repository_dispatch`送信状況
- エラーログ

### 4. LINE Developers Console

**取得方法**:
1. [LINE Developers Console](https://developers.line.biz/console/)にログイン
2. チャネルを選択
3. **Messaging API**タブ → **統計情報**を確認
4. **Webhook送信状況**でメッセージ送信数を確認

**確認ポイント**:
- メッセージ送信数
- エラー率
- レスポンス時間

### 5. ローカルログファイル

**取得方法**:
```bash
# 最新のログを確認
ls -lt logs/progress/ | head -10

# 特定のログファイルを確認
cat logs/progress/20251106_120000_line.json | jq '.'

# ログを検索
grep -r "replyToken" logs/progress/ | head -20
```

**ログファイルの形式**:
- `YYYYMMDD_HHMMSS_line.json` - LINEイベントのログ
- `tmp/orchestration/spec-evaluation.json` - spec評価結果

### 6. GitHub Step Summary

**取得方法**:
GitHub Actionsの実行ページで**Summary**セクションを確認

**確認ポイント**:
- Runtime Parameter Checkの結果
- 各ステップの実行状況
- エラーメッセージ

### トラブルシューティング

**問題**: LINE返信が送信されない

**確認手順**:
1. `LINE_CHANNEL_ACCESS_TOKEN`が正しく設定されているか確認
   ```bash
   npm run runtime:verify
   ```

2. `Dispatch LINE replies`ステップのログを確認
   ```bash
   gh run view <run-id> --log | grep -A 20 "Dispatch LINE replies"
   ```

3. spec評価結果を確認
   ```bash
   gh run download <run-id>
   cat tmp/orchestration/spec-evaluation.json | jq '.results[] | select(.triggered | length > 0)'
   ```

4. テンプレートファイルが存在するか確認
   ```bash
   ls -la config/line/templates/
   ```

**問題**: テンプレート内のURLが解決されない

**確認手順**:
1. Manus設定が正しく取得されているか確認
   ```bash
   gh run download <run-id>
   cat tmp/manus-line-config.json | jq '.'
   ```

2. 環境変数が`$GITHUB_ENV`に設定されているか確認
   ```bash
  gh run view <run-id> --log | grep -E "LINE_CASE_STUDIES_URL|LINE_GUIDE_URL|LINE_GIFT_URL|LINE_PREMIUM_URL"
   ```

3. テンプレートビルド時のログを確認
   ```bash
   gh run view <run-id> --log | grep -A 10 "Build LINE Templates"
   ```

---

- [GitHub Repository](https://github.com/mo666-med/line-friend-registration-system)
- [LINE Developers Console](https://developers.line.biz/console/)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Manus API Documentation](https://docs.manus.im)
