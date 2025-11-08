# Cursorワークスペース固有の日本語入力問題の対処方法

## 🔍 問題の症状

- **他のCursorプロジェクトでは日本語入力が正常に動作する**
- **このプロジェクト（cursorvers_line_free_dev）のみで日本語が「coinbase」や「bebased」に置換される**
- プロジェクト固有の設定が原因の可能性が高い

## ✅ 対処方法

### 1. Cursorのワークスペース設定を確認

#### 手順

1. **Cursorを開く**
2. **設定を開く**（⌘ + ,）
3. **検索バーで「snippet」または「autocorrect」を検索**
4. **「Workspace」タブを確認**
   - ユーザー設定（User）とワークスペース設定（Workspace）が分かれています
   - ワークスペース設定に不審な設定がないか確認

#### 確認すべき設定項目

- `editor.snippetSuggestions`
- `editor.quickSuggestions`
- `editor.suggest.snippetsPreventQuickSuggestions`
- `editor.wordBasedSuggestions`
- カスタムスニペット設定

### 2. ワークスペース固有のスニペット設定を確認

#### 手順

1. **Cursorのコマンドパレットを開く**（⌘ + Shift + P）
2. **「Preferences: Open User Snippets」を実行**
3. **「New Global Snippets file...」を選択**
4. **既存のスニペットファイルを確認**
   - 日本語関連のスニペットがないか確認
   - 「coinbase」や「bebased」に関連するスニペットを削除

#### ワークスペース固有のスニペット

```bash
# ワークスペース固有のスニペット設定を確認
cat .vscode/*.code-snippets 2>/dev/null || echo "スニペットファイルが見つかりません"
```

### 3. MCPサーバーの影響を確認

このプロジェクトには`.cursor/mcp.json`が設定されています。MCPサーバーがテキスト変換を行っている可能性があります。

#### 確認方法

```bash
# MCP設定を確認
cat .cursor/mcp.json

# MCPサーバーのスクリプトを確認
cat .cursor/mcp-servers/manus-api.js | grep -i "replace\|transform\|coinbase\|bebased" || echo "問題なし"
```

#### 一時的な対処

MCPサーバーを一時的に無効化して確認：

1. `.cursor/mcp.json`を開く
2. `"disabled": true`に変更
3. Cursorを再起動
4. 日本語入力が正常に動作するか確認

### 4. 拡張機能のワークスペース固有設定を確認

#### 確認方法

1. **拡張機能パネルを開く**（⌘ + Shift + X）
2. **インストール済みの拡張機能を確認**
3. **各拡張機能の設定を確認**
   - 特に「スニペット」や「補完」関連の拡張機能
   - ワークスペース固有の設定がないか確認

#### 問題のある拡張機能を特定

1. **拡張機能を1つずつ無効化**
2. **日本語入力を試す**
3. **症状が消える拡張機能を特定**

### 5. ワークスペース設定をリセット

#### 方法1: ワークスペース設定ファイルを削除

```bash
# ワークスペース設定をリセット（注意: このプロジェクトの設定が消えます）
rm -rf .vscode/settings.json
rm -rf cursorvers_line_free_dev.code-workspace
```

#### 方法2: Cursorのワークスペースストレージをクリア

```bash
# ワークスペースIDを確認
pwd | md5 | cut -c1-16

# ワークスペースストレージを削除（注意: すべてのワークスペース設定が消えます）
# 実際のパスは環境によって異なる可能性があります
rm -rf ~/Library/Application\ Support/Cursor/User/workspaceStorage/*
```

⚠️ **注意**: この方法はすべてのワークスペース設定を削除します。必要な設定はバックアップしてください。

### 6. ワークスペースを再作成

#### 手順

1. **Cursorを閉じる**
2. **`.vscode/settings.json`と`cursorvers_line_free_dev.code-workspace`をバックアップ**
3. **ファイルを削除**
4. **Cursorでプロジェクトを再度開く**
5. **必要な設定のみ再追加**

## 🔧 トラブルシューティング手順

### ステップ1: 問題の範囲を特定

1. **このプロジェクトで日本語入力を試す**
2. **他のCursorプロジェクトで日本語入力を試す**
3. **症状がこのプロジェクトのみか確認**

### ステップ2: 設定を段階的に無効化

1. **MCPサーバーを無効化**（`.cursor/mcp.json`で`"disabled": true`）
2. **拡張機能を1つずつ無効化**
3. **ワークスペース設定を削除**

### ステップ3: 設定を再構築

問題の原因を特定したら、必要な設定のみを再追加します。

## 📝 確認コマンド

```bash
# プロジェクト固有の設定ファイルを確認
ls -la .vscode/ cursorvers_line_free_dev.code-workspace .cursor/

# MCP設定を確認
cat .cursor/mcp.json

# スニペット設定を確認
find .vscode -name "*.code-snippets" 2>/dev/null
```

## ⚠️ 注意事項

- ワークスペース設定を削除する前に、必要な設定をバックアップしてください
- MCPサーバーを無効化すると、Manus API連携が機能しなくなります
- 拡張機能を無効化する際は、必要な機能が失われないか確認してください

## 🔗 関連情報

- [VS Code ワークスペース設定](https://code.visualstudio.com/docs/editor/workspaces)
- [Cursor MCP設定](https://docs.cursor.com/mcp)

