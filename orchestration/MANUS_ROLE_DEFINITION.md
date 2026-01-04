# Manus Role Definition v1.0

## 役割分担

```
┌─────────────────────────────────────────────────────────────────┐
│                      監査システム アーキテクチャ                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────────┐         ┌─────────────────┐               │
│   │  GitHub Actions │         │     Manus       │               │
│   │   (監査実行)     │  ───▶  │  (自動修復)      │               │
│   └─────────────────┘         └─────────────────┘               │
│         ▲                            │                           │
│         │                            ▼                           │
│   ┌─────────────────┐         ┌─────────────────┐               │
│   │  スケジュール    │         │  修復対象       │               │
│   │  毎日 06:00 JST │         │  ・カード補充    │               │
│   └─────────────────┘         │  ・LINE修繕     │               │
│                                └─────────────────┘               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Manus の役割（MUST）

### ✅ やるべきこと

1. **自動修復タスクの実行**
   - GitHub Actions から `remediation.triggered: true` で呼び出された場合のみ
   - カード在庫不足の補充
   - LINE関連問題の修繕

2. **GitHub Issue の作成**
   - 自動修復できない問題が発生した場合
   - 人間の判断が必要な場合

3. **Discord への通知**
   - 修復完了報告
   - 修復失敗報告

### ❌ やってはいけないこと

1. **自主的な監査の実行**
   - ユーザーからの個別指示がない場合、監査を開始しない
   - ユーザー指示がある場合は実施可

2. **外部サービスの接続テスト**
   - n8n API への接続確認
   - Supabase Management API への接続確認
   - これらは GitHub Actions が行う

3. **環境変数の検証**
   - `N8N_API_KEY` の有効性確認
   - `SUPABASE_ACCESS_TOKEN` の有効性確認
   - これらは GitHub Secrets で管理

---

## トリガー条件

### Manus が起動される条件

```yaml
# GitHub Actions (manus-audit-daily.yml) から呼び出し
remediation:
  triggered: true
  reason: "カード在庫不足" | "LINE問題検出" | etc.
```

### Manus が起動されない条件

- 監査結果が正常 (`allPassed: true`)
- 警告のみで修復不要 (`warningCount > 0, errorCount == 0`)
- 手動修復が必要な問題

---

## Manus が利用可能な環境変数

以下は **GitHub Actions 経由** で渡される：

| 変数名 | 用途 | 注意 |
|--------|------|------|
| `SUPABASE_URL` | Supabase API | 常に利用可能 |
| `SUPABASE_SERVICE_ROLE_KEY` | DB操作 | 常に利用可能 |
| `DISCORD_ADMIN_WEBHOOK_URL` | 通知 | 常に利用可能 |
| `GH_TOKEN` | GitHub操作 | 常に利用可能 |

### Manus 環境に設定不要

以下は **Manus 自身の環境変数には不要**：

| 変数名 | 理由 |
|--------|------|
| `N8N_API_KEY` | GitHub Actions が n8n を監視する |
| `SUPABASE_ACCESS_TOKEN` | GitHub Actions が管理APIを使用する |
| `LINE_CHANNEL_ACCESS_TOKEN` | Edge Function が保持 |
| `STRIPE_API_KEY` | Edge Function が保持 |

---

## エラー報告のルール

Manus がエラーを検出した場合：

1. **自動修復可能** → 修復を実行して Discord に報告
2. **自動修復不可** → GitHub Issue を作成
3. **環境変数不足** → **報告しない**（Manus の責務外）

### 報告しなくてよいエラー

```
❌ n8n API認証エラー - Manus の責務外
❌ Supabase Access Token未設定 - Manus の責務外
❌ GitHub Secrets の不足 - GitHub Actions の責務
```

---

## バージョン履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| v1.1 | 2026-01-04 | 監査ルール更新: ユーザー指示があれば実施可。Discord送信先を #system-alerts に変更 |
| v1.0 | 2026-01-03 | 初版作成。役割分担を明確化 |

---

## 参照

- `config/audit-config.yaml` - 監査設定
- `.github/workflows/manus-audit-daily.yml` - 監査ワークフロー
- `orchestration/MANUS_EXECUTION_BRIEF_v2.0.txt` - 実行ガイド
