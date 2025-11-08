# 自然言語対話機能

## 🎯 機能概要

Miyabiチャットスクリプトが自然言語での指示に対応しました。

## 💬 使い方

### 基本的な使い方

`Miyabi >`プロンプトに、日本語で自然に指示を入力できます：

```
Miyabi > Issue #3を処理して
Miyabi > オープンなIssue一覧を見せて
Miyabi > Issue #2を実行して
Miyabi > 新しいIssueを作成して
```

### 例

**コマンド形式:**
```
Miyabi > issue 3
Miyabi > issues
```

**自然言語形式:**
```
Miyabi > Issue #3を処理してください
Miyabi > オープンなIssueの一覧を表示してください
Miyabi > Issue #2を実行して、結果を確認したい
```

## 🔧 技術仕様

### 自然言語処理フロー

1. ユーザーが自然言語で指示を入力
2. OpenAI API（GPT-5）が指示を解析
3. 適切なアクションを実行
4. 結果を表示

### 利用可能なアクション

- **Issue一覧の表示**: "issues" または "issue一覧"
- **特定Issueの処理**: "issue 3を処理して" または "Issue #3を実行"
- **Issueの作成**: "新しいIssueを作成" または "Issueを作成して"
- **Issueの更新**: "Issue #3を更新" または "Issue #3にコメント追加"

## 📝 スクリプト

- **メインスクリプト**: `scripts/miyabi-chat.sh`
- **自然言語エージェント**: `scripts/natural-language-agent.js`

## ✅ 確認方法

1. スクリプトを実行:
   ```bash
   ./scripts/miyabi-chat.sh
   ```

2. `Miyabi >`プロンプトで自然言語入力:
   ```
   Miyabi > Issue #3を処理して
   ```

3. OpenAI APIが指示を解析して実行

## 🔗 参考

- **環境変数**: `OPENAI_API_KEY`が必要
- **モデル**: `OPENAI_MODEL`（デフォルト: `gpt-5`）
- **リポジトリ**: `mo666-med/cursorvers_line_free_dev`

