# Free版 vs Paid版 リポジトリ比較分析

## 分析日時
2025-12-13 13:28 JST

## 基本情報

### Free版 (cursorvers_line_free_dev)
- **作成日**: 不明
- **最終プッシュ**: 1時間前 (2025-12-13 12:28頃)
- **コミット数**: 199
- **ブランチ数**: 7
- **タグ数**: 140
- **Issues**: 6
- **Pull Requests**: 3
- **最新コミット**: `8193cdb` - "Update manus-audit-daily.yml"

### Paid版 (cursorvers_line_paid_dev)
- **作成日**: 2025-11-06
- **最終プッシュ**: 2025-12-12 21:07:52Z (約26時間前)
- **コミット数**: 21
- **ブランチ数**: 1
- **タグ数**: 0
- **Issues**: 0
- **Pull Requests**: 0
- **最新コミット**: `155639a` - "docs: Add daily system check log (2025-12-12)"

---

## ディレクトリ構造比較

### Free版
```
.claude/
.github/workflows/          ← 44個のワークフロー
.sdd/
docs/                       ← ドキュメント充実
  ├── logs/                 ← ログ記録
  ├── MANUS_AUTOMATION.md   ← 自動化ドキュメント
  └── RUNBOOK.md
scripts/                    ← 自動修正スクリプト
  └── auto-fix/
supabase/                   ← Supabase Edge Functions
.cursorrules
.env.example
.gitignore
BUDGET.yml
CLAUDE.md
CURSOR移管パッケージ_最終版.md
QUICK_FIX.md
README.md                   ← 詳細なREADME
RECOVERY.md
RUNBOOK.md
```

### Paid版
```
.github/workflows/          ← ワークフロー数不明
.sdd/
apps/line-plus-bot/         ← LINE Plus Bot
docs/                       ← ログのみ
examples/events/
.gitignore
package-lock.json
package.json
tsconfig.json
vitest.config.ts
(README.md なし)            ← READMEが存在しない
```

---

## 機能比較

### Free版の特徴
✅ **完全稼働中**
- LINE Bot（友だち登録システム）
- GitHub Actions（44個のワークフロー）
- Supabase Edge Functions
- 自動監査システム（Manus Audit）
- 自動修正スクリプト
- Discord通知
- Google Sheets連携
- n8n連携

✅ **ドキュメント充実**
- README.md（詳細なシステム説明）
- RUNBOOK.md（運用手順）
- RECOVERY.md（復旧手順）
- MANUS_AUTOMATION.md（自動化ドキュメント）

✅ **自動化完備**
- 日次/週次/月次監査
- エラー自動修正
- ログ自動記録
- Discord自動通知

### Paid版の特徴
⚠️ **開発途中**
- LINE Plus Bot（TypeScript）
- 基本的なワークフロー
- ログ記録機能

❌ **ドキュメント不足**
- README.md が存在しない
- 運用ドキュメントなし

❌ **自動化未実装**
- 監査システムなし
- 自動修正なし
- 通知システム不明

---

## GitHub Secrets比較

### Free版（20個）
1. DISCORD_ADMIN_WEBHOOK_URL ✅
2. DISCORD_SYSTEM_WEBHOOK ✅
3. GENERATE_SEC_BRIEF_API_KEY ✅
4. GOOGLE_SERVICE_ACCOUNT_JSON ✅
5. GOOGLE_SHEET_ID ✅
6. LINE_CHANNEL_ACCESS_TOKEN ✅
7. LINE_DAILY_BRIEF_API_KEY ✅
8. LINE_DAILY_BRIEF_CRON_SECRET ✅
9. MANUS_API_KEY ✅
10. MANUS_AUDIT_API_KEY ✅
11. MANUS_GITHUB_TOKEN ✅ (今日追加)
12. OBSIDIAN_VAULT_PATH ✅
13. OPENAI_API_KEY ✅
14. PROGRESS_WEBHOOK_URL ✅
15. SUPABASE_ACCESS_TOKEN ✅
16. SUPABASE_KEY ✅
17. SUPABASE_PROJECT_ID ✅
18. SUPABASE_SERVICE_ROLE_KEY ✅
19. SUPABASE_URL ✅

### Paid版（1個）
1. DISCORD_BOT_TOKEN ✅

---

## 結論

### 現状
- **Free版**: 完全稼働中の本番システム
- **Paid版**: 開発途中のプロトタイプ

### 推奨アクション

#### 短期（今日）
1. ✅ Free版の完全自動運用を完成させる
2. ❌ Paid版は触らない（開発途中のため）

#### 中期（1週間以内）
1. Paid版の目的を明確化
   - Free版と統合するのか？
   - 別サービスとして開発するのか？
2. Paid版にREADME.mdを追加
3. Paid版の開発ロードマップを作成

#### 長期（1ヶ月以内）
1. Paid版にFree版の自動化システムを移植
2. Paid版専用のSupabaseプロジェクトを設定
3. Paid版の本番運用開始

---

## 最終判断

**今回のタスク（完全自動運用の設定）はFree版のみに適用する。**

理由：
1. Free版は既に稼働中で、すぐに効果が出る
2. Paid版は開発途中で、設定しても使われない
3. Paid版の目的が不明確

Paid版への適用は、Paid版の開発が進んでから行う。
