# Cursor日本語入力・変換問題の対処方法

## 🔍 問題の症状

- Cursorのエディタやチャット欄で日本語を入力しても変換できない
- 変換候補が表示されない
- 日本語入力メソッド（IME）が動作しない

## ✅ 対処方法

### 1. Cursorの設定を確認・更新

`.vscode/settings.json`に以下の設定が含まれているか確認：

```json
{
  "editor.wordBasedSuggestions": "off",
  "editor.suggest.snippetsPreventQuickSuggestions": false,
  "editor.inlineSuggest.enabled": true,
  "editor.suggest.showWords": false,
  "files.encoding": "utf8"
}
```

### 2. 入力メソッドの確認

**macOSの場合**:
1. **システム設定** → **キーボード** → **入力ソース**
2. 日本語入力が有効になっているか確認
3. ⌘ + Space で入力メソッドを切り替え

**確認コマンド**:
```bash
# 現在の入力ソースを確認
defaults read ~/Library/Preferences/com.apple.HIToolbox.plist AppleSelectedInputSources
```

### 3. Cursorを再起動

設定を変更した後は、Cursorを完全に再起動してください：

```bash
# Cursorを終了
killall Cursor

# 再度起動
open -a Cursor
```

### 4. 環境変数の確認

ターミナルで以下を確認：

```bash
echo $LANG
echo $LC_ALL

# 正しく設定されていない場合
export LANG=ja_JP.UTF-8
export LC_ALL=ja_JP.UTF-8
```

### 5. 拡張機能の影響を確認

日本語入力に影響する可能性のある拡張機能を無効化：

```bash
# 拡張機能無効で起動（テスト用）
cursor --disable-extensions
```

### 6. ワークスペース設定の確認

プロジェクト固有の設定（`.vscode/settings.json`）が正しく読み込まれているか確認：

```bash
# 設定ファイルの存在確認
cat .vscode/settings.json | grep -i "japanese\|ime\|encoding"
```

## 🔧 トラブルシューティング手順

### ステップ1: 問題の範囲を特定

1. **ターミナルで日本語入力**を試す
2. **メモ帳で日本語入力**を試す
3. **Cursorのエディタで日本語入力**を試す
4. **Cursorのチャット欄で日本語入力**を試す

どの場所で症状が出るかで原因を絞り込みます。

### ステップ2: 入力メソッドを切り替え

1. ⌘ + Space で入力メソッドを切り替え
2. **英語モード**に切り替えて日本語入力
3. **別のIME**（例: Google日本語入力）に切り替えて試す

### ステップ3: Cursorの設定をリセット

```bash
# Cursorの設定をバックアップ
cp ~/Library/Application\ Support/Cursor/User/settings.json ~/Library/Application\ Support/Cursor/User/settings.json.bak

# 設定をリセット（必要に応じて）
# 注意: すべての設定がリセットされます
```

## 📝 確認コマンド

```bash
# ロケール設定確認
locale

# 環境変数確認
echo $LANG $LC_ALL

# 入力ソース確認
defaults read ~/Library/Preferences/com.apple.HIToolbox.plist AppleSelectedInputSources

# Cursorの設定確認
cat .vscode/settings.json | grep -i "encoding\|ime\|japanese"
```

## ⚠️ 注意事項

- Cursorを再起動しないと設定が反映されない場合があります
- ワークスペース設定（`.vscode/settings.json`）はプロジェクトごとに適用されます
- ユーザー設定とワークスペース設定が競合する場合、ワークスペース設定が優先されます

## 🔗 関連情報

- [VS Code 日本語入力設定](https://code.visualstudio.com/docs/getstarted/settings)
- [macOS 日本語入力の設定](https://support.apple.com/guide/mac-help/use-input-sources-on-mac-mchlp1406/mac)

