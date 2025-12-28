# 外部サービス連携チェックリスト

プロダクション環境で動作確認するためのチェックリスト。

---

## 環境変数チェック

### 危険パターン（コードレビューで検出すべき）

```typescript
// ❌ Bad: プレースホルダーをデフォルト値にしない
const URL = Deno.env.get("SOME_URL") ?? "https://example.com/xxxxx";
const API_KEY = Deno.env.get("API_KEY") ?? "sk_test_xxxxx";

// ✅ Good: 未設定時はエラーを投げる
const URL = Deno.env.get("SOME_URL") ?? "";
if (!URL) throw new Error("SOME_URL is required");

// ✅ Good: 起動時に検証
function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} environment variable is required`);
  return value;
}
```

### チェック項目

- [ ] `xxxxx`, `placeholder`, `TODO` などのパターンがURLやキーに含まれていないか
- [ ] 必須の環境変数が未設定の場合、明示的にエラーになるか
- [ ] テスト用の値（`sk_test_*`, `example.com` 等）が本番コードに混入していないか

---

## LINE 連携

### 必須環境変数

| 変数名 | 説明 | 取得場所 |
|--------|------|----------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API | LINE Developers Console |
| `LINE_CHANNEL_SECRET` | Webhook署名検証用 | LINE Developers Console |
| `LINE_FRIEND_URL` | 友だち追加URL | LINE Official Account Manager |

### チェック項目

- [ ] `LINE_FRIEND_URL` が `https://lin.ee/` で始まる有効なURLか
- [ ] LINE Official Account Manager でQRコードが正しく表示されるか
- [ ] Webhook URL が正しく設定されているか
- [ ] Webhook イベント（メッセージ、友だち追加等）が有効か

---

## Discord 連携

### 必須環境変数

| 変数名 | 説明 | 取得場所 |
|--------|------|----------|
| `DISCORD_BOT_TOKEN` | Bot トークン | Discord Developer Portal |
| `DISCORD_PUBLIC_KEY` | 署名検証用 | Discord Developer Portal |
| `DISCORD_ROLE_ID` | 付与するロールID | Discord サーバー設定 |
| `DISCORD_GUILD_ID` | サーバーID | Discord サーバー設定 |

### チェック項目（サーバー側）

- [ ] **カテゴリ権限**: プライベートカテゴリが有効か
- [ ] **@everyone**: 「チャンネルを見る」が ❌（赤い拒否）になっているか
- [ ] **チャンネル同期**: カテゴリ内の各チャンネルが「カテゴリと同期」されているか
- [ ] **ロール確認**: 無料会員に有料ロールが誤って付与されていないか

### 権限設定手順

1. カテゴリを右クリック → 「カテゴリの編集」
2. 「権限」→「プライベートカテゴリー」を有効化
3. アクセス可能なロールを追加（Admin, 有料ロール等）
4. 「高度な権限」で @everyone の「チャンネルを見る」を ❌ に設定
5. **重要**: カテゴリ内の各チャンネルで「権限を同期」を実行

---

## Stripe 連携

### 必須環境変数

| 変数名 | 説明 | 取得場所 |
|--------|------|----------|
| `STRIPE_API_KEY` | APIキー（本番: `sk_live_*`） | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Webhook署名検証 | Stripe Dashboard → Webhooks |

### チェック項目

- [ ] 本番環境で `sk_live_*` キーを使用しているか（`sk_test_*` でないか）
- [ ] Webhook エンドポイントが正しく登録されているか
- [ ] 必要なイベント（`checkout.session.completed` 等）が有効か

---

## デプロイ前チェック

```bash
# 1. lint
deno lint

# 2. テスト
deno test --no-check --allow-env --allow-net --allow-read

# 3. 環境変数の確認（Supabase）
# ダッシュボードで全ての必須変数が設定されているか確認

# 4. デプロイ
npx supabase functions deploy <function-name> --project-ref <project-id>

# 5. 動作確認
# - 実際のフローをテストアカウントで実行
# - ログを確認
```

---

作成日: 2025-12-25
