# LINE リッチメニュー設定ガイド

Pocket Defense Tool のリッチメニュー設定手順です。

## 前提条件

- LINE Official Account Manager へのアクセス権限
- LINE Developers Console へのアクセス権限

---

## 1. リッチメニュー画像の作成

### 推奨サイズ

| サイズ | 用途 |
|--------|------|
| 2500 x 1686 px | 大サイズ（推奨） |
| 2500 x 843 px | コンパクトサイズ |
| 1200 x 810 px | 小サイズ |

### レイアウト案（6分割）

```
┌─────────────────┬─────────────────┬─────────────────┐
│                 │                 │                 │
│  Prompt         │  Risk           │  病院AI         │
│  Polisher       │  Checker        │  リスク診断     │
│                 │                 │                 │
├─────────────────┼─────────────────┼─────────────────┤
│                 │                 │                 │
│  SaMD           │  臨床知         │  次世代AI       │
│  スタートアップ │  アセット       │  実装診断       │
│                 │                 │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

### デザイン推奨

- 背景色: #1a1a2e（ダークネイビー）または #f8f9fa（ライトグレー）
- アイコン: シンプルなアウトラインアイコン
- フォント: Noto Sans JP または 游ゴシック
- 各ボタンに絵文字を追加して視認性向上

---

## 2. LINE Official Account Manager での設定

### アクセス

1. [LINE Official Account Manager](https://manager.line.biz/) にログイン
2. 対象のアカウントを選択
3. 左メニュー「リッチメニュー」をクリック

### リッチメニュー作成

1. 「作成」ボタンをクリック
2. 以下を設定：

| 項目 | 設定値 |
|------|--------|
| タイトル | Pocket Defense Tool |
| ステータス | 使用中 |
| 表示期間 | 開始日を設定、終了日は空欄 |
| メニューバーのテキスト | タップしてメニューを開く |
| デフォルト表示 | 表示する |

### アクション設定

各ボタンに以下のアクションを設定：

| ボタン | タイプ | アクション |
|--------|--------|-----------|
| Prompt Polisher | テキスト | `磨いて:` |
| Risk Checker | テキスト | `check:` |
| 病院AIリスク診断 | テキスト | `病院AIリスク診断` |
| SaMDスタートアップ診断 | テキスト | `SaMDスタートアップ診断` |
| 臨床知アセット診断 | テキスト | `臨床知アセット診断` |
| 次世代AI実装診断 | テキスト | `次世代AI実装診断` |

**注意**: Prompt Polisher と Risk Checker のボタンは「テキスト」タイプで、プレフィックスのみを送信します。ユーザーは送信後にメッセージを追加入力する必要があります。

---

## 3. 代替案：Postback アクション

より高度な UX を実現する場合は、Postback アクションを使用できます。

### Postback データ設計

```json
{
  "action": "prompt_polisher_start"
}
```

```json
{
  "action": "risk_checker_start"
}
```

```json
{
  "action": "course_entry",
  "keyword": "病院AIリスク診断"
}
```

### line-webhook での対応

`index.ts` の `handleEvent` 関数で postback を処理：

```typescript
if (event.type === "postback" && event.postback?.data) {
  const data = JSON.parse(event.postback.data);
  
  if (data.action === "prompt_polisher_start") {
    // Prompt Polisher の案内メッセージを返す
    await replyText(replyToken, "プロンプトを整形します。\n「磨いて:〇〇」の形式でメッセージを送信してください。");
    return;
  }
  
  if (data.action === "course_entry" && data.keyword) {
    // コース案内を返す
    const message = buildCourseEntryMessage(data.keyword);
    await replyText(replyToken, message);
    return;
  }
}
```

---

## 4. リッチメニュー画像テンプレート

### Figma / Canva 用テンプレート

以下の要素を含む画像を作成してください：

```
【上段左】
アイコン: ✨ または 🔧
テキスト: プロンプト整形
サブテキスト: Prompt Polisher

【上段中】
アイコン: 🔍 または ⚠️
テキスト: リスクチェック
サブテキスト: Risk Checker

【上段右】
アイコン: 🏥
テキスト: 病院AI
サブテキスト: リスク診断

【下段左】
アイコン: 💊 または 🔬
テキスト: SaMD
サブテキスト: スタートアップ診断

【下段中】
アイコン: 🧠 または 👨‍⚕️
テキスト: 臨床知
サブテキスト: アセット診断

【下段右】
アイコン: 🚀 または 🤖
テキスト: 次世代AI
サブテキスト: 実装診断
```

---

## 5. 設定後の確認

1. LINE アプリでアカウントを友だち追加
2. トーク画面を開く
3. リッチメニューが表示されることを確認
4. 各ボタンをタップして動作確認

### 確認項目

- [ ] リッチメニューが正しく表示される
- [ ] 「Prompt Polisher」ボタンで `磨いて:` が送信される
- [ ] 「Risk Checker」ボタンで `check:` が送信される
- [ ] 各診断キーワードボタンで正しいキーワードが送信される
- [ ] Webhook が正しく応答する

---

## トラブルシューティング

### リッチメニューが表示されない

1. 表示期間が正しく設定されているか確認
2. 「デフォルト表示」が「表示する」になっているか確認
3. LINE アプリを再起動

### ボタンが反応しない

1. アクションタイプが「テキスト」になっているか確認
2. Webhook URL が正しく設定されているか確認
3. Edge Function のログを確認

---

## 参考リンク

- [LINE リッチメニュー公式ドキュメント](https://developers.line.biz/ja/docs/messaging-api/using-rich-menus/)
- [LINE Official Account Manager](https://manager.line.biz/)

