# Manus自動化システム ドキュメント

## 概要

このドキュメントは、Cursorversシステムの全自動監視・修繕・復元システムについて説明します。

**設計原則**: Manusは「最後の砦」として、自動化できない複雑な問題のみに介入する

---

## システムアーキテクチャ

### 3層防御システム

```
Layer 1: 完全自動化（Manusなし）
  ↓ 自動修正失敗
Layer 2: 半自動化（Manus最小限）
  ↓ 複雑な問題
Layer 3: Manus完全介入（最終手段）
```

---

## Layer 1: 完全自動化

### 実行スケジュール

| ワークフロー | スケジュール | 説明 |
|------------|------------|------|
| `manus-audit-daily.yml` | 毎日 04:00 JST | 日次監査 |
| `manus-audit-weekly.yml` | 毎週日曜 04:00 JST | 週次監査 |
| `manus-audit-monthly.yml` | 毎月1日 04:00 JST | 月次監査 |

### 自動修正可能なエラー

| エラータイプ | 検出方法 | 修正スクリプト | 所要時間 |
|------------|---------|--------------|---------|
| `missing_auth_header` | grep | `fix-auth-headers.sh` | ~30秒 |
| `yaml_syntax` | yamllint | `fix-yaml-syntax.sh` | ~30秒 |
| `invalid_jwt` | grep | 手動（GitHub Issue作成） | - |

### コード自動修正（format/lint）

- `supabase/functions/manus-code-fixer` が GitHub Actions の失敗通知を受信
- Edge Function から `manus-code-fixer.yml` を `workflow_dispatch` で起動
- `deno fmt` / `deno lint --fix` を実行して自動コミット
- 必要なSecrets: `MANUS_GITHUB_TOKEN`（GitHub API 呼び出し + Push）、`MANUS_FIXER_API_KEY`（Edge Function 認証用）

### Manus自動修繕フロー

- 監査失敗時に `scripts/auto-fix/auto-fix-or-manus.sh` を実行
- 自動修正できない場合は Manus タスクを作成
- 生成したタスクは `orchestration/MANUS_AUTO_FIX_BRIEF.md` を使用
- `supabase/functions/manus-intelligent-repair` は `MANUS_GITHUB_TOKEN` を優先し、互換目的で `GITHUB_TOKEN` を fallback として許容する
- dispatch 前に GitHub API preflight を行い、`401/403/404/422` は `manual-required` の `skipped` に落とす
- `GITHUB_REPO` は `MANUS_ALLOWED_GITHUB_REPOS` allowlist によって制約され、誤った repo への dispatch を防ぐ
- `.github/workflows/deploy-supabase.yml` は `manus-intelligent-repair` を本番 deploy 対象に含み、GitHub Secret の `MANUS_GITHUB_TOKEN` / `GITHUB_REPO` を Supabase Edge Function secret に同期する
- 重要:
  - GitHub 自動修繕が未接続でも、監査 API 自体は `500` に落とさず `partial` で継続する
  - つまり「監査の健全性」と「GitHub 自動実行の可用性」を分離している
  - 自動修繕の許可範囲は bounded で、`generate_cards` / `redeploy_function` は自動、`reset_secret` は人手エスカレーションに降格する
  - GitHub Actions fallback は `401/403/404/422` と `manual intervention required` を auth/config 起因の degraded mode として扱う

### GitHub auth hardening

- 現在の production default は `MANUS_GITHUB_TOKEN`
- `GITHUB_TOKEN` fallback は互換レイヤーであり、長期的な正本ではない
- 推奨:
  - fine-grained token または GitHub App に移行する
  - `MANUS_ALLOWED_GITHUB_REPOS` を設定して dispatch 対象 repo を固定する
  - `MANUS_GITHUB_TOKEN` が stale な場合も監査 API は落とさず、GitHub Actions fallback へ委譲する

### 自動記録

全ての実行結果は自動的にGitHubに記録されます：

```
docs/logs/
├── audit/           # 監査ログ
│   ├── daily-2025-12-13.md
│   ├── weekly-2025-12-08.md
│   └── monthly-2025-12-01.md
├── errors/          # エラーログ
│   └── error-2025-12-13-040000.json
├── fixes/           # 修正ログ
│   └── fix-2025-12-13-040100.md
└── snapshots/       # システム状態
    └── state-2025-12-13.json
```

### Discord通知

#### 成功時
```
✅ Manus Audit (Daily) 成功

日時: 2025-12-13 04:00:00 JST
ステータス: 正常
詳細: [GitHub Actions実行ログ]
```

#### 失敗時（自動修正成功）
```
⚠️ Manus Audit (Daily) 失敗 → 自動修正完了

日時: 2025-12-13 04:00:00 JST
エラータイプ: missing_auth_header
対応: ✅ 自動修正が成功しました
詳細: [GitHub Actions実行ログ]
```

#### 失敗時（自動修正不可）
```
❌ Manus Audit (Daily) 失敗

日時: 2025-12-13 04:00:00 JST
エラータイプ: invalid_jwt
対応: ⚠️ 自動修正不可 - GitHub Issueを作成しました
詳細: [GitHub Actions実行ログ]
```

---

## Layer 2: 半自動化

### GitHub Issue自動作成

自動修正できないエラーは、GitHub Issueを自動作成します。

**Issueの内容**:
- エラータイプ
- エラーメッセージ
- 発生日時
- 対応方法
- Manus起動コマンド

### 手動トリガー

```bash
# GitHub Issue経由でManusを起動
gh workflow run manus-manual-fix.yml -f issue_number=123
```

---

## Layer 3: Manus完全介入

### 対象となる問題

- 複雑なコード修正
- アーキテクチャ変更
- 新機能実装
- 未知のエラーパターン

### 起動方法

1. GitHub Issueから手動トリガー
2. Manusに直接依頼
3. 緊急時は即座に介入

---

## 復元機能

### 自動バックアップ

- **頻度**: 毎日 JST 03:00
- **形式**: Git タグ（`backup/YYYY-MM-DD-HHMMSS`）
- **保存期間**: 無期限

### 復元手順

```bash
# 1. バックアップ一覧を確認
git fetch --tags
git tag -l "backup/*" | sort -r | head -10

# 2. 特定のバックアップに戻す
git checkout -b recovery backup/2025-12-13-030000

# 3. 確認後、mainにマージ
git checkout main
git merge recovery
git push origin main
```

---

## 設定

### Secret Plane

- `GitHub Actions secrets`
  - 監査実行、workflow dispatch、deploy に使う
- `Supabase runtime secrets`
  - `manus-intelligent-repair` や `line-daily-brief` が実行時に読む
- repo 内 `.env`
  - local bootstrap のみ。正本にしない

### GitHub Actions secrets

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `MANUS_GITHUB_TOKEN` | GitHub自動プッシュ用 | [GitHub Settings](https://github.com/settings/tokens) |
| `DISCORD_ADMIN_WEBHOOK_URL` | Discord通知用 | Discord Server Settings |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 用 | Supabase Dashboard / CLI |
| `SUPABASE_PROJECT_ID` | 対象 project ref | Supabase Dashboard |
| `MANUS_AUDIT_API_KEY` | 監査 Edge Function 認証 | repo / env policy |

### Supabase runtime secrets

| Secret名 | 説明 |
|---------|------|
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function runtime DB access |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API |
| `LINE_CHANNEL_SECRET` | LINE署名検証 |
| `MANUS_API_KEY` | Manus API |

### GitHub Token権限

`MANUS_GITHUB_TOKEN`に必要なスコープ:
- ✅ `repo` (Full control of private repositories)
- ✅ `workflow` (Update GitHub Action workflows)

---

## トラブルシューティング

### ワークフローが失敗する

1. GitHub Actionsのログを確認
2. `docs/logs/errors/`のエラーログを確認
3. 自動作成されたGitHub Issueを確認
4. 必要に応じてManusを起動

### Discord通知が届かない

1. `DISCORD_ADMIN_WEBHOOK_URL`が設定されているか確認
2. Webhook URLが有効か確認（Discord Server Settings）
3. ワークフローログでエラーを確認

### 自動修正が動作しない

1. `scripts/auto-fix/`のスクリプトが存在するか確認
2. スクリプトに実行権限があるか確認（`chmod +x`）
3. `MANUS_GITHUB_TOKEN`に`workflow`スコープがあるか確認
4. トークン未設定時は監査結果が `partial` で返ることを確認し、Discord 通知に `manual intervention required` が出ているか確認

### ログがGitHubにプッシュされない

1. `MANUS_GITHUB_TOKEN`が設定されているか確認
2. トークンに`repo`スコープがあるか確認
3. ワークフローログで`git push`のエラーを確認

---

## コスト分析

### クレジット消費比較

| シナリオ | 従来 | 新設計 | 削減率 |
|---------|------|--------|--------|
| 日次監査（成功） | 30クレジット/月 | 0クレジット | 100% |
| 既知エラー修正 | 10クレジット/月 | 0クレジット | 100% |
| 未知エラー対応 | 5クレジット/月 | 0クレジット | 100% |
| 複雑な問題 | 10クレジット/月 | 10クレジット/月 | 0% |
| **合計** | **150クレジット/月** | **10クレジット/月** | **93%削減** |

---

## メンテナンス

### 定期確認項目

- [ ] GitHub Actionsが正常に実行されているか（毎週）
- [ ] Discord通知が届いているか（毎週）
- [ ] ログが正しく記録されているか（毎月）
- [ ] GitHub Secretsが有効か（3ヶ月ごと）

### 更新履歴

| 日付 | 変更内容 | 担当 |
|------|---------|------|
| 2025-12-13 | 初版作成 | Manus |

---

## 関連ドキュメント

- [RECOVERY.md](../RECOVERY.md): 緊急リカバリー手順
- [RUNBOOK.md](./RUNBOOK.md): 運用手順書
- [cost-efficient-architecture.md](./cost-efficient-architecture.md): クレジット効率的設計

---

最終更新: 2025-12-13
