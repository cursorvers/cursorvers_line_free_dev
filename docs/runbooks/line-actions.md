# Line Actions Runbook

> 運用担当・外部委託向けのハンドブックです。LINE 自動化フローの保守を中断させずに実施するための手順とチェックリストをまとめています。

## 0. 連絡先と役割
- **Ops Lead**: `@line-ops` (Slack) / `line-ops@example.com`
- **Tech Lead**: GitHub `@mo666-med`
- **Escalation**: 緊急時は Ops Lead → Tech Lead → 経営層の順に連絡。重大障害は電話で直接連絡。

## 1. 運用前チェックリスト
- [ ] GitHub Personal Access Token (PAT) with `contents:write` / `workflow` を準備（Actions 用 `ACTIONS_CONTENTS_PAT` として登録）
- [ ] `gh auth login` 済みで、対象リポジトリへ push 可能な状態
- [ ] `npm` / `node` / `python3` がローカルにインストール済み（CLI 検証用）
- [ ] GitHub CLI `gh` と `act` が導入済み（任意だが推奨）

## 2. Git Worktree 運用
集中開発と保守を分離するため Git worktree を推奨します。

```bash
# 1. 既存リポジトリで worktree 用ディレクトリを作成
mkdir -p ~/worktrees/line-actions

# 2. 指定ブランチ用の worktree を追加
cd /path/to/cursorvers_line_free_dev
git worktree add ~/worktrees/line-actions production-maint
cd ~/worktrees/line-actions

# 3. 状態確認
git status
```

- worktree で作業したコミットは `main` に PR するか、運用専用ブランチ（例: `ops/hotfix-*`）へ push してください。
- `git worktree remove` で安全に削除可能。未コミット変更がある場合は削除前に退避します。

## 3. フラグ・設定の切り替え
GitHub Variables/Secrets を `gh` で直接更新します。常に `gh secret/variable list` で現状を確認してから変更してください。

### 3.1 フラグ一覧
| パラメータ | 種別 | 用途 |
| --- | --- | --- |
| `MANUS_ENABLED` | Variable | Manus API を使用するかどうか（false で縮退） |
| `DEVELOPMENT_MODE` | Variable | 手動検証や再実行を許可 |
| `DEGRADED_MODE` | Variable | 強制的に縮退プランへ切り替え |
| `GEMINI_COST_PER_CALL` | Variable | Gemini 呼び出しのコスト推定 |
| `GEMINI_SUMMARY_DRIVER` | Variable | `api` / `cli`。`cli` 指定時は `gemini` CLI を利用して要約 |
| `GEMINI_CLI_PATH` | Variable | CLI 実行ファイルのパス（未指定なら `gemini`） |
| `GEMINI_CLI_WORKSPACE` | Variable | CLI の設定/キャッシュを書き込むディレクトリ（未指定なら `<repo>/.gemini-cli`） |
| `GEMINI_CLI_PROMPT` | Variable | CLI へ渡す JSON 指示文（任意。既定はサマリー専用プロンプト） |
| `MANUS_API_KEY` ほか | Secret | 外部 API 認証情報（`config/workflows/runtime-parameters.json` 参照） |

### 3.2 更新コマンド
```bash
# Variables (例: MANUS を一時停止)
gh variable set MANUS_ENABLED --body "false" --env production

gh variable set DEGRADED_MODE --body "true" --env production

# Secrets (例: Gemini API キーを差し替え)
cat new_gemini_key.txt | gh secret set GEMINI_API_KEY --env production --body -
```
- `--env` は環境保護済み環境（Actions 環境）に合わせて指定します。未指定の場合はリポジトリ全体。
- 更新後は `npm run runtime:verify` を実行し、欠損がないことを確認してください。

### 3.3 Gemini CLI 利用時の注意
- `GEMINI_SUMMARY_DRIVER=cli` と `GEMINI_CLI_PATH`（必要なら）を Variables 側で設定すると、`line-event.yml` 内のサマリー処理が Google 公式 CLI を経由します。
- CLI は `GEMINI_CLI_WORKSPACE` に設定ファイルを書き出します。デフォルトで `<repo>/.gemini-cli` が使用されるため、Workspace 内で完結します。
- CLI に渡すプロンプトを差し替える必要がある場合は `GEMINI_CLI_PROMPT` に JSON 指示文を入力してください。
- ローカルで挙動を確認したい場合は  
  `node scripts/automation/run-gemini-log-summary.mjs --driver cli --cli-path gemini --cli-workspace tmp/gemini-cli` を実行してください。

## 4. 縮退モード（degraded）手順
### 入り方
1. `gh variable set MANUS_ENABLED --body "false"`
2. `gh variable set DEGRADED_MODE --body "true"`
3. `gh workflow run economic-circuit-breaker.yml` を実行し設定が反映されたことを確認
4. `line-event.yml` 実行後の Step Summary で `Mode: degraded` になっていることを確認

### 解除方法
1. `gh variable set MANUS_ENABLED --body "true"`
2. `gh variable set DEGRADED_MODE --body "false"`
3. `gh workflow run line-event.yml --ref main --inputs payload_path=tmp/event.json` 等で乾式実行するか、本番イベントを待機
4. Step Summary で `Mode: normal` に戻ったことを確認

### フォローアップ
- 縮退期間中は Slack `#line-ops` で状況を共有し、`docs/alerts/line_degraded_outreach.ics` に沿って手動フォローを実施。
- 復旧後に `weekly-kpi-report.yml` を参照し件数をレポート。

## 5. 検証コマンド（ローカル & CI 共通）
```bash
# ランタイムパラメータ検証
npm run runtime:verify

# Secrets/Variables マニフェスト検証
npm run workflows:check

gh secret list

# ベンダーファイル整合性
npm run vendor:verify

# アクション/ユニットテスト
npm run test:actions
```
- CI の `node-tests.yml` でも上記が実行されるため、ローカルで事前に通すと安心です。
- `ci-smoke-act.yml` を使ったドライランは PR に `ci-smoke` ラベルを付与するか `gh workflow run ci-smoke-act.yml` で手動実行します。

## 6. ログと Artifact の取得
### 6.1 `persist-progress` の挙動
1. ログファイルをステージし `ACTIONS_CONTENTS_PAT` で push
2. 失敗時は `tmp/log-artifacts/<label-yyyymmddhhmmss>/` にアーカイブして Artifact にアップロード
3. Step Summary で push 成功／Artifact 退避を確認

### 6.2 リポジトリにコミットされたログを確認
```bash
git log -- logs/progress/
```

### 6.3 Artifact から取得
GitHub Actions 実行ページ → `Artifacts` → `progress-log-*` or `gemini-metrics-*` をダウンロード。展開後に必要なファイルを調査し、再コミットする場合は runbook に記録を残す。

## 7. Gemini メトリクスと KPI
- 要約ステップは `logs/metrics/gemini/<日付>.jsonl` に追記されます。
- 日次ジョブ `gemini-metrics-report.yml` が `scripts/automation/report-gemini-metrics.mjs` を呼び出し、JSON/Markdown のサマリを Artifact 化します。
- 手動で確認するには `docs/automation/GEMINI_METRICS.md` を参照し、以下のコマンドを実行:
  ```bash
  node scripts/automation/report-gemini-metrics.mjs \
    --input logs/metrics/gemini \
    --output tmp/gemini/metrics-summary.json \
    --markdown
  cat tmp/gemini/metrics-summary.json.md
  ```

## 8. テストとスモーク
- `node-tests.yml` が標準 CI。失敗したら `npm run test:actions` 等をローカル実行。
- `ci-smoke-act.yml` は `act` で `line-event` / `manus-progress` をドライラン。ラベル `ci-smoke` 付き PR で自動実行。
- ローカルで `act` を使う場合:
  ```bash
  act workflow_dispatch -W .github/workflows/line-event.yml -n --container-architecture linux/amd64
  ```

## 9. ワークフロー失敗時の初動
1. GitHub Actions の失敗実行を開き、Step Summary とログを確認
2. `persist-progress` ステップのメッセージで commit/push 成否と Artifact 情報を確認
3. Secrets/Variables の欠損が原因であれば `npm run runtime:verify` → `gh secret/variable` で再設定
4. Gemini 要約失敗 (`status=error`) の場合は JSON ログと API のレスポンスエラーメッセージを確認し、必要なら API キー更新
5. 重大な障害の場合は Slack `#line-ops` → Ops Lead へエスカレーション

## 10. 参考資料
- `docs/automation/LOG_PERSISTENCE.md` — persist-progress の詳細と Artifact 運用
- `docs/automation/GEMINI_METRICS.md` — Gemini メトリクスの収集・集計手順
- `docs/operations/runtime-config.md` — ランタイムパラメータ一覧
- `docs/RUNBOOK.md` — 旧版 Runbook（緊急停止/復旧/ロールバックの詳細）

## 11. GitHub Actions 経由で Manus API をテストする
### 11.1 前提条件
- `MANUS_BASE_URL`, `MANUS_API_KEY`, `SUPABASE_*`, `GEMINI_API_KEY` など必要な Variables / Secrets が設定済みであること（`npm run runtime:verify` で確認）。
- `ACTIONS_CONTENTS_PAT` などログ保全用の PAT が登録済み。
- テストに利用する `client_payload` を把握していること（例: Manus から返却される `task_id`, `plan_variant` など）。

### 11.2 テスト用 payload の作成
```bash
cat <<'JSON' > tmp/manus-progress-test.json
{
  "task_id": "test-task-001",
  "plan_variant": "production",
  "decision": "proceed",
  "context": {
    "user_id": "Uxxxxxxxx",
    "note": "dry-run"
  }
}
JSON
```

### 11.3 `repository_dispatch` でワークフローを起動
`manus-progress.yml` は `repository_dispatch` (`manus_progress`) を受け取る設計です。以下のコマンドで GitHub Actions を起動し、Manus API への問い合わせと Supabase 反映、ログ保存が行われます。

```bash
OWNER="<github-owner>"
REPO="<repo-name>"

gh api \
  repos/$OWNER/$REPO/dispatches \
  --field event_type=manus_progress \
  --input tmp/manus-progress-test.json \
  --field client_payload=@tmp/manus-progress-test.json
```

- `line-event.yml` をテストする場合は `event_type=line_event` に切り替え、LINE Webhook を模した payload を渡してください（`docs/automation/WORKFLOWS.md` の該当行からフィールド例を確認）。
- 成功すると GitHub Actions の実行履歴に新しいジョブが追加されます。

### 11.4 実行結果の確認
1. `gh run list --workflow manus-progress.yml --limit 1` で最新実行を確認。
2. Step Summary に以下が表示されることをチェック。
   - Supabase ingest / Manus retry の結果
   - `Runbook` へのリンク
3. ログが `logs/progress/` にコミット済みか、`persist-progress` が Artifact 退避に回ったかを確認。
4. Gemini メトリクスが有効な場合は `logs/metrics/gemini/<日付>.jsonl` に追記されます。必要なら `gh workflow run gemini-metrics-report.yml` で集計。

### 11.5 よくあるエラー
- **401 Unauthorized**: `MANUS_API_KEY` が無効／未設定。Secrets を更新後に再試行。
- **Missing payload fields**: `client_payload` の必須フィールド不足。`manus-progress.yml` の `Persist Progress Payload` ステップを参照し、必要なキーを追加。
- **ログがコミットされない**: `ACTIONS_CONTENTS_PAT` のスコープ不足、またはブランチ保護で拒否。PAT の `contents:write` を再確認し、`persist-progress` の Step Summary で Artifact 退避が行われていないかチェック。
---
最終更新: 2025-11-06
