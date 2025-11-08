# Miyabi進捗モニタリングガイド

## 📊 Miyabiの進捗をモニタリングする方法

Miyabiの実行状況と進捗を確認する方法をまとめました。

## 🚀 リアルタイムモニタリング

### 1. Miyabi Statusコマンド（推奨）

```bash
# 現在の状態を確認
npx miyabi status

# ウォッチモード（5秒ごと自動更新）
npx miyabi status --watch

# JSON形式で出力（スクリプト用）
npx miyabi status --json
```

### 2. GitHub Actionsで確認

```bash
# 最新の実行を確認
gh run list --workflow="autonomous-agent.yml" --limit 10

# Issueイベントでトリガーされた実行のみ
gh run list --workflow="autonomous-agent.yml" --limit 10 --json event,status,conclusion,createdAt --jq '.[] | select(.event == "issues")'

# 実行中のワークフローのみ
gh run list --workflow="autonomous-agent.yml" --limit 10 --json status --jq '.[] | select(.status == "in_progress" or .status == "queued")'

# 特定の実行の詳細ログ
gh run view <run-id> --log
```

### 3. Issueの状態確認

```bash
# Issue #1の状態
gh issue view 1

# Issueのコメントを確認
gh issue view 1 --comments

# Issueのラベル変更履歴
gh issue view 1 --json labels --jq '.labels[] | .name'
```

### 4. Pull Requestの確認

```bash
# 作成されたPRを確認
gh pr list

# エージェントが作成したPRを確認
gh pr list --label "🤖agent-generated"

# 特定のPRの詳細
gh pr view <pr-number>
```

## 📈 進捗確認のポイント

### Miyabiの実行フロー

```
Issue作成/検出
    ↓
CoordinatorAgent（タスク分解・DAG構築）
    ↓ 並行実行
├─ IssueAgent（分析・Label付与）
├─ CodeGenAgent（GPT-5でコード生成）
├─ ReviewAgent（品質チェック≥80点）
└─ TestAgent（テスト実行）
    ↓
PRAgent（Draft PR作成）
    ↓
人間レビュー待ち
```

### 各ステージの確認方法

#### 1. Issue分析段階（IssueAgent）

```bash
# Issueにラベルが追加されているか確認
gh issue view 1 --json labels --jq '.labels[] | .name'

# 期待されるラベル:
# - 📚 type:docs
# - 🎯 phase:planning
# - 📊 priority:P2-Medium
# - 🏗️ state:implementing（実行中）
```

#### 2. コード生成段階（CodeGenAgent）

```bash
# GitHub Actionsの実行ログを確認
gh run view <run-id> --log | grep -A 10 "Codex\|GPT\|Generating"

# Issueにコメントが追加されているか確認
gh issue view 1 --comments --json comments --jq '.comments[-1] | {body: .body, created: .createdAt}'
```

#### 3. 品質チェック段階（ReviewAgent）

```bash
# ワークフローの実行結果を確認
gh run list --workflow="autonomous-agent.yml" --limit 5 --json conclusion --jq '.[] | .conclusion'

# 期待される結果: "success"
```

#### 4. PR作成段階（PRAgent）

```bash
# 作成されたPRを確認
gh pr list --label "🤖agent-generated"

# PRの詳細
gh pr view <pr-number>
```

## 🔍 詳細なログ確認

### GitHub Actionsの実行ログ

```bash
# 最新の実行IDを取得
LATEST_RUN=$(gh run list --workflow="autonomous-agent.yml" --limit 1 --json databaseId --jq '.[0].databaseId')

# ログを確認
gh run view $LATEST_RUN --log

# 特定のステップのログのみ
gh run view $LATEST_RUN --log | grep -A 20 "Execute Codex Agent"
```

### Issueのコメント履歴

```bash
# すべてのコメントを確認
gh issue view 1 --comments --json comments --jq '.comments[] | {created: .createdAt, author: .author.login, body: .body}'

# 最新のコメントのみ
gh issue view 1 --comments --json comments --jq '.comments[-1] | {created: .createdAt, author: .author.login, body: .body}'
```

## 📊 進捗状況の可視化

### 現在の状態確認

```bash
# Miyabi Statusを実行
npx miyabi status

# 出力例:
# 📊 Agentic OS Status - mo666-med/cursorvers_line_free_dev
# 
# ┌──────────────────┬───────┬────────────┐
# │ State            │ Count │ Status     │
# ├──────────────────┼───────┼────────────┤
# │ 📥 Pending       │ 2     │ ⏳ Waiting │
# ├──────────────────┼───────┼────────────┤
# │ 🔍 Analyzing     │ 0     │ ✓ Clear    │
# ├──────────────────┼───────┼────────────┤
# │ 🏗️  Implementing │ 1     │ ⚡ Working │
# ├──────────────────┼───────┼────────────┤
# │ 👀 Reviewing     │ 0     │ ✓ Clear    │
# ├──────────────────┼───────┼────────────┤
# │ 🚫 Blocked       │ 0     │ ✓ Clear    │
# ├──────────────────┼───────┼────────────┤
# │ ⏸️  Paused       │ 0     │ ✓ Clear    │
# └──────────────────┴───────┴────────────┘
```

### ウォッチモードでリアルタイム監視

```bash
# 5秒ごとに自動更新
npx miyabi status --watch
```

## 🎯 現在の進捗確認コマンド

### ワンライナーで進捗確認

```bash
# Issue #1の状態とコメントを確認
echo "=== Issue #1 Status ===" && \
gh issue view 1 --json number,title,labels,comments --jq '{number: .number, title: .title, labels: [.labels[].name], comment_count: (.comments | length), latest_comment: (.comments[-1] | {created: .createdAt, author: .author.login})}' && \
echo "\n=== Latest Workflow Runs ===" && \
gh run list --workflow="autonomous-agent.yml" --limit 3 --json event,status,conclusion,createdAt --jq '.[] | select(.event == "issues") | {status: .status, conclusion: .conclusion, created: .createdAt}'
```

## 📝 進捗レポートの自動生成

### 進捗確認スクリプト

```bash
#!/bin/bash
# miyabi-progress.sh

echo "📊 Miyabi進捗レポート - $(date)"
echo "=================================="

echo "\n🔍 Issue Status:"
gh issue list --json number,title,labels,state --jq '.[] | select(.state == "OPEN") | "  #\(.number): \(.title)\n    Labels: \(.labels | map(.name) | join(", "))"'

echo "\n🚀 Workflow Status:"
gh run list --workflow="autonomous-agent.yml" --limit 5 --json event,status,conclusion,createdAt --jq '.[] | select(.event == "issues") | "  [\(.status)] \(.createdAt)"'

echo "\n📝 Pull Requests:"
gh pr list --json number,title,state --jq '.[] | "  #\(.number): \(.title) [\(.state)]"'

echo "\n✨ Miyabi Status:"
npx miyabi status --json 2>/dev/null || echo "  Status unavailable"
```

## 🔗 便利なリンク

- **GitHub Actions**: https://github.com/mo666-med/cursorvers_line_free_dev/actions
- **Issue #1**: https://github.com/mo666-med/cursorvers_line_free_dev/issues/1
- **Pull Requests**: https://github.com/mo666-med/cursorvers_line_free_dev/pulls

## 💡 ヒント

1. **ウォッチモード**: `npx miyabi status --watch`でリアルタイム監視
2. **JSON出力**: `--json`オプションでスクリプト処理可能
3. **GitHub CLI**: `gh`コマンドで詳細な情報を取得可能
4. **ログ確認**: 実行ログで具体的な処理内容を確認可能

Miyabiの進捗を効率的にモニタリングできます！

