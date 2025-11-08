# GitHub Secrets設定ガイド

## 🔗 設定ページ

**GitHub Secrets設定ページ**: https://github.com/mo666-med/cursorvers_line_free_dev/settings/secrets/actions

## 📋 設定手順

### 1. ページにアクセス

上記のURLにアクセスするか、以下の手順でアクセス：

1. GitHubリポジトリ: https://github.com/mo666-med/cursorvers_line_free_dev
2. **Settings**タブをクリック
3. 左サイドバーで **Secrets and variables** → **Actions** をクリック
4. **Secrets**タブを選択

### 2. New repository secretをクリック

ページ右上の **New repository secret** ボタンをクリック

### 3. 設定内容

#### `LLM_API_KEY` を設定

- **Name**: `LLM_API_KEY`
- **Secret**: `sk-...` (OpenAI APIキー)
- **Add secret** をクリック

#### `LLM_ENDPOINT` を設定（オプション）

- **Name**: `LLM_ENDPOINT`
- **Secret**: `https://api.openai.com/v1/chat/completions`
- **Add secret** をクリック

## ✅ 設定後の確認

### コマンドで確認

```bash
# Secretsの確認
gh secret list

# Variablesの確認
gh variable list
```

### 確認すべき項目

- ✅ `LLM_API_KEY` - OpenAI APIキー（必須）
- ✅ `LLM_ENDPOINT` - OpenAI APIエンドポイント（オプション）
- ✅ `OPENAI_MODEL` - Variablesで`gpt-5`（設定済み）

## 🚀 設定後の動作確認

### 1. Issueにラベルを追加

```bash
gh issue edit 1 --add-label "🤖agent-execute"
```

### 2. ワークフローの実行を確認

```bash
# 実行状況を確認
gh run list --workflow="autonomous-agent.yml" --limit 3

# 最新の実行ログを確認
gh run view $(gh run list --workflow="autonomous-agent.yml" --limit 1 --json databaseId --jq '.[0].databaseId') --log
```

## 📝 現在の設定状況

### GitHub Secrets
- ✅ `MANUS_API_KEY`
- ✅ `PROGRESS_WEBHOOK_URL`
- ✅ `SUPABASE_KEY`
- ❌ `LLM_API_KEY` (要設定)

### GitHub Variables
- ✅ `OPENAI_MODEL`: `gpt-5`
- ✅ `SUPABASE_URL`

## ⚠️ 注意事項

### OpenAI APIキーの取得方法

1. https://platform.openai.com/api-keys にアクセス
2. ログイン
3. 「Create new secret key」をクリック
4. APIキーをコピー（`sk-...`で始まる文字列）
5. 上記の設定ページで設定

### セキュリティ

- Secretsは暗号化されて保存されます
- 一度設定すると、値は確認できません（更新のみ可能）
- 誤って設定した場合は、削除して再設定してください

## 🎯 設定完了後

`LLM_API_KEY`を設定すれば、GPT-5でエージェントが動作します！

```bash
# 設定確認
gh secret list | grep LLM_API_KEY

# 動作確認
gh issue edit 1 --add-label "🤖agent-execute"
```

