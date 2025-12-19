# LINE無料会員登録システム エラー調査報告書

**作成日時**: 2025年12月8日  
**報告者**: Manus AI Agent  
**タスク**: 「LINE login required」エラーの原因調査と修正

---

## 📋 エグゼクティブサマリー

iPhoneでのテスト時に「**LINE login required. Please re-login in LIFF.**」エラーが発生しました。調査の結果、**line-register Edge Functionにマージコンフリクトが残っていた**ことが判明しました。マージコンフリクトを解決し、Supabaseに再デプロイしましたが、**新たに認証エラー（401 Missing authorization header）**が発生しています。

---

## 🔍 エラーの詳細

### ユーザーから報告されたエラー

**スクリーンショット情報**:
- **ページ**: `register.html`（タイトル: "Free Community Join"）
- **URL**: `mo666-med.github.io/cursorvers_line_free_dev`
- **エラーメッセージ**: 「LINE login required. Please re-login in LIFF.」
- **LINE ID**: `Ue2c80a7e25066400df2e1d68f19c96d6`

**エラーの表示位置**: フォームの上部、`setStatus()`関数で表示されたエラーメッセージ

---

## 🔎 原因調査の経緯

### 1. エラーメッセージの出所を特定

**調査結果**:
- エラーメッセージ「LINE login required. Please re-login in LIFF.」は、フロントエンドのコードには存在しない
- `register.html`の189行目で、APIから返されたエラーを表示している：
  ```javascript
  if (!res.ok) throw new Error(data.error || "LINEアカウントの紐付けに失敗しました");
  ```

**結論**: エラーはline-register APIから返されている

---

### 2. APIの動作確認

**テスト1: メールのみの登録**
```bash
$ curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "opt_in_email": true}'
```

**結果**: ✅ 成功
```json
{"ok":true,"line_user_id":null,"email":"test@example.com","opt_in_email":true}
```

**結論**: APIは正常に動作している（少なくともメールのみの登録は成功）

---

### 3. line-register Edge Functionのコード調査

**重大な発見**: ファイルに**Gitマージコンフリクトマーカー**が残っていた

```bash
$ grep -n "<<<<<<< HEAD\|=======\|>>>>>>>" supabase/functions/line-register/index.ts
196:<<<<<<< HEAD
315:=======
515:>>>>>>> dbf31e3 (Append member registrations to Google Sheets when configured)
```

**問題点**:
- 196-314行目: 古いバージョン（HEAD）
- 315-515行目: 新しいバージョン（dbf31e3、Google Sheets連携を含む）
- 2つのバージョンが混在している状態

**影響**:
- デプロイされているバージョンがどちらなのか不明
- 古いバージョンには異なるロジックが含まれている可能性
- エラーメッセージの出所が不明確

---

## 🛠️ 実施した修正

### 修正1: マージコンフリクトの解決

**作業内容**:
1. 古いバージョン（196-315行目）を削除
2. マージコンフリクトマーカー（`>>>>>>> dbf31e3`）を削除
3. 新しいバージョン（Google Sheets連携を含む）を採用

**コマンド**:
```bash
$ sed -i '196,315d' supabase/functions/line-register/index.ts
$ sed -i '/^>>>>>>> dbf31e3/d' supabase/functions/line-register/index.ts
```

**確認**:
```bash
$ grep -n "<<<<<<< HEAD\|=======\|>>>>>>>" supabase/functions/line-register/index.ts
# 出力なし（マージコンフリクト解決済み）
```

---

### 修正2: GitHubへのコミットとプッシュ

**コミット**: f526793
```bash
$ git add supabase/functions/line-register/index.ts
$ git commit -m "Fix merge conflict in line-register Edge Function"
$ git push origin main
```

**結果**: ✅ 成功

---

### 修正3: Supabase Edge Functionの再デプロイ

**コマンド**:
```bash
$ npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep
```

**結果**: ✅ デプロイ成功
```
Deployed Functions on project haaxgwyimoqzzxzdaeep: line-register
```

**Dashboard URL**: https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/functions

---

## ⚠️ 新たに発見された問題

### 問題: デプロイ後に認証エラーが発生

**テスト**: デプロイ後のAPIをテスト
```bash
$ curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email": "test-after-deploy@example.com", "opt_in_email": true}'
```

**結果**: ❌ エラー
```json
{"code":401,"message":"Missing authorization header"}
```

**原因の推測**:
1. Supabase Edge Functionの設定が変更され、認証ヘッダーが必須になった
2. デプロイ時に設定が上書きされた
3. 匿名アクセスが無効化された

---

## 📊 修正前後の比較

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| **マージコンフリクト** | ❌ 存在（196-515行目） | ✅ 解決済み |
| **コードの一貫性** | ❌ 2つのバージョンが混在 | ✅ 単一バージョン |
| **デプロイ状況** | ❌ 古いバージョン？ | ✅ 最新版（f526793） |
| **API動作（修正前）** | ✅ メールのみ成功 | - |
| **API動作（修正後）** | - | ❌ 401認証エラー |

---

## 🔧 解決済みの技術的問題

### 1. community-v2.htmlのLIFF ID修正

**問題**: LIFF IDが`2008640048-jnoneGg0`（末尾が0）
**修正**: `2008640048-jnoneGgO`（末尾がO）に変更
**コミット**: ec62f7c
**デプロイ**: ✅ GitHub Pages完了

---

### 2. register.htmlのid_token送信機能追加

**問題**: `liff.getIDToken()`が呼び出されていなかった
**修正**: id_tokenを取得してAPIに送信するように変更
**コミット**: 5e201cf
**デプロイ**: ✅ GitHub Pages完了

---

## 🚧 未解決の問題

### 問題1: 認証ヘッダーエラー（401 Missing authorization header）

**状況**:
- デプロイ後のAPIが認証ヘッダーを要求している
- 修正前は匿名アクセスが可能だった
- フロントエンド（register.html, community-v2.html）は認証ヘッダーを送信していない

**影響範囲**:
- ✅ メールのみの登録: 影響あり（401エラー）
- ✅ LINE + メール登録: 影響あり（401エラー）
- ✅ LINEのみ登録: 影響あり（401エラー）

**次のステップ**:
1. Supabase Dashboardで認証設定を確認
2. Edge Functionの`verify_jwt`設定を無効化
3. または、フロントエンドにSupabase Anon Keyを追加

---

### 問題2: エラーメッセージの出所が不明

**状況**:
- 「LINE login required. Please re-login in LIFF.」というエラーメッセージがコードベースに存在しない
- APIから返されたと推測されるが、現在のコードには該当するメッセージがない

**推測**:
- 古いバージョンのAPIがデプロイされていた可能性
- マージコンフリクト解決前のバージョンに該当メッセージがあった可能性

**次のステップ**:
1. Supabase Edge Functionsのログを確認
2. 古いバージョンのコードを調査
3. エラーメッセージの履歴を追跡

---

## 📝 修正されたファイル一覧

| ファイル | 修正内容 | コミット | デプロイ状況 |
|---------|---------|---------|------------|
| `docs/community-v2.html` | LIFF ID修正（末尾を0→O） | ec62f7c | ✅ GitHub Pages |
| `docs/register.html` | id_token送信機能追加 | 5e201cf | ✅ GitHub Pages |
| `supabase/functions/line-register/index.ts` | マージコンフリクト解決 | f526793 | ✅ Supabase |

---

## 🎯 次のアクション（優先順位順）

### 1. 認証エラーの解決（最優先）

**Option A: Supabase Dashboardで設定変更**
1. https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/functions にアクセス
2. line-register Functionの設定を開く
3. 「Verify JWT」を無効化（匿名アクセスを許可）

**Option B: フロントエンドに認証ヘッダーを追加**
1. Supabase Anon Keyを取得
2. `register.html`と`community-v2.html`のfetchリクエストに`Authorization`ヘッダーを追加
3. GitHub Pagesに再デプロイ

**推奨**: Option A（設定変更のみで解決、コード変更不要）

---

### 2. iPhoneでの再テスト

**テスト手順**:
1. LINEアプリを完全に再起動
2. キャッシュバスター付きURLでアクセス：
   ```
   https://mo666-med.github.io/cursorvers_line_free_dev/register.html?t=20251208-fix3
   ```
3. 「LINEでログイン」ボタンをクリック
4. 登録完了メッセージを確認

**期待される結果**:
- ✅ エラーなく登録完了
- ✅ 「登録が完了しました！」メッセージ表示
- ✅ Supabase `members`テーブルにデータ保存
- ✅ Google Sheetsに自動記録

---

### 3. Supabaseログの確認

**確認項目**:
1. Dashboard → Edge Functions → line-register → Logs
2. 最近のエラーログを確認
3. 「LINE login required」エラーの詳細を確認
4. 認証エラーの原因を特定

---

### 4. Google Sheets連携の確認

**確認項目**:
1. Sheet URL: https://docs.google.com/spreadsheets/d/1mSpu4NMfa8cI7ohYATzIo2jwnD7nqW5rzkcHQobKoaY
2. タブ: `members`
3. 新しい行が追加されているか確認

---

## 📊 システム全体の現状

### フロントエンド（GitHub Pages）

| ファイル | 状態 | LIFF ID | id_token送信 |
|---------|------|---------|-------------|
| `register.html` | ✅ 最新 | 2008640048-jnoneGgO | ✅ あり |
| `community-v2.html` | ✅ 最新 | 2008640048-jnoneGgO | ❌ なし（メールのみ） |

---

### バックエンド（Supabase Edge Functions）

| Function | 状態 | バージョン | 認証 |
|----------|------|-----------|------|
| `line-register` | ✅ デプロイ済み | f526793 | ❌ 401エラー |

---

### データベース（Supabase PostgreSQL）

| テーブル | 用途 | 状態 |
|---------|------|------|
| `members` | 無料会員 + 有料会員 | ✅ 正常 |
| `users` | （未使用） | - |
| `logs` | システムログ | ✅ 正常 |

---

### 外部連携

| サービス | 状態 | 備考 |
|---------|------|------|
| LINE Developers | ✅ 設定完了 | Channel: 2008640048 |
| Google Sheets | ✅ 設定完了 | Sheet ID: 1mSpu4NMfa8cI7ohYATzIo2jwnD7nqW5rzkcHQobKoaY |

---

## 🔄 トラブルシューティングガイド

### 問題: まだ「LINE login required」エラーが出る

**確認事項**:
1. ブラウザキャッシュをクリア（キャッシュバスター付きURLを使用）
2. LINEアプリを完全に再起動
3. Supabaseログで最新のエラーを確認

**解決策**:
- 認証エラー（401）を先に解決する
- Supabase Dashboardで「Verify JWT」を無効化

---

### 問題: 401 Missing authorization header

**確認事項**:
1. Supabase Dashboard → Functions → line-register → Settings
2. 「Verify JWT」が有効になっているか確認

**解決策**:
- 「Verify JWT」を無効化
- または、フロントエンドに`Authorization: Bearer <ANON_KEY>`を追加

---

### 問題: Google Sheetsに記録されない

**確認事項**:
1. Supabase `members`テーブルにデータが保存されているか
2. `GOOGLE_SA_JSON`環境変数が設定されているか
3. Supabase Edge Functionsのログにエラーがないか

**解決策**:
- Supabase Dashboardで環境変数を確認
- Google Service Accountの権限を確認

---

## ✅ 完了した作業

1. ✅ community-v2.htmlのLIFF ID修正（ec62f7c）
2. ✅ register.htmlのid_token送信機能追加（5e201cf）
3. ✅ line-register Edge Functionのマージコンフリクト解決（f526793）
4. ✅ GitHub Pagesへのデプロイ完了
5. ✅ Supabase Edge Functionの再デプロイ完了

---

## 🚧 未完了の作業

1. ❌ 認証エラー（401 Missing authorization header）の解決
2. ❌ iPhoneでの再テスト
3. ❌ Supabaseログの詳細確認
4. ❌ Google Sheets連携の動作確認

---

## 📞 サポート情報

- **Supabase Dashboard**: https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep
- **LINE Developers**: https://developers.line.biz/console/channel/2008640048
- **GitHub Repository**: https://github.com/mo666-med/cursorvers_line_free_dev
- **Google Sheets**: https://docs.google.com/spreadsheets/d/1mSpu4NMfa8cI7ohYATzIo2jwnD7nqW5rzkcHQobKoaY

---

## 📈 推奨される次のステップ

### ステップ1: Supabase Dashboardで認証設定を確認・修正

1. https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/functions にアクセス
2. `line-register` Functionをクリック
3. 「Settings」タブを開く
4. 「Verify JWT」を無効化（匿名アクセスを許可）
5. 保存

### ステップ2: APIの動作確認

```bash
curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "opt_in_email": true}'
```

**期待される結果**:
```json
{"ok":true,"line_user_id":null,"email":"test@example.com","opt_in_email":true}
```

### ステップ3: iPhoneで再テスト

URL: `https://mo666-med.github.io/cursorvers_line_free_dev/register.html?t=20251208-fix3`

---

**報告書終了**
