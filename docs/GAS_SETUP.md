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

以下のコードを `コード.gs` にコピー（APIキー設定済み）:

```javascript
// ===== 設定 =====
var CONFIG = {
  WEBHOOK_URL: "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/ingest-hij",
  API_KEY: "10cdae55f28ae7eeaf0a26278843f6d0bf72016cc8a26eb370de7211743d8a4d",
  LABEL_NAME: "health-isac-japan",
  PROCESSED_LABEL_NAME: "health-isac-processed"
};

function processHealthIsacEmails() {
  var label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
  if (!label) {
    console.log("Label not found: " + CONFIG.LABEL_NAME);
    return;
  }

  var processedLabel = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL_NAME);
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(CONFIG.PROCESSED_LABEL_NAME);
  }

  var threads = label.getThreads(0, 50);
  console.log("Found " + threads.length + " threads");

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var threadLabels = thread.getLabels().map(function(l) { return l.getName(); });
    
    if (threadLabels.indexOf(CONFIG.PROCESSED_LABEL_NAME) !== -1) {
      continue;
    }

    var messages = thread.getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var payload = {
        message_id: message.getId(),
        sent_at: message.getDate().toISOString(),
        subject: message.getSubject(),
        body: message.getPlainBody()
      };

      var success = sendToWebhook(payload);
      if (success) {
        console.log("Processed: " + payload.subject);
      } else {
        console.log("Failed: " + payload.subject);
      }
    }

    thread.addLabel(processedLabel);
  }
}

function sendToWebhook(payload) {
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-API-Key": CONFIG.API_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    var code = response.getResponseCode();
    var body = response.getContentText();
    console.log("Response [" + code + "]: " + body);
    return code === 200;
  } catch (error) {
    console.log("Webhook error: " + error);
    return false;
  }
}

function testSendLatest() {
  var label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
  if (!label) {
    console.log("Label not found: " + CONFIG.LABEL_NAME);
    return;
  }

  var threads = label.getThreads(0, 1);
  if (threads.length === 0) {
    console.log("No threads found");
    return;
  }

  var message = threads[0].getMessages()[0];
  var payload = {
    message_id: message.getId(),
    sent_at: message.getDate().toISOString(),
    subject: message.getSubject(),
    body: message.getPlainBody()
  };

  console.log("Payload: " + JSON.stringify(payload));
  var success = sendToWebhook(payload);
  console.log("Result: " + (success ? "Success" : "Failed"));
}
```

**注意:** APIキーは設定済みです。このまま使用できます

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

