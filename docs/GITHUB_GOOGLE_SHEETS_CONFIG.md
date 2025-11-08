# GitHub Google Sheets設定確認結果

## 確認日時
2025-11-08

## GitHub Secrets設定状況

### 設定済みSecrets（CLI確認結果）
- ✅ `GOOGLE_SERVICE_ACCOUNT_JSON` (設定日: 2025-11-01T14:30:18Z)
- ✅ `GOOGLE_SHEET_ID` (設定日: 2025-11-01T12:03:23Z)

### 確認コマンド
```bash
gh secret list | grep GOOGLE
```

## GitHub Variables設定状況

### Google Sheets関連のVariables
- ❌ `GOOGLE_SHEET_ID` は Variables には存在しません（Secrets として設定されています）
- ✅ これは正しい設定です（両方とも Secret 運用）

### 確認コマンド
```bash
gh variable list | grep GOOGLE
```

## ユーザー側での確認手順

実際の GitHub Secrets/Variables の値は環境によって異なる可能性があるため、以下の手順でユーザー側でも確認してください。

### 1. GitHub Web UI での確認

1. GitHub Repository → **Settings** → **Secrets and variables** → **Actions** を開く
2. **Secrets** タブで以下を確認：
   - ✅ `GOOGLE_SERVICE_ACCOUNT_JSON` が登録されているか
   - ✅ `GOOGLE_SHEET_ID` が登録されているか
   - ✅ 値が最新か（必要に応じて更新）
3. **Variables** タブ：
   - ⚠️ Google Sheets関連のVariablesは設定不要（両方とも Secret 運用のため）

### 2. 設定ファイルの確認

```bash
# required-secrets.json の確認
cat config/workflows/required-secrets.json | grep -A 3 GOOGLE_SHEET_ID

# location: "secret" になっていることを確認
```

期待される設定：
```json
{
  "key": "GOOGLE_SHEET_ID",
  "description": "Ledger spreadsheet ID",
  "location": "secret",  // ← "variable" ではなく "secret" であること
  "parameter": "GOOGLE_SHEET_ID"
}
```

### 3. ワークフローファイルの確認

```bash
# line-event.yml での参照方法を確認
grep -n "GOOGLE_SHEET_ID" .github/workflows/line-event.yml
```

期待される参照：
```yaml
GOOGLE_SHEET_ID: ${{ secrets.GOOGLE_SHEET_ID }}  # ← secrets. で参照
```

## 設定の不整合と修正

### 発見された不整合

1. **`config/workflows/required-secrets.json`**
   - 定義: `GOOGLE_SHEET_ID` を `variable` として定義
   - 実際: GitHub Secrets として設定されている
   - 修正: `secret` に変更済み

2. **`config/workflows/runtime-parameters.json`**
   - 定義: `GOOGLE_SHEET_ID` を `secret` として定義
   - 実際: GitHub Secrets として設定されている
   - 状態: ✅ 正しい

3. **`.github/workflows/line-event.yml`**
   - 参照: `${{ secrets.GOOGLE_SHEET_ID }}`
   - 実際: GitHub Secrets として設定されている
   - 状態: ✅ 正しい

### 修正内容

`config/workflows/required-secrets.json` の `GOOGLE_SHEET_ID` の `location` を `variable` から `secret` に修正しました。

## Google Sheets列構成

### 実装場所
`scripts/vendor/google/upsert-line-member.js` (151-165行目)

### 列定義
| 列 | 列名 | 型 | 説明 |
|---|---|---|---|
| A | `user_hash` | TEXT | LINEユーザーIDのハッシュ値（主キー） |
| B | `first_opt_in_at` | ISO8601 | 初回友だち追加日時 |
| C | `last_opt_in_at` | ISO8601 | 最終友だち追加日時 |
| D | `status` | TEXT | ステータス（`lead`, `active`, `engaged`, `churned`） |
| E | `cta_tags` | JSON | CTAタグの配列（JSON文字列） |
| F | `last_message` | TEXT | 最終メッセージテキスト |
| G | `last_event_type` | TEXT | 最終イベントタイプ |
| H | `raw_payload` | JSON | 生のイベントペイロード（JSON文字列） |

### シート名
- デフォルト: `line_members`
- 環境変数: `GOOGLE_SHEET_NAME` (デフォルト値: `line_members`)

## ワークフローでの使用箇所

### `.github/workflows/line-event.yml`

#### 1. 設定検証ステップ (44-58行目)
```yaml
- name: Validate configuration
  uses: ./.github/actions/validate-config
  env:
    GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
    GOOGLE_SHEET_ID: ${{ secrets.GOOGLE_SHEET_ID }}
```

#### 2. Google Sheets更新ステップ (314-328行目)
```yaml
- name: Update Google Sheets ledger
  continue-on-error: true
  env:
    GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
    GOOGLE_SHEET_ID: ${{ secrets.GOOGLE_SHEET_ID }}
    GOOGLE_SHEET_NAME: line_members
  run: |
    if [ -z "$GOOGLE_SERVICE_ACCOUNT_JSON" ] || [ -z "$GOOGLE_SHEET_ID" ]; then
      echo "ℹ️ Google Sheets credentials missing. Skipping ledger update."
      exit 0
    fi
    node scripts/vendor/google/upsert-line-member.js tmp/event.json
```

## 実装スクリプト

### 主要スクリプト
- `scripts/vendor/google/upsert-line-member.js` - Google Sheetsへの更新処理
- `scripts/reconcile-ledgers.js` - SupabaseとGoogle Sheetsの差分確認
- `scripts/sheets/upsert-line-member.js` - CLIエントリーポイント

### 認証方法
Google Service Account JSONを使用したJWT認証
- スコープ: `https://www.googleapis.com/auth/spreadsheets`
- 認証方式: OAuth 2.0 JWT Bearer Token

## 次のステップ

1. ✅ GitHub設定の確認完了
2. ✅ 設定ファイルの不整合修正完了
3. ⏳ User Tag State Serviceの拡張（Google Sheets連携）
4. ⏳ 排他制御の実装

## 参考資料

- `docs/ENV_VAR_SETUP.md` - 環境変数設定ガイド
- `config/workflows/runtime-parameters.json` - ランタイムパラメータ定義
- `config/workflows/required-secrets.json` - 必須Secrets定義
- `.sdd/specs/line-actions-orchestration/design.md` - 設計仕様

