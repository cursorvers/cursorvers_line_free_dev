# Google Apps Script セットアップ手順

Health-ISAC Japan からのメールを自動的に Supabase Edge Function に転送するための設定手順です。

## 概要

```
Gmail (label: health-isac-japan)
    ↓ GAS Trigger (1分ごと)
    ↓ JSON POST
Supabase Edge Function (ingest-hij)
    ↓
hij_raw テーブル
```

---

## 1. Gmail ラベルの作成

1. Gmail を開く
2. 左サイドバーの「ラベル」→「+ 新しいラベルを作成」
3. ラベル名: `health-isac-japan`
4. 「作成」をクリック

### フィルタの設定

1. Gmail 設定 → 「フィルタとブロック中のアドレス」
2. 「新しいフィルタを作成」
3. From: `*@health-isac.jp` または Health-ISAC Japan のメールアドレス
4. 「フィルタを作成」→「ラベルを付ける」→ `health-isac-japan` を選択
5. 「フィルタを作成」

---

## 2. Google Apps Script プロジェクトの作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名: `Health-ISAC Ingest`

---

## 3. スクリプトのコピー

以下のコードを `コード.gs` にコピー:

```javascript
// ===== 設定 =====
const CONFIG = {
  // Supabase Edge Function の URL
  WEBHOOK_URL: 'https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/ingest-hij',
  
  // APIキー（Supabaseの環境変数 INGEST_HIJ_API_KEY と一致させる）
  API_KEY: 'YOUR_API_KEY_HERE',
  
  // 処理対象のラベル名
  LABEL_NAME: 'health-isac-japan',
  
  // 処理済みラベル名
  PROCESSED_LABEL_NAME: 'health-isac-processed'
};

/**
 * メイン処理: ラベル付きメールを取得してWebhookに送信
 */
function processHealthIsacEmails() {
  const label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
  if (!label) {
    console.log(`Label "${CONFIG.LABEL_NAME}" not found`);
    return;
  }

  // 処理済みラベルを取得または作成
  let processedLabel = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL_NAME);
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(CONFIG.PROCESSED_LABEL_NAME);
  }

  const threads = label.getThreads(0, 50); // 最大50件
  console.log(`Found ${threads.length} threads`);

  for (const thread of threads) {
    const messages = thread.getMessages();
    
    for (const message of messages) {
      // 既に処理済みかチェック（処理済みラベルが付いているか）
      const threadLabels = thread.getLabels().map(l => l.getName());
      if (threadLabels.includes(CONFIG.PROCESSED_LABEL_NAME)) {
        continue;
      }

      const payload = {
        message_id: message.getId(),
        sent_at: message.getDate().toISOString(),
        subject: message.getSubject(),
        body: message.getPlainBody()
      };

      const success = sendToWebhook(payload);
      
      if (success) {
        console.log(`Processed: ${payload.subject}`);
      } else {
        console.error(`Failed: ${payload.subject}`);
      }
    }

    // スレッドに処理済みラベルを付与
    thread.addLabel(processedLabel);
    // 元のラベルを削除（任意）
    // thread.removeLabel(label);
  }
}

/**
 * Webhookにデータを送信
 */
function sendToWebhook(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-API-Key': CONFIG.API_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    const code = response.getResponseCode();
    const body = response.getContentText();

    console.log(`Response [${code}]: ${body}`);

    return code === 200;
  } catch (error) {
    console.error(`Webhook error: ${error}`);
    return false;
  }
}

/**
 * 手動テスト用: 最新の1件を送信
 */
function testSendLatest() {
  const label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
  if (!label) {
    console.log(`Label "${CONFIG.LABEL_NAME}" not found`);
    return;
  }

  const threads = label.getThreads(0, 1);
  if (threads.length === 0) {
    console.log('No threads found');
    return;
  }

  const message = threads[0].getMessages()[0];
  const payload = {
    message_id: message.getId(),
    sent_at: message.getDate().toISOString(),
    subject: message.getSubject(),
    body: message.getPlainBody()
  };

  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  const success = sendToWebhook(payload);
  console.log(`Result: ${success ? 'Success' : 'Failed'}`);
}
```

---

## 4. 環境変数の設定

### 4-1. GAS 側

`CONFIG.API_KEY` を安全なランダム文字列に変更:

```javascript
API_KEY: 'your-secure-random-api-key-here',
```

APIキー生成例（ターミナルで実行）:
```bash
openssl rand -hex 32
```

### 4-2. Supabase 側

Supabase の環境変数に同じキーを設定:

```bash
supabase secrets set INGEST_HIJ_API_KEY=your-secure-random-api-key-here --project-ref haaxgwyimoqzzxzdaeep
```

---

## 5. トリガーの設定

1. Apps Script エディタで「トリガー」（時計アイコン）をクリック
2. 「+ トリガーを追加」
3. 以下の設定:
   - 実行する関数: `processHealthIsacEmails`
   - イベントのソース: `時間主導型`
   - 時間ベースのトリガーのタイプ: `分ベースのタイマー`
   - 間隔: `1分おき` または `5分おき`
4. 「保存」をクリック
5. Google アカウントの認証を許可

---

## 6. 動作確認

### テスト実行

1. Apps Script エディタで `testSendLatest` 関数を選択
2. 「実行」をクリック
3. 「実行ログ」でレスポンスを確認

### Supabase でデータ確認

```sql
SELECT * FROM hij_raw ORDER BY created_at DESC LIMIT 10;
```

---

## トラブルシューティング

### メールが取り込まれない

1. Gmail のラベルが正しく付いているか確認
2. GAS のトリガーが有効か確認
3. 「実行数」でエラーログを確認

### 401 Unauthorized エラー

- `CONFIG.API_KEY` と Supabase の `INGEST_HIJ_API_KEY` が一致しているか確認

### 重複データ

- `message_id` の UNIQUE 制約により、同じメールは重複登録されません（冪等性あり）

---

## セキュリティ考慮事項

1. **APIキーは秘密にする**: GAS のコードは共有しない
2. **処理済みラベル**: 同じメールを何度も送信しないようにラベルで管理
3. **エラーハンドリング**: 失敗時もリトライされるよう設計

---

最終更新: 2025-12-03

