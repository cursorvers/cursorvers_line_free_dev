# Manus API問い合わせ - GitHub Actions実行ガイド

## 概要

GitHub Actionsを介してManus APIへの問い合わせを実行し、接続情報を確認します。

## 実行方法

### 1. GitHub Actionsから実行

1. GitHubリポジトリの「Actions」タブを開く
2. 左サイドバーから「Manus API Inquiry」ワークフローを選択
3. 「Run workflow」ボタンをクリック
4. オプション設定：
   - **Create GitHub Issue with results**: `true`（デフォルト）にすると結果をIssueに投稿
5. 「Run workflow」をクリックして実行

### 2. コマンドラインから実行

```bash
# GitHub CLIを使用
gh workflow run manus-api-inquiry.yml

# Issue作成を無効にする場合
gh workflow run manus-api-inquiry.yml -f create_issue=false
```

### 3. ローカルで実行

```bash
# API Keyなしで実行（エンドポイントの確認のみ）
node scripts/manus/inquire-api.mjs

# API Keyありで実行（認証テストも含む）
MANUS_API_KEY="your-api-key" node scripts/manus/inquire-api.mjs
```

## 確認内容

このワークフローは以下の項目を確認します：

1. **エンドポイント確認**
   - `https://api.manus.ai`
   - `https://api.manus.im`
   - どちらが正しいエンドポイントか確認

2. **Health Check**
   - `/health`エンドポイントの存在確認

3. **API Version**
   - `/v1`エンドポイントの存在確認

4. **認証テスト**（API Keyが設定されている場合）
   - `/v1/tasks`へのGETリクエスト
   - `API_KEY`ヘッダーでの認証確認

## 結果の確認

### GitHub Actions実行後

1. **Artifact**
   - `manus-api-inquiry-results` Artifactをダウンロード
   - `tmp/manus-inquiry-results.json`: JSON形式の詳細結果
   - `tmp/manus-inquiry-summary.md`: Markdown形式のサマリー

2. **GitHub Issue**（`create_issue: true`の場合）
   - 自動的にIssueが作成されます
   - ラベル: `manus-api`, `inquiry`, `devops`

3. **Step Summary**
   - ワークフロー実行画面の「Summary」セクションに結果が表示されます

### ローカル実行後

- `tmp/manus-inquiry-results.json`: JSON形式の詳細結果
- `tmp/manus-inquiry-summary.md`: Markdown形式のサマリー

## 結果の解釈

### 成功パターン

- エンドポイントが応答し、適切なステータスコードを返す
- 認証テストが成功する（API Keyが有効）

### 失敗パターン

- エンドポイントが存在しない（404）
- 認証エラー（401/403）
- ネットワークエラー（DNS解決失敗など）

## 次のステップ

問い合わせ結果に基づいて：

1. **正しいエンドポイントの特定**
   - 結果を確認し、動作するエンドポイントを特定

2. **設定の更新**
   - `scripts/lib/manus-api.js`のデフォルトURLを更新
   - ドキュメントを更新

3. **GitHub Variables/Secretsの設定**
   - `MANUS_BASE_URL` Variableを設定
   - `MANUS_API_KEY` Secretを設定

4. **再検証**
   - `npm run runtime:verify`で設定確認
   - 実際のAPI呼び出しテスト

## トラブルシューティング

### API Keyが設定されていない

- 認証テストはスキップされます
- エンドポイントの確認のみ実行されます

### すべてのテストが失敗する

- ネットワーク接続を確認
- DNS解決が正常か確認
- ファイアウォール設定を確認

### Issueが作成されない

- `create_issue: false`に設定されていないか確認
- GitHub Actionsの権限を確認（`issues: write`が必要）

## 関連ファイル

- `.github/workflows/manus-api-inquiry.yml`: ワークフロー定義
- `scripts/manus/inquire-api.mjs`: 問い合わせスクリプト
- `docs/MANUS_API_INQUIRY.md`: 問い合わせ項目の詳細

