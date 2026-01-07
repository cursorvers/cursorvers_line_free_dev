# セッション状態 - Discord イベント通知追加

日時: 2026-01-05 09:50
状態: **完了 ✅**

---

## 実装内容

### 1. Discord イベント通知モジュール作成

**ファイル**: `supabase/functions/_shared/n8n-notify.ts`

Edge Functionから直接Discord Webhookに通知を送信するモジュール。

```typescript
// Stripe決済完了時
notifyStripeEvent(eventType, email, name, amount, currency, mode, sessionId)

// LINE新規登録/フォロー時
notifyLineEvent(eventType, lineUserId, displayName?, pictureUrl?)
```

### 2. 通知トリガー追加箇所

| Edge Function | イベント | 通知内容 |
|---------------|---------|---------|
| `stripe-webhook` | checkout.session.completed | 💰 新規決済完了（メール、名前、金額、タイプ） |
| `line-register` | 新規登録 | 👋 LINE新規登録（表示名、LINE ID、イベント） |
| `line-webhook/lib/event-handlers.ts` | follow | 👋 LINE新規登録（LINE ID、イベント） |

### 3. Discord Webhook

- **URL**: 環境変数 `DISCORD_ALERT_WEBHOOK` または M-ISAC用デフォルト
- **フォーマット**: Discord Embed（埋め込みメッセージ）
- **特徴**: 非同期・Fire and Forget（失敗しても本処理を止めない）

---

## 動作確認

- ✅ Stripe Bot 通知テスト: 成功
- ✅ LINE Bot 通知テスト: 成功
- ✅ lint: 0 errors

---

## 変更ファイル一覧

```
supabase/functions/_shared/n8n-notify.ts          # 新規作成
supabase/functions/stripe-webhook/index.ts        # import追加 + 通知呼び出し
supabase/functions/line-register/index.ts         # import追加 + 通知呼び出し
supabase/functions/line-webhook/lib/event-handlers.ts  # import追加 + 通知呼び出し
```

---

## n8n ワークフロー（未使用）

当初n8n Webhookを作成したが、API経由で作成したワークフローではWebhookが正しく登録されない問題があり、削除済み。
代わりにEdge Functionから直接Discord Webhookを呼び出す方式を採用。

---

## 次のステップ

1. **デプロイ**: Edge Functionをデプロイして本番環境で動作確認
2. **モニタリング**: Discord通知が正しく届くことを確認

---

作成: Claude Code
完了: 2026-01-05 09:50
