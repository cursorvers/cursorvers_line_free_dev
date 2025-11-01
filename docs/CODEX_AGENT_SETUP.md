# Codex-powered Agent（OpenAI API使用）

## 概要

Anthropic APIキーがない場合、Codex（Cursor）の代わりに**OpenAI API**を使用してMiyabiエージェントを駆動します。

## 設定方法

### 1. GitHub Secretsを設定

```bash
# OpenAI APIキー
gh secret set LLM_API_KEY --body "sk-..."

# OpenAI APIエンドポイント（デフォルト: https://api.openai.com/v1/chat/completions）
gh secret set LLM_ENDPOINT --body "https://api.openai.com/v1/chat/completions"
```

### 2. 動作確認

```bash
# Issueにラベルを追加して実行
gh issue edit 1 --add-label "🤖agent-execute"

# ワークフローの実行状況を確認
gh run list --workflow="autonomous-agent.yml" --limit 3
```

## 実装内容

### Codex Agent (`scripts/codex-agent.js`)

OpenAI APIを使用して：
1. **Issueを取得**: GitHub APIからIssue情報を取得
2. **Issueを分析**: GPT-4でIssueを分析し、実装計画を提案
3. **コードを生成**: 分析結果に基づいてコードを生成
4. **Issueにコメント**: 結果をIssueにコメントとして追加

### ワークフローの変更

- ✅ `ANTHROPIC_API_KEY`の代わりに`LLM_API_KEY`を使用
- ✅ `npx miyabi`の代わりに`node scripts/codex-agent.js`を実行
- ✅ OpenAI APIを使用してエージェントを駆動

## 動作フロー

```
Issueに🤖agent-executeラベル追加
    ↓
GitHub Actionsワークフロー実行
    ↓
scripts/codex-agent.js実行
    ↓
1. GitHub APIでIssue取得
2. OpenAI APIでIssue分析
3. OpenAI APIでコード生成
4. Issueにコメント追加
```

## 必要なSecrets

- ✅ `LLM_API_KEY` - OpenAI APIキー（必須）
- ✅ `LLM_ENDPOINT` - OpenAI APIエンドポイント（オプション、デフォルトあり）
- ✅ `GITHUB_TOKEN` - GitHub APIトークン（自動設定）

## 使用モデル

- **デフォルト**: `gpt-4o`
- **変更可能**: `scripts/codex-agent.js`の`model`パラメータを変更

## 注意事項

- OpenAI APIキーが必要です
- API使用量に応じて費用が発生します
- コード生成は提案であり、自動実装は行いません

## 次のステップ

1. **OpenAI APIキーを設定**
   ```bash
   gh secret set LLM_API_KEY --body "sk-..."
   ```

2. **動作確認**
   ```bash
   gh issue edit 1 --add-label "🤖agent-execute"
   ```

3. **結果を確認**
   - Issueのコメントを確認
   - ワークフローのログを確認

