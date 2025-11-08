# LINE トーク設計ノート – Front Buttons v1

リッチメニューとFlexテンプレを前提に、キーワード入力時のオートレスポンスを整理します。  
各ステップは既存の `codex.spec.yaml` のイベント命名（`cmd_*` 等）に合わせて実装できます。

## 全体フロー

```
友だち追加 (add_line)
 ├─ Flex: flex-welcome.json
 ├─ Quick Reply: ["開発事例を見る", "プレゼントの受け取り", "お問い合わせ"]
 └─ ガイドメッセージ → メニュー案内
```

## トリガー別メッセージ案

| トリガー | 想定入力 | レスポンス | 挿入テンプレ |
| --- | --- | --- | --- |
| `cmd_detail` | 「開発事例のご案内」「開発事例を見る」 | ・実績リンク（note / web）<br>・Flex送信（`flex-welcome.json`）<br>・CTAボタン：個別相談 | Flex + テキスト |
| `cmd_gift` | 「プレゼントの受け取り」「限定プレゼント」 | ・パスワード付きテキスト（テンプレ内 `PW` を更新）<br>・Flex送信（`flex-gift.json`） | Flex + 固定テキスト |
| `cmd_contact` | 「お問い合わせ」「相談したい」 | ・問い合わせカテゴリの案内テキスト<br>・Flex送信（`flex-contact.json`）<br>・Quick Reply: 「個人」「法人」「その他」 | Flex + Quick Reply |

### 推奨Quick Replyセット

```jsonc
[
  { "type": "action", "action": { "type": "message", "label": "開発事例を見る", "text": "開発事例のご案内" } },
  { "type": "action", "action": { "type": "message", "label": "プレゼントの受け取り", "text": "プレゼントの受け取り" } },
  { "type": "action", "action": { "type": "message", "label": "お問い合わせ", "text": "お問い合わせ" } }
]
```

## テキストテンプレ案

### 1. 開発事例のご案内
```
いつもありがとうございます🙌
最新の開発事例・運用手順は以下でまとめています。

・生成AIを活用したプロトタイピング
・LINEボット／自動化ワークフロー
・ドキュメント整備のベストプラクティス

↓のボタンから一気にご覧ください！
```

### 2. プレゼントの受け取り
```
LINE限定の特典をご用意しました✨

受け取りページはこちら：
https://example.com/gift

パスワード：`17171baa`
（期限は今のところありませんが、更新する場合はこのトークで告知します。）
```

### 3. お問い合わせ
```
お問い合わせありがとうございます！

以下のどれにあてはまりますか？
・個人の開発サポート
・法人/チームでの導入相談
・SNS / note 記事に関するご相談
・その他（自由記入）

選択肢をタップしていただくと担当に届き、24時間以内に返信します。自由記入の場合は後ろに続けてご入力ください✍️
```

## 実装メモ

- `line-event-mapper.js` でテキスト → `cmd_*` イベントへ既にマッピング済み（「開発事例のご案内」「プレゼントの受け取り」「お問い合わせ」など）。
- `codex.spec.yaml` に `cmd_detail` / `cmd_gift` / `cmd_contact` が追加され、各ルールで `scenario_cmd_*` テンプレート送信を行う。
- 実際の配信テンプレは `docs/design/line-richmenu/scenarios/*.json` で管理。CLI (`npm run line:scenario`) からの乾式確認も可能。
- パスワードは `.env` や Supabase テーブルから取得するようにすると更新漏れを防げます。
- リンクURLは `LINE_CASE_STUDIES_URL` / `LINE_GUIDE_URL` / `LINE_GIFT_URL` / `LINE_PREMIUM_URL` の各環境変数で上書き可能。未設定の場合は `https://example.com/...` が使用されます。
- GitHub Actions 実行時は `scripts/manus/export-config.mjs` がManus APIから値を取得し、上記環境変数を自動で注入します。
- `LINE_MAX_BROADCASTS_PER_MONTH` / `LINE_PROMO_COOLDOWN_DAYS` / `LINE_PROMO_TEMPLATES` でブロードキャスト制限を調整。`reply-line-templates.mjs` が送信前に Supabase の `line_members.metadata` を参照し、制限に達した場合は返信をスキップします。
