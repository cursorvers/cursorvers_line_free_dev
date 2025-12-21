# Medical AI Article Analyzer - 機能変更 設計書

## 1. 概要
既存の Manus Web App「Medical AI Article Analyzer」を複製し、Discord 投稿を Bot Token 方式から Webhook 方式へ変更する。Bot を削除した後でも投稿の編集・削除を可能にする。

## 2. 対象アプリケーション
- 複製元: https://medai-anlyz-hc8u3csc.manus.space/
- 複製後の名前: 任意（例: Medical AI Article Poster）

## 3. 環境変数（Secrets）の変更
| アクション | 変数名 | 値 | 説明 |
| --- | --- | --- | --- |
| 追加 | DISCORD_WEBHOOK_URL | https://discord.com/api/webhooks/1448220557211336776/fakXFuRH2nG-c-gF6kUAnekjaim3mgJ9zeFg6ft7NILcL1_9iA8gChqiPray-aIbK5LB | 新しく作成した Webhook URL |
| 削除 | DISCORD_BOT_TOKEN | (不要) | Bot Token は使用しない |
| 維持 | SUPABASE_URL | (変更なし) | Supabase プロジェクト URL |
| 維持 | SUPABASE_ANON_KEY | (変更なし) | Supabase Anon Key |
| 維持 | GEMINI_API_KEY | (変更なし) | Gemini API キー（または OpenAI キー） |

## 4. API 呼び出しの変更
### 4.1 新規投稿 (Create)
- Discord 投稿を Webhook 経由に変更し、`?wait=true` を付与してレスポンスの `id` (message_id) を Supabase に保存。
```javascript
const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
const res = await fetch(`${webhookUrl}?wait=true`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "Medical AI Analyzer",
    avatar_url: "https://...", // 任意
    embeds: [/* 記事要約など */],
  }),
});
const posted = await res.json();
const messageId = posted.id; // Supabase に保存
```

### 4.2 投稿編集 (Update)
- 保存済み `message_id` を使い、Webhook メッセージを PATCH。
```javascript
const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
await fetch(`${webhookUrl}/messages/${messageId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: "編集後メッセージ" }),
});
```

### 4.3 投稿削除 (Delete)
```javascript
const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
await fetch(`${webhookUrl}/messages/${messageId}`, { method: "DELETE" });
```

## 5. フロントエンドの変更
- 編集: 「編集」ボタン → モーダル入力 → バックエンド編集 API 呼び出し。
- 削除: 「削除」ボタン → 確認ダイアログ → バックエンド削除 API 呼び出し。

## 6. Supabase (article_posts テーブル)
- 投稿時に Webhook レスポンスの `message_id` を必ず保存（編集・削除のキー）。

## 7. 実装ステップ
1. Manus で既存 App を複製。
2. プロジェクト設定に `DISCORD_WEBHOOK_URL` を追加（`DISCORD_BOT_TOKEN` は削除）。
3. バックエンドの Discord 呼び出しを上記 4.1〜4.3 の Webhook 方式に変更。
4. フロントエンドの編集・削除ボタンから対応 API を呼び出す処理を実装。
5. デプロイして投稿／編集／削除が動くことを確認。

