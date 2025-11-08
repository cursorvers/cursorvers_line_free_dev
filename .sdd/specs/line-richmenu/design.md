# Line Richmenu – Design

## 1. Architecture Overview

### 1.1 Goals
- 提供する資産（SVG→PNG、Flex/シナリオ JSON、Quick Reply）をリポジトリ内で再現性高くビルド・検証し、GitHub Actions から自動登録できる状態にする。
- `codex.spec.yaml` と `config/line/templates/*.json` を介して、LINE イベント（`add_line`, `cmd_detail`, `cmd_gift`, `cmd_contact`）がシナリオテンプレに確実に紐づくようにする。
- Manus／環境変数で差し替え可能な URL プレースホルダーと、Quick Reply の共通カタログを導入し、Ops が安全に更新できる手順を整備する。

### 1.2 System Boundaries & Data Flow
```
Figma / SVG ──> scripts/automation/build-line-assets.mjs ──> dist/front-menu*.png
                               │
                               ▼
docs/design/line-richmenu/scenarios/*.json ──> build-line-templates.mjs ──> config/line/templates/*.json
                               │                                             │
docs/design/line-richmenu/quick-reply.json ───┘                              │
                                                                             ▼
codex.spec.yaml (scenario_cmd_*) ──> scripts/orchestration/reply-line-templates.mjs ──> LINE Reply API

GitHub Actions (line-event.yml / richmenu-register.yml) ──> LINE Messaging API / Artifact / Supabase
```
- **Input boundary**: デザイン資産（`docs/design/line-richmenu/**`）と Manus 由来の URL。
- **Processing boundary**: Node スクリプト（assets/template builder、spec router、Quick Reply カタログ）。
- **Output boundary**: `dist/front-menu.png`, `config/line/templates/*.json`, LINE Richmenu API, LINE Reply API。

### 1.3 Patterns / Libraries
- Node.js（ESM）+ `sharp`（オプション）で SVG → PNG 変換。`sharp` が無い CI では `--skip-render` で検証のみ実行。
- CLI 系は `scripts/automation/*.mjs` に集約し、`package.json` スクリプト (`npm run line:assets`, `line:templates`, `richmenu:register`) 経由で利用。
- 環境変数プレースホルダーは `scripts/lib/line.js` の `applyTemplatePlaceholders` で `{{VAR}}` を置換。
- Spec 連携は `codex.spec.yaml` にイベント／テンプレ名を記述し、`scripts/orchestration/reply-line-templates.mjs` が `config/line/templates` を読む構成。
- Quick Reply はシナリオ JSON 内で相対パス `quickReply": "../quick-reply.json"` を指し、ビルダーで展開。

### 1.4 Alternatives Considered
- **手動アップロード/編集**: 毎回 PNG と JSON を LINE Console に手作業で登録する案は、差分追跡や CI 検証ができないため却下。
- **Supabase など外部ストレージから配信**: JSON テンプレを DB に保存して参照する案は、GitHub Actions 内で閉じたデリバリーが崩れ、Secrets も増えるため採用せず。
- **Spec とテンプレを単一 YAML で管理**: 可読性と再利用性が落ちるため、デザイン資産は `docs/design`, 配信テンプレは `config/line/templates`, Spec は `codex.spec.yaml` に分離した。

## 2. Component Details

### 2.1 Asset Packaging (SVG → PNG)
- `scripts/automation/build-line-assets.mjs` が `docs/design/line-richmenu/front-menu.svg` を読み込み、`dist/front-menu.png` とホバー用 `front-menu-hover.png`、メタファイル `front-menu.meta.json` を生成。
- カラーパレット (`docs/design/line-richmenu/README.md:18-35`) を静的配列で検証し、予期しない色変更を早期検出。
- `sharp` が導入されていない場合でも `--skip-render` で既存 PNG の寸法と SHA-256 をチェック可能。
- GitHub Actions から `npm run line:assets` を呼ぶことでリッチメニュー登録ジョブの前提を自動化。

### 2.2 Template Build & Quick Reply Catalog
- `scripts/automation/build-line-templates.mjs` が `docs/design/line-richmenu/scenarios/*.json` を走査し、`flex` キー経由で `docs/design/line-richmenu/flex-*.json` を `messages[]` に展開。`quickReply` が文字列の場合は相対パス扱いで JSON を読み込み `items` に差し込む。
- 出力は `config/line/templates/<scenario>.json`（`npm run line:templates`）で、`reply-line-templates.mjs` が spec 評価結果から該当テンプレを読み LINE API へ送信。
- Quick Reply を追加する場合は `docs/design/line-richmenu/quick-reply.json` を編集し、シナリオで参照するだけで全テンプレに反映される。

### 2.3 Spec Mapping & Delivery
- `codex.spec.yaml` に `add_line`, `cmd_detail`, `cmd_gift`, `cmd_contact` のルールを定義し、`template: "scenario_cmd_detail"` のように `config/line/templates` のファイル名を参照。
- `.github/workflows/line-event.yml` の `reply-line-templates` ステップが `LINE_CHANNEL_ACCESS_TOKEN` を用いて Reply API に送信。`scripts/orchestration/broadcast-limits.mjs` が Supabase メタデータを見てクールダウン／上限を制御。
- リッチメニュー登録は `scripts/automation/register-line-richmenu.mjs`（`npm run richmenu:register`）で JSON + PNG を LINE API へ POST。GitHub Actions 化する場合は `richmenu-register.yml` を追加し、環境変数からトークンを受け取る。

### 2.4 Data Models / Contracts
- **Scenario JSON (`docs/design/line-richmenu/scenarios`)**  
  ```json
  {
    "description": "cmd_detail reply",
    "messages": [
      { "type": "text", "text": "..." },
      { "flex": "../flex-welcome.json" }
    ]
  }
  ```
- **Flex Template** は LINE Official Format (`type: "flex"`, `contents: bubble`) に準拠。
- **Quick Reply JSON** は `quick-reply.json` で LINE の `items` 配列をそのまま記述。ビルダーが `quickReply: { items: [...] }` を生成。
- **Asset Manifest (`front-menu.meta.json`)** は `name/file/width/height/sha256` の配列で、CI で PNG ハッシュ整合性を確認するのに用いる。

## 3. Risks & Mitigations
| リスク | 影響 | 対策 |
| --- | --- | --- |
| CI/本番で `sharp` が動かず PNG 生成失敗 | リッチメニュー登録が止まる | `--skip-render` と既存 PNG の寸法/SHA 検証を用意済み。必要なら `npm install sharp` を Actions に含める |
| Manus から URL が未供給で `{{LINE_*}}` プレースホルダーが残る | ユーザーに `{{ }}` が見える | `scripts/lib/line.js` が未解決プレースホルダーを警告。`runtime:verify` で `LINE_*` Variable をチェック |
| Spec とテンプレの乖離 | 誤ったメッセージを送信 | `codex.spec.yaml` でテンプレ名を宣言し `npm run lint:spec` で構造検証。`tests/actions/build-line-templates.test.mjs` で Quick Reply 展開をカバー |
| 画像アップロードが手動依存 | 本番差し替え時にヒューマンエラー | `npm run line:assets` と `richmenu:register` を GitHub Actions 化し、Step Summary で `richMenuId` をログに残す |
| URL/プレースホルダー乱立 | Ops が値を把握できない | `docs/runbooks/line-actions.md`／`docs/design/line-richmenu/README.md` に Variable 一覧を掲載し、`runtime:verify` にチェックを追加 |

## 4. Testing Strategy
- **Unit**  
  - `tests/actions/build-line-assets.test.mjs`: viewBox 解析 / カラーパレット検証 / PNG メタ解析。  
  - `tests/actions/build-line-templates.test.mjs`: Quick Reply 参照が `items` に展開されることを確認。  
  - 既存の `tests/actions/broadcast-limits.test.mjs`, `tests/actions/run-gemini-log-summary.test.mjs` など Spec 連携関連テスト。
- **Integration / CLI**  
  - `npm run line:assets -- --skip-render` で寸法チェック、`npm run line:templates` でシナリオビルド確認。  
  - `act -W .github/workflows/line-event.yml` を使い、`scenario_cmd_*` が LINE Reply API 呼び出しまで進むか dry-run。
- **Manual / QA**  
  - LINE Official Account Manager で PNG を登録し、端末でボタン領域とリンクを確認。  
  - `npm run line:flex -- --broadcast` など CLI を使って Flex デザインをプッシュ（`LINE_CHANNEL_ACCESS_TOKEN` が必要）。

## 5. Deployment & Migration
1. **Secrets/Variables**  
   - Secrets: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `MANUS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `PROGRESS_WEBHOOK_URL`。  
   - Variables: `MANUS_BASE_URL`, `MANUS_LINE_CONFIG_PATH`, `LINE_CASE_STUDIES_URL`, `LINE_GUIDE_URL`, `LINE_GIFT_URL`, `LINE_PROMO_COOLDOWN_DAYS`, `LINE_MAX_BROADCASTS_PER_MONTH`, `GOOGLE_SHEET_ID`, `GEMINI_SUMMARY_DRIVER`（必要に応じて）。
2. **Build & Register**  
   - `npm run line:assets` → PNG/メタ生成。  
   - `npm run line:templates` → `config/line/templates/*.json` 更新。  
   - `npm run richmenu:register -- --json docs/design/line-richmenu/front-menu.json --image dist/front-menu.png --apply-default`。
3. **GitHub Actions**  
   - `line-event.yml` で Spec 連携（`reply-line-templates.mjs`）を有効化。  
   - オプションで `.github/workflows/richmenu-register.yml` を追加し、自動登録パイプラインを整備。
4. **Rollback**  
   - `dist/front-menu.meta.json` にハッシュが残るため、Git 管理された旧版 PNG を使い `richmenu:register` を再実行。  
   - シナリオ／テンプレは `config/line/templates` を `git checkout` で戻せる。

## 6. Future Work / Open Points
- Spec 側 (`codex.spec.yaml`) に各 `scenario_cmd_*` ルールを明示的に追加（現在は最小構成）。  
- GitHub Actions で `line:assets` → `line:templates` → `richmenu:register` を連結した CI/CD を作成し、ステージング環境で検証。  
- Ops Runbook に画像差し替え手順（別 PC でのアップロード手順含む）を追記。
