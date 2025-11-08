# Cursor IDE UI カスタマイズ設定

## 📋 概要

このドキュメントは、Cursor IDEのUIをカスタマイズして、左側のサイドバーにGit Graph拡張機能を表示し、チャット欄にターミナルを表示するための設定方法を説明します。

## ⚠️ 重要な制限事項

**チャット欄にターミナルを直接表示することはできません**

Cursor IDEのチャット欄は独立したパネルなので、ターミナルをその中に直接表示することは技術的に不可能です。

**代替案**:
- ターミナルをチャット欄の下に配置
- ターミナルをチャット欄の横に配置
- ターミナルをチャット欄の上に配置

## 🎯 推奨されるUIレイアウト

```
┌─────────────────────────────────────────────────────────┐
│  Cursor IDE                                             │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Git Graph│        エディタ                              │
│ (左側)   │                                              │
│          │                                              │
│          ├──────────────────────────────────────────────┤
│          │        チャット欄 (右側)                     │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│ ターミナル (下部)                                       │
└─────────────────────────────────────────────────────────┘
```

## 📋 セットアップ手順

### 1. Git Graph拡張機能のインストール

1. Cursor IDEを開く
2. 左側のサイドバーから「拡張機能」アイコンをクリック
3. 検索バーに「Git Graph」と入力
4. 「Git Graph」拡張機能をインストール

**拡張機能ID**: `mhutchie.git-graph`

### 2. ワークスペース設定ファイルの作成

プロジェクトルートに`.code-workspace`ファイルを作成します：

```json
{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {
    "git-graph.openRepoInsteadOfRefresh": true,
    "workbench.sideBar.location": "left",
    "workbench.panel.defaultLocation": "bottom"
  }
}
```

### 3. プロジェクト設定ファイルの作成

`.vscode/settings.json`ファイルを作成します：

```json
{
  "git-graph.openRepoInsteadOfRefresh": true,
  "workbench.sideBar.location": "left",
  "workbench.panel.defaultLocation": "bottom",
  "workbench.panel.bottom.size": 300
}
```

### 4. UIレイアウトの手動調整

1. **Git Graphを左側のサイドバーに表示**
   - 左側のサイドバーから「Git Graph」アイコンをクリック
   - または、コマンドパレット（`Cmd+Shift+P`）から「Git Graph: View Git Graph」を選択

2. **ターミナルを下部に表示**
   - `Ctrl + \``（バッククォート）を押してターミナルを表示
   - または、メニューバーから「表示」→「ターミナル」を選択

3. **チャット欄を右側に表示**
   - Cursorのチャットアイコンをクリック
   - または、`Cmd+L`（macOS）でチャットを開く
   - チャット欄は通常、右側に表示されます

## 🎨 カスタマイズオプション

### Git Graphの表示設定

```json
{
  "git-graph.openRepoInsteadOfRefresh": true,
  "git-graph.maxDepthOfRepoSearch": 3,
  "git-graph.commitDetailsViewLocation": "Docked",
  "git-graph.uncommittedChanges.showStatusBar": true
}
```

### パネルのサイズ調整

```json
{
  "workbench.panel.bottom.size": 300,  // ターミナルの高さ（ピクセル）
  "workbench.sideBar.width": 300        // サイドバーの幅（ピクセル）
}
```

### エディタのレイアウト設定

```json
{
  "workbench.editor.splitInGroupLayout": "horizontal",
  "workbench.editor.enablePreview": false
}
```

## 🔧 キーボードショートカット

### Git Graph

- `Cmd+Shift+P` → 「Git Graph: View Git Graph」: Git Graphを開く
- `Cmd+Shift+G` → Git Graphサイドバーにフォーカス

### ターミナル

- `Ctrl + \``（バッククォート）: ターミナルを表示/非表示
- `Cmd+J`（macOS）: パネル（ターミナル含む）を表示/非表示

### チャット

- `Cmd+L`（macOS）: Cursorチャットを開く
- `Cmd+K`（macOS）: クイックアクション

## 📝 設定ファイルの場所

### ワークスペース設定

- **ファイル**: `cursorvers_line_free_dev.code-workspace`
- **場所**: プロジェクトルート

### プロジェクト設定

- **ファイル**: `.vscode/settings.json`
- **場所**: プロジェクトルートの`.vscode`ディレクトリ

### ユーザー設定

- **macOS**: `~/Library/Application Support/Cursor/User/settings.json`
- **Windows**: `%APPDATA%\Cursor\User\settings.json`
- **Linux**: `~/.config/Cursor/User/settings.json`

## 🚀 クイックスタート

1. **ワークスペースファイルを開く**
   ```bash
   # Cursorでワークスペースファイルを開く
   cursor cursorvers_line_free_dev.code-workspace
   ```

2. **Git Graphを開く**
   - 左側のサイドバーから「Git Graph」アイコンをクリック
   - または、コマンドパレットから「Git Graph: View Git Graph」を選択

3. **ターミナルを開く**
   - `Ctrl + \``を押してターミナルを表示

4. **チャットを開く**
   - `Cmd+L`を押してチャットを開く

## 💡 ヒント

### ターミナルをチャット欄の下に配置

1. ターミナルを開く（`Ctrl + \``）
2. ターミナルのタイトルバーを右クリック
3. 「Move Panel Right」を選択
4. これで、ターミナルがチャット欄の下に配置されます

### パネルサイズの調整

- ターミナルとチャット欄の境界線をドラッグしてサイズを調整
- または、設定で`workbench.panel.bottom.size`を変更

## ❓ トラブルシューティング

### Git Graphが表示されない

1. Git Graph拡張機能がインストールされているか確認
2. Gitリポジトリが初期化されているか確認（`git init`）
3. Cursorを再起動

### ターミナルが表示されない

1. キーボードショートカットを確認（`Ctrl + \``）
2. メニューバーから「表示」→「ターミナル」を選択
3. 設定で`workbench.panel.defaultLocation`が正しく設定されているか確認

### チャット欄が表示されない

1. `Cmd+L`を押してチャットを開く
2. Cursorのチャットアイコンをクリック
3. Cursorを再起動

## 📚 参考資料

- [Git Graph Extension Documentation](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)
- [VS Code Workspace Settings](https://code.visualstudio.com/docs/editor/workspaces)
- [Cursor IDE Documentation](https://cursor.sh/docs)

## 🔗 関連ファイル

- `cursorvers_line_free_dev.code-workspace`: ワークスペース設定ファイル
- `.vscode/settings.json`: プロジェクト設定ファイル

