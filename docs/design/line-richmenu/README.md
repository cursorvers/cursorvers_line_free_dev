# LINE リッチメニュー – Front Buttons v1

このフォルダには、参考スクリーンショットの「手前ボタン」UIをベースにしたオリジナルリッチメニューデザインと設定ファイルを格納しています。丸パクリを避けつつ、ネオン×ダークトーンの世界観で統一しました。

## 同梱ファイル

| ファイル | 用途 |
| --- | --- |
| `front-menu.svg` | 2500×843px のリッチメニュー画像。3枚のカードがネオン枠で並ぶレイアウト。 |
| `front-menu.json` | LINE Messaging API `POST /v2/bot/richmenu` で利用する領域設定テンプレート。 |
| `flex-welcome.json` / `flex-gift.json` / `flex-contact.json` | トーク画面に送信できるFlexテンプレ。各カードに対応するコンテンツ案。 |
| `quick-reply.json` | トーク冒頭に添付する推奨Quick Replyセット。 |
| `message-flow.md` | キーワード別のレスポンス構成とコピー案をまとめたノート。 |
| `scenarios/*.json` | 複数メッセージ（テキスト＋Flex）をまとめた配信テンプレ。 |
| `scripts/manus/export-config.mjs` | Manus API からLINE関連URLを取得し、テンプレ生成時に反映させるヘルパー。 |
| `scripts/automation/build-line-assets.mjs` | `front-menu.svg` から 2x PNG（通常/ホバー）を生成し、メタデータとカラーパレット検証を自動化。 |

## カラーパレット

| 役割 | 値 |
| --- | --- |
| 背景グラデーション | `#0F1630 → #050713` |
| LINE限定カード | `#FF8DF9 → #C045FF` (opacity 0.22) |
| EXAMPLEカード | `#6FE6FF → #3D68FF` (opacity 0.22) |
| CONTACTカード | `#A6FFE4 → #42C3FF` (opacity 0.22) |
| テキスト/アイコン | `#FFFFFF` (90%〜70%の透明度で階調) |

アイコンはフラットな線画をベースに、枠線やドロップシャドウでネオン感を演出しています。SVGなので、Figma 等にインポートして微調整できます。

## リッチメニュー登録手順

1. **PNGへの書き出し**  
   - `front-menu.svg` を 2倍解像度 (5000×1686px) で PNG 出力すると実機で鮮明になります。  
   - 押下時のバリエーションを作る場合は彩度を落とした PNG を別途出力。  
   - 自動化したい場合は以下のスクリプトを利用すると、SVG→PNG 変換・寸法検証・SHA256 生成を一括で実行できます（`sharp` が導入されていない CI では `--skip-render` を付けて既存 PNG の検証のみ行えます）。

   ```bash
   # 例: assets/dist/front-menu.png / front-menu-hover.png を生成
   npm run line:assets -- --svg docs/design/line-richmenu/front-menu.svg --out dist

   # 変換をスキップして既存 PNG だけ検証する場合
   npm run line:assets -- --skip-render
   ```

2. **メニュー作成**
   ```bash
   # JSONテンプレートのURIを実際の導線に置き換えてから実行
   curl -X POST https://api.line.me/v2/bot/richmenu \
     -H "Authorization: Bearer <CHANNEL_ACCESS_TOKEN>" \
     -H "Content-Type: application/json" \
     -d @front-menu.json
   ```
   レスポンスで `richMenuId` を取得します。

3. **画像アップロード**
   ```bash
   curl -X POST "https://api.line.me/v2/bot/richmenu/<richMenuId>/content" \
     -H "Authorization: Bearer <CHANNEL_ACCESS_TOKEN>" \
     -H "Content-Type: image/png" \
     --data-binary @front-menu.png
   ```

4. **デフォルト適用**
   ```bash
   curl -X POST "https://api.line.me/v2/bot/user/all/richmenu/<richMenuId>" \
     -H "Authorization: Bearer <CHANNEL_ACCESS_TOKEN>"
   ```

### CLIスクリプトで一括登録する場合

`package.json` から `npm run richmenu:register` が利用できます。

```bash
LINE_CHANNEL_ACCESS_TOKEN=xxxxx \
npm run richmenu:register -- \
  --json docs/design/line-richmenu/front-menu.json \
  --image dist/front-menu.png \
  --apply-default
```

`--apply-default` を付けない場合は作成＋画像アップロードのみに留まり、後から任意のユーザーに紐付けられます。

## Flexテンプレート送信例

CLIスクリプトを経由するとファイルをそのまま指定できます。

```bash
# 特定ユーザーへプッシュ
LINE_CHANNEL_ACCESS_TOKEN=xxxxx \
npm run line:flex -- \
  --to Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --file docs/design/line-richmenu/flex-welcome.json

# 全ユーザーへブロードキャスト
LINE_CHANNEL_ACCESS_TOKEN=xxxxx \
npm run line:flex -- \
  --broadcast \
  --file docs/design/line-richmenu/flex-gift.json
```

Flex JSONは「単一のメッセージオブジェクト」を格納しているため、そのまま `messages` 配列に包まれて送信されます。AltTextと色調はリッチメニューと揃えてあるので、トークの最初のレスポンスとして使うと世界観が統一されます。

### Quick Replyテンプレ

`quick-reply.json` は以下のように追加できます。

```jsonc
{
  "to": "Uxxxxxxxx",
  "messages": [
    {
      "type": "text",
      "text": "見たいメニューを選択してください！",
      "quickReply": {
        "items": (quick-reply.jsonの内容)
      }
    }
  ]
}
```

`message-flow.md` にキーワードとレスポンス案をまとめているので、オートリプライやWebhookハンドラーの実装時に参照してください。

`docs/design/line-richmenu/scenarios/scenario_add_line.json` のように、シナリオメッセージで `quickReply` に `../quick-reply.json` を指定すると、`npm run line:templates` 実行時に `config/line/templates/*.json` へ Quick Reply が埋め込まれます（テスト: `tests/actions/build-line-templates.test.mjs`）。追加の Quick Reply セットを作成したい場合は `docs/design/line-richmenu/quick-reply.json` を複製し、シナリオから参照してください。

## シナリオ配信 (テキスト＋Flexのまとめ送り)

`docs/design/line-richmenu/scenarios/` には、友だち追加や各コマンド向けのメッセージセットを用意しています。  
`npm run line:scenario` で指定すると、複数メッセージを順番に送信できます。

```bash
LINE_CHANNEL_ACCESS_TOKEN=xxxxx \
npm run line:scenario -- \
  --to Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --scenario docs/design/line-richmenu/scenarios/scenario_add_line.json
```

`--broadcast` を付ければ全ユーザー向けに同じ構成を配信できます。

### Spec連携

`codex.spec.yaml` の `cmd_detail` / `cmd_gift` / `cmd_contact` ルールでは、それぞれ `scenario_cmd_*` テンプレートを送信するよう設定しています。GitHub Actions 側では `scripts/orchestration/reply-line-templates.mjs` を実行し、`config/line/templates/<template>.json` を読み込んで LINE Reply API に配信します（`DEVELOPMENT_MODE=true` の場合は dry-run）。

デプロイ向けに `config/line/templates/` へビルドするには次のコマンドを使用します（Manusからの上書き値がある場合は自動的に反映されます）。

```bash
npm run line:templates
```

各シナリオが `config/line/templates/<name>.json` に書き出され、Quick Reply や Flex コンテンツが埋め込まれた状態で保存されます。CI や GitHub Actions からテンプレートを読み込む際はこの出力を参照してください。

## カスタマイズのヒント

- JSONテンプレ内の `uri` / `text` を実導線に差し替えれば即運用可能です。  
- フロントメニューは 2×2 グリッド（上段: 「LINE限定＠無料資料」「PREMIUMプレミアム」/ 下段: 「INQUIRYお問い合わせ」「CONSULTING導入支援」）を前提にしており、上段はURI誘導、下段はメッセージトリガーで `cmd_contact` などのイベントに接続できます。  
- サブメニュー用に `selected: false` のバリエーションを作って切り替える運用も想定できます。

### URLプレースホルダー

テンプレート内のリンクは以下の環境変数で上書きできます。未設定の場合は `https://example.com/...` が使用されます。

| 変数 | 用途 | デフォルト |
| --- | --- | --- |
| `LINE_CASE_STUDIES_URL` | 開発事例への導線 | https://example.com/case-studies |
| `LINE_GUIDE_URL` | ノウハウ資料/解説ページ | https://example.com/guide |
| `LINE_GIFT_URL` | 限定プレゼント受け取りページ | https://example.com/gift |
| `LINE_PREMIUM_URL` | プレミアム/導入支援メニュー | https://example.com/premium |

`reply-line-templates.mjs` が実行される GitHub Actions 環境でこれらを `vars` もしくは Secrets の `env` として設定してください。Manus API に `line_case_studies_url` などが格納されている場合、`scripts/manus/export-config.mjs` が取得し `$GITHUB_ENV` へ書き出します。

---
最終更新: 2025-11-08
