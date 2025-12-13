# Cursorvers 全自動復元可能システム アーキテクチャ設計書

## 設計日: 2025-12-13

## 1. 現状分析

### 既存システム構成

#### ディレクトリ構造
```
cursorvers_line_free_dev/
├── .github/workflows/          # GitHub Actions（44個のワークフロー）
│   ├── manus-audit-*.yml      # Manus監査ワークフロー（4個）
│   ├── backup.yml             # 日次バックアップ（JST 03:00）
│   └── ...                    # その他の自動化ワークフロー
├── docs/                      # ドキュメント
│   ├── logs/                  # 手動作成ログ（3個）
│   └── dev/                   # 開発ドキュメント
├── supabase/functions/        # Edge Functions（13個）
│   ├── manus-audit-line-daily-brief/  # 監査API
│   ├── line-webhook/          # LINE Bot
│   └── ...
├── scripts/                   # ユーティリティスクリプト
├── RECOVERY.md                # 緊急リカバリー手順
└── docs/RUNBOOK.md            # 運用手順書
```

#### 既存の自動化機能
1. **日次バックアップ**: 毎日JST 03:00にGitタグ作成
2. **監査ワークフロー**: daily/weekly/monthly/report（手動実行可能）
3. **Edge Functions**: 13個のSupabase Functions
4. **ログ記録**: 手動で`docs/logs/`に記録（3ファイルのみ）

#### 課題
1. ❌ **ログ記録が手動**: 自動記録されていない
2. ❌ **復元手順が手動**: RECOVERY.mdに記載されているが自動化されていない
3. ❌ **エラー検出→修正が手動**: Manusが介入しないと修正されない
4. ❌ **GitHub CLIの権限不足**: ワークフローファイルを自動編集できない
5. ❌ **Discord通知が未設定**: `DISCORD_ADMIN_WEBHOOK_URL`が設定されていない

---

## 2. 設計方針

### 2.1 美しいシステムの定義

**美しいシステムとは**:
1. **自己修復**: エラーを自動検出し、自動修正する
2. **完全記録**: 全ての操作をGitHubに記録し、いつでも復元可能
3. **透明性**: 何が起きているか、誰でも理解できる
4. **非破壊**: 既存システムを壊さず、拡張する
5. **冗長性**: 単一障害点（SPOF）を排除

### 2.2 統合原則

1. **既存ファイルの尊重**: 既存の`RECOVERY.md`、`RUNBOOK.md`を拡張
2. **ディレクトリ構造の維持**: `docs/logs/`を活用
3. **ワークフローの拡張**: 既存の`manus-audit-*.yml`に機能追加
4. **命名規則の統一**: 既存の命名規則に従う

---

## 3. システムアーキテクチャ

### 3.1 全体フロー

```
┌─────────────────────────────────────────────────────────┐
│                     定期実行（Cron）                      │
│              毎日 04:00 JST (19:00 UTC前日)              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│          Phase 1: システム点検（Audit）                   │
│  ・LINE Bot稼働確認                                      │
│  ・Supabase Edge Functions確認                          │
│  ・n8n Workflows確認                                     │
│  ・GitHub最新コミット確認                                 │
│  ・カード在庫・配信成功率チェック                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│       Phase 2: エラー検出と診断（Detection）              │
│  ・HTTP 401/403/500エラー検出                            │
│  ・YAML構文エラー検出                                     │
│  ・API Key無効検出                                        │
│  ・タイムアウト検出                                        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│         Phase 3: 自動修正（Auto-Fix）                     │
│  ・認証ヘッダー修正                                        │
│  ・YAML構文修正                                           │
│  ・API Key更新提案                                        │
│  ・タイムアウト値調整                                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│      Phase 4: GitHub記録（Record）                        │
│  ・実行ログをMarkdownで記録                               │
│  ・エラー詳細をJSON形式で記録                             │
│  ・システム状態スナップショット作成                         │
│  ・ロールバックスクリプト生成                              │
│  ・自動コミット・プッシュ                                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│       Phase 5: 通知（Notification）                       │
│  ・Discord Webhook通知                                   │
│  ・LINE通知（重大エラー時）                               │
│  ・GitHub Issue自動作成（修正失敗時）                      │
└─────────────────────────────────────────────────────────┘
```

### 3.2 ディレクトリ構造（拡張版）

```
cursorvers_line_free_dev/
├── .github/workflows/
│   ├── manus-audit-daily.yml          # 拡張: 自動記録機能追加
│   ├── manus-audit-weekly.yml         # 拡張: 自動記録機能追加
│   ├── manus-audit-monthly.yml        # 拡張: 自動記録機能追加
│   ├── manus-audit-report.yml         # 拡張: 自動記録機能追加
│   └── manus-auto-fix.yml             # 新規: 自動修正ワークフロー
├── docs/
│   ├── logs/
│   │   ├── audit/                     # 新規: 監査ログ
│   │   │   ├── daily-YYYY-MM-DD.md
│   │   │   ├── weekly-YYYY-MM-DD.md
│   │   │   └── monthly-YYYY-MM-DD.md
│   │   ├── errors/                    # 新規: エラーログ
│   │   │   └── error-YYYY-MM-DD-HHMMSS.json
│   │   ├── fixes/                     # 新規: 修正ログ
│   │   │   └── fix-YYYY-MM-DD-HHMMSS.md
│   │   └── snapshots/                 # 新規: システム状態
│   │       └── state-YYYY-MM-DD.json
│   ├── recovery/                      # 新規: 復元スクリプト
│   │   └── rollback-YYYY-MM-DD-HHMMSS.sh
│   ├── RUNBOOK.md                     # 拡張: 自動化手順追加
│   └── MANUS_AUTOMATION.md            # 新規: 自動化システムドキュメント
├── RECOVERY.md                        # 拡張: 自動復元手順追加
└── scripts/
    └── auto-fix/                      # 新規: 自動修正スクリプト
        ├── detect-errors.sh
        ├── fix-auth-headers.sh
        ├── fix-yaml-syntax.sh
        └── record-to-github.sh
```

---

## 4. 実装計画

### 4.1 Phase 1: 基盤構築（非破壊）

#### 1.1 ディレクトリ作成
```bash
mkdir -p docs/logs/{audit,errors,fixes,snapshots}
mkdir -p docs/recovery
mkdir -p scripts/auto-fix
```

#### 1.2 GitHub Secrets設定
- `MANUS_GITHUB_TOKEN`: GitHub自動プッシュ用（workflow権限付き）
- `DISCORD_ADMIN_WEBHOOK_URL`: Discord通知用

### 4.2 Phase 2: 自動記録機能実装

#### 2.1 ワークフロー拡張
既存の`manus-audit-daily.yml`に以下を追加:
```yaml
- name: Record audit log
  run: |
    mkdir -p docs/logs/audit
    DATE=$(date +%Y-%m-%d)
    cat > docs/logs/audit/daily-${DATE}.md <<EOF
    # 日次監査ログ - ${DATE}
    ## 実行時刻
    $(date -u +"%Y-%m-%d %H:%M:%S UTC")
    ## 結果
    ${BODY}
    EOF

- name: Commit and push logs
  run: |
    git config user.name "Manus Automation"
    git config user.email "automation@manus.im"
    git add docs/logs/
    git commit -m "audit: daily check $(date +%Y-%m-%d)" || true
    git push
```

### 4.3 Phase 3: 自動修正機能実装

#### 3.1 エラー検出スクリプト
`scripts/auto-fix/detect-errors.sh`:
```bash
#!/bin/bash
# エラーパターンを検出し、修正スクリプトを呼び出す
```

#### 3.2 修正スクリプト
`scripts/auto-fix/fix-auth-headers.sh`:
```bash
#!/bin/bash
# 認証ヘッダーを自動修正
```

### 4.4 Phase 4: Discord通知統合

#### 4.1 通知スクリプト
```yaml
- name: Notify Discord
  if: failure()
  env:
    DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_ADMIN_WEBHOOK_URL }}
  run: |
    curl -X POST "${DISCORD_WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{"content":"❌ Manus Audit (Daily) failed"}'
```

---

## 5. セキュリティ考慮事項

1. **GitHub Token**: `workflow`スコープのみ付与、定期的にローテーション
2. **Discord Webhook**: GitHub Secretsで管理、ログに出力しない
3. **API Keys**: 既存のSecrets管理を維持
4. **コミット署名**: GPG署名を推奨（オプション）

---

## 6. ロールバック計画

### 6.1 自動生成されるロールバックスクリプト
```bash
#!/bin/bash
# rollback-2025-12-13-120000.sh
# この修正を取り消すには、以下を実行:
git revert <commit-hash>
git push origin main
```

### 6.2 手動ロールバック
```bash
# 最新のバックアップタグに戻す
git fetch --tags
git checkout -b rollback backup/2025-12-13-030000
git push origin rollback
```

---

## 7. 成功指標（KPI）

1. **自動修正率**: 90%以上のエラーを自動修正
2. **記録完全性**: 100%の操作をGitHubに記録
3. **復元時間**: 5分以内に任意の時点に復元可能
4. **通知遅延**: エラー発生から1分以内にDiscord通知
5. **ダウンタイム**: 年間99.9%以上の稼働率

---

## 8. 次のステップ

1. ✅ GitHub Secrets設定（`MANUS_GITHUB_TOKEN`, `DISCORD_ADMIN_WEBHOOK_URL`）
2. ⏳ ディレクトリ構造作成
3. ⏳ ワークフロー拡張実装
4. ⏳ 自動修正スクリプト実装
5. ⏳ テスト実行
6. ⏳ ドキュメント更新

---

**設計承認**: ユーザー承認待ち
**実装開始予定**: 承認後即時
