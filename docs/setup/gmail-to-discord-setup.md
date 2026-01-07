# Gmail → Discord 転送セットアップガイド

GmailからDiscordへメールを自動転送するGoogle Apps Script（GAS）の設定手順です。

---

## 概要

| 項目 | 内容 |
|------|------|
| スクリプト | `scripts/gmail-to-discord.gs` |
| 実行環境 | Google Apps Script |
| 転送間隔 | 5分（設定可能） |
| 対象 | 未読メール |

---

## セットアップ手順

### 1. Google Apps Scriptプロジェクト作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. **「新しいプロジェクト」** をクリック
3. プロジェクト名を「Gmail to Discord」に変更

### 2. スクリプトを貼り付け

1. `scripts/gmail-to-discord.gs` の内容をコピー
2. GASエディタに貼り付け（既存の `function myFunction()` を置き換え）
3. **Ctrl+S** で保存

### 3. Discord Webhook URLを設定

1. GASエディタで **「プロジェクトの設定」**（歯車アイコン）をクリック
2. **「スクリプトプロパティ」** セクションまでスクロール
3. **「スクリプトプロパティを追加」** をクリック
4. 以下を入力：
   - プロパティ: `DISCORD_WEBHOOK_URL`
   - 値: `https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN`
5. **「スクリプトプロパティを保存」** をクリック

> **重要**: Webhook URLはコード内ではなく、必ずスクリプトプロパティで設定してください。

### 4. 権限を承認

1. GASエディタで `testSendToDiscord` 関数を選択
2. **「実行」** ボタンをクリック
3. 初回は権限承認が求められます：
   - 「権限を確認」→「詳細」→「（プロジェクト名）に移動」→「許可」

### 5. 動作テスト

1. `testSendToDiscord` を実行
2. Discordチャンネルに「✅ Gmail → Discord 転送テスト成功！」が届けば成功

### 6. トリガー設定

1. GASエディタで `createTrigger` 関数を選択
2. **「実行」** をクリック
3. 5分ごとに `checkNewEmails` が実行されるようになります

---

## カスタマイズ

### 特定のラベルのみ監視

```javascript
const TARGET_LABEL = 'important';  // ラベル名を指定
```

### 特定の送信元のみ転送

```javascript
const FROM_FILTER = 'notification@example.com';
```

### 転送間隔を変更

`createTrigger` 関数内を編集：

```javascript
// 10分ごと
.everyMinutes(10)

// 1時間ごと
.everyHours(1)
```

---

## トラブルシューティング

### Discordに通知が届かない

1. **Webhook URLの確認**
   ```
   プロジェクトの設定 → スクリプトプロパティ → DISCORD_WEBHOOK_URL
   ```

2. **実行ログの確認**
   ```
   表示 → 実行ログ
   ```

3. **トリガーの確認**
   ```
   トリガー → checkNewEmails が設定されているか確認
   ```

### 「権限がありません」エラー

1. 別のGoogleアカウントでログインしていないか確認
2. 新しいプロジェクトを作成してやり直し

### レート制限エラー

Discord APIのレート制限（5リクエスト/秒）に達している可能性があります。
`MAX_THREADS` を減らしてください：

```javascript
const MAX_THREADS = 5;  // デフォルト20から削減
```

---

## 関連リソース

- [Discord Webhook作成ガイド](https://support.discord.com/hc/ja/articles/228383668)
- [Google Apps Script公式ドキュメント](https://developers.google.com/apps-script)

---

*作成日: 2026-01-06*
