# Miyabi対話形式指示ガイド

## ✅ 対話形式での指示方法

Miyabiに対話形式で指示を出すには、**Issueコメントで`/agent`コマンドを使用**します。

## 📝 基本的な使い方

### 1. `/agent`コマンドで指示

Issueにコメントを追加する際、**行の先頭に`/agent`を付ける**と、Miyabiが実行されます：

```bash
gh issue comment 3 --body "/agent

Miyabiさん、こんにちは！

LINEウェルカムメッセージ設定をGitHubにアップロードする作業について、質問があります。

1. Manus APIを使ってLINE Developers Consoleにログインできますか？
2. 設定ファイルはどのような形式で保存すればいいですか？
3. いつまでに完了できますか？

よろしくお願いします！"
```

### 2. 対話の例

#### 質問形式
```
/agent

現在の進捗状況を教えてください。
```

#### 追加指示
```
/agent

以下の点も考慮してください：
- 設定ファイルはJSON形式で保存
- バージョン管理を忘れずに
- ドキュメントも更新してください
```

#### 詳細な指示
```
/agent

LINEウェルカムメッセージ設定を取得して、以下を実行してください：

1. Manus APIを使用してLINE Developers Consoleにログイン
2. ウェルカムメッセージ設定を取得
3. config/line/welcome-message.jsonに保存
4. README.mdに設定内容を追加
```

## 🔍 ワークフローの動作

`.github/workflows/autonomous-agent.yml`は、以下の条件で実行されます：

```yaml
# Check if comment contains /agent command
if [ "${{ github.event_name }}" = "issue_comment" ]; then
  COMMENT="${{ github.event.comment.body }}"
  if echo "$COMMENT" | grep -q "^/agent"; then
    SHOULD_EXECUTE="true"
    ISSUE_NUMBER="${{ github.event.issue.number }}"
    echo "Comment triggered agent execution for issue #${ISSUE_NUMBER}"
  fi
end
```

**重要**: `/agent`は**行の先頭**に必要です。

## ✅ 実行例

Issue #3に`/agent`コマンド付きコメントを追加しました：

```
/agent

Miyabiさん、こんにちは！

LINEウェルカムメッセージ設定をGitHubにアップロードする作業について、質問があります。

1. Manus APIを使ってLINE Developers Consoleにログインできますか？
2. 設定ファイルはどのような形式で保存すればいいですか？
3. いつまでに完了できますか？

よろしくお願いします！
```

これにより、Miyabiが実行を開始します。

## 🔗 確認方法

```bash
# 最新の実行を確認
gh run list --workflow="autonomous-agent.yml" --limit 5

# Issueのコメントを確認
gh issue view 3 --comments
```

## 📚 参考

- **Issue #3**: https://github.com/mo666-med/cursorvers_line_free_dev/issues/3
- **ワークフロー**: `.github/workflows/autonomous-agent.yml`
- **GitHub Actions**: https://github.com/mo666-med/cursorvers_line_free_dev/actions

## ⚠️ 注意事項

1. **`/agent`は行の先頭に必要** - 行の途中にあると認識されません
2. **コメントは公開されます** - Issueのコメントは誰でも見られます
3. **実行には時間がかかります** - Miyabiが処理を開始するまで数分かかる場合があります

## 🎯 次のステップ

Issue #3に`/agent`コマンド付きコメントを追加しました。数分後にGitHub Actionsページで実行結果を確認してください。
