# Miyabi CLI対話形式ガイド

## 💬 コマンドラインでMiyabiと対話

Miyabi CLIを使用して、コマンドラインから対話形式で指示を出す方法を説明します。

## 🚀 対話型スクリプトの使用（推奨）

### 基本的な使い方

対話型スクリプト `scripts/miyabi-chat.sh` を作成しました：

```bash
# スクリプトを実行
./scripts/miyabi-chat.sh

# または
bash scripts/miyabi-chat.sh
```

### 利用可能なコマンド

```
Miyabi > help

Available commands:
  issue <number>    - Process issue (e.g., 'issue 3')
  status            - Show Miyabi status
  issues            - List open issues
  help              - Show this help
  exit/quit         - Exit chat
```

### 使用例

```bash
$ ./scripts/miyabi-chat.sh

🤖 Miyabi CLI Chat Mode
=======================

Note: This uses Codex Agent (OpenAI-powered) to process issues.

Miyabi > issues
#1: プロジェクト全体の推敲と改善
#2: Manus API連動の実装
#3: LINEウェルカムメッセージ設定をGitHubにアップロード

Miyabi > issue 3
Processing Issue #3...
[実行結果が表示されます]

Miyabi > status
[Miyabiの状態が表示されます]

Miyabi > exit
Goodbye!
```

## 方法1: Codex Agentを直接実行

プロジェクト内の`scripts/codex-agent.js`を直接実行：

```bash
# 環境変数を設定
export ISSUE_NUMBER=3
export REPOSITORY=mo666-med/cursorvers_line_free_dev
export GITHUB_TOKEN=$(gh auth token)
export OPENAI_API_KEY=$(gh secret get OPENAI_API_KEY --json value -q .value)
export OPENAI_MODEL=gpt-5

# Codex Agentを実行
node scripts/codex-agent.js
```

## 方法2: Miyabi CLI Status

Miyabiの状態を確認：

```bash
# ステータスを表示
npx miyabi status

# ウォッチモード（5秒ごと自動更新）
npx miyabi status --watch
```

## 📝 環境変数の設定

対話形式で実行する前に、環境変数を設定：

```bash
# GitHubトークンを取得
export GITHUB_TOKEN=$(gh auth token)

# OpenAI APIキーを設定（GitHub Secretsから取得）
export OPENAI_API_KEY=$(gh secret get OPENAI_API_KEY --json value -q .value)

# その他の環境変数
export OPENAI_MODEL=$(gh variable get OPENAI_MODEL --json value -q .value || echo "gpt-5")
export REPOSITORY=mo666-med/cursorvers_line_free_dev
```

## 🎯 実用的な使い方

### Issue #3を処理

```bash
# 対話型スクリプトを使用（推奨）
./scripts/miyabi-chat.sh
# その後、'issue 3'と入力

# または、直接実行
export ISSUE_NUMBER=3
export REPOSITORY=mo666-med/cursorvers_line_free_dev
export GITHUB_TOKEN=$(gh auth token)
export OPENAI_API_KEY=$(gh secret get OPENAI_API_KEY --json value -q .value)
export OPENAI_MODEL=gpt-5
node scripts/codex-agent.js
```

### 複数のIssueを順次処理

```bash
for issue in 1 2 3; do
  echo "Processing Issue #$issue..."
  export ISSUE_NUMBER=$issue
  export REPOSITORY=mo666-med/cursorvers_line_free_dev
  export GITHUB_TOKEN=$(gh auth token)
  export OPENAI_API_KEY=$(gh secret get OPENAI_API_KEY --json value -q .value)
  export OPENAI_MODEL=gpt-5
  node scripts/codex-agent.js
  sleep 5
done
```

## 🔗 参考

- **対話型スクリプト**: `scripts/miyabi-chat.sh`
- **Miyabi CLI**: `npx miyabi --help`
- **Status確認**: `npx miyabi status`
- **Codex Agent**: `scripts/codex-agent.js`
- **Issue #3**: https://github.com/mo666-med/cursorvers_line_free_dev/issues/3

## ✅ 次のステップ

1. **対話型スクリプトを実行**
   ```bash
   ./scripts/miyabi-chat.sh
   ```

2. **コマンドを試す**
   ```
   Miyabi > issues
   Miyabi > issue 3
   Miyabi > status
   ```

3. **Issueのコメントを確認**
   ```bash
   gh issue view 3 --comments
   ```

コマンドラインからMiyabiと対話できます！
