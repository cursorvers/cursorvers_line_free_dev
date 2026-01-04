# Manus 指示書 - 2026-01-04

## 変更通知: Discord Webhook 設定

### 背景

2026-01-02 の日次システム点検において、点検レポートが **Medical AI Analyzer チャンネル** (1443611556477665390) に誤送信されていた。

### 原因

`DISCORD_ADMIN_WEBHOOK_URL` が Medical AI Analyzer チャンネルを指していた。

### 対応完了

`DISCORD_ADMIN_WEBHOOK_URL` を **#system-alerts チャンネル** (1443582135322804285) 用の Webhook に更新済み。

---

## 監査実行ルール（更新）

### 許可される監査実行

| 条件 | 可否 |
|------|------|
| ユーザーからの個別指示がある場合 | ✅ 実施可 |
| GitHub Actions からのトリガー | ✅ 実施可 |
| Manus の自主的な監査開始 | ❌ 禁止 |

### 禁止事項（変更なし）

- ユーザー指示なしでの監査開始
- n8n API への接続テスト（GitHub Actions の責務）
- Supabase Management API への接続テスト（GitHub Actions の責務）

---

## Discord 報告先

| 用途 | チャンネル | チャンネルID |
|------|-----------|-------------|
| システム点検レポート | #system-alerts | 1443582135322804285 |
| 修復完了/失敗報告 | #system-alerts | 1443582135322804285 |

**Medical AI Analyzer チャンネル (1443611556477665390) への送信禁止**

---

## 環境変数

以下の変数が更新された：

```
DISCORD_ADMIN_WEBHOOK_URL → #system-alerts チャンネル用 Webhook
```

GitHub Secrets に設定済み。Manus 側での追加設定は不要。

---

## 確認事項

次回の監査実行時、以下を確認すること：

1. レポートが #system-alerts に送信されること
2. Medical AI Analyzer チャンネルにメッセージが送信されないこと

---

発行日: 2026-01-04
発行者: Claude Code
