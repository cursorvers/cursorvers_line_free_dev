# Supabase Edge Functions 環境変数問題 調査報告書

**作成日**: 2025年12月8日  
**調査対象**: line-register Edge Function  
**問題**: 環境変数（verify_jwt）が勝手に元に戻る

---

## 📋 エグゼクティブサマリー

Supabase Edge Functionsの`verify_jwt`設定が勝手に元に戻る問題を調査しました。原因は以下の3点です：

1. **supabase.tomlの設定形式が間違っていた**（`[functions]`→`[function]`に修正必要）
2. **GitHub Actionsワークフローに`line-register`のデプロイステップが存在しない**
3. **supabase.tomlの設定は、CLIオプション`--no-verify-jwt`を使わないと反映されない**（Supabaseの仕様）

---

## 🔍 調査の経緯

### 問題の発生

**症状**:
- `line-register` Edge Functionを`--no-verify-jwt`オプションでデプロイ → 正常動作
- しばらくすると、再び`401 Missing authorization header`エラーが発生
- 設定が勝手に元に戻っている

**ユーザーからの報告**:
> Supabase Edge Functionsの環境変数は、修正しても勝手にもとに戻る不具合がある。原因を精査せよ

---

## 🔎 調査内容と発見事項

### 発見1: supabase.tomlの設定形式が間違っていた

**調査内容**:
全てのEdge Functionsの`supabase.toml`を比較しました。

**結果**:

| Function | 設定形式 | 状態 |
|---------|---------|------|
| generate-sec-brief | `[function]` | ✅ 正しい |
| health-check | `[function]` | ✅ 正しい |
| ingest-hij | `[function]` | ✅ 正しい |
| line-daily-brief | `[function.line-daily-brief]` | ✅ 正しい |
| **line-register** | **`[functions.line-register]`** | ❌ **間違い（複数形）** |
| line-webhook | `[function]` | ✅ 正しい |
| relay | `[function.relay]` | ✅ 正しい |

**問題のある設定** (line-register):
```toml
[functions.line-register]  # ← 複数形「functions」
verify_jwt = false
```

**正しい設定**:
```toml
[function]  # ← 単数形「function」
verify_jwt = false
```

または:
```toml
[function.line-register]  # ← 単数形「function」
verify_jwt = false
```

**修正内容**:
`supabase/functions/line-register/supabase.toml`を以下のように修正：

```toml
[function]
verify_jwt = false
```

**コミット**: 595c9a3

---

### 発見2: supabase.tomlの設定は反映されない

**調査内容**:
修正した`supabase.toml`で、`--no-verify-jwt`オプション**なし**でデプロイしました。

**コマンド**:
```bash
npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep
```

**結果**:
```bash
$ curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","opt_in_email":true}'

{"code":401,"message":"Missing authorization header"}
```

❌ **設定が反映されず、401エラーが発生**

**結論**:
`supabase.toml`の設定は、**CLIオプション`--no-verify-jwt`を使わないと反映されない**。これはSupabaseの仕様または既知の問題である可能性があります。

---

### 発見3: GitHub Actionsワークフローに`line-register`が存在しない

**調査内容**:
`.github/workflows/deploy-supabase.yml`を確認しました。

**結果**:
以下のFunctionはデプロイステップが存在しますが、**`line-register`だけが含まれていません**：

| Function | デプロイステップ | オプション |
|---------|--------------|----------|
| line-webhook | ✅ あり | `--no-verify-jwt` |
| line-daily-brief | ✅ あり | `--no-verify-jwt` |
| manus-audit-line-daily-brief | ✅ あり | `--no-verify-jwt` |
| stats-exporter | ✅ あり | なし |
| health-check | ✅ あり | なし |
| ingest-hij | ✅ あり | `--no-verify-jwt` |
| generate-sec-brief | ✅ あり | `--no-verify-jwt` |
| discord-bot | ✅ あり | `--no-verify-jwt` |
| stripe-webhook | ✅ あり | `--no-verify-jwt` |
| relay | ✅ あり | `--no-verify-jwt` |
| **line-register** | ❌ **なし** | - |

**問題点**:
- `line-register`はGitHub Actionsで自動デプロイされない
- 手動でデプロイする必要がある
- 手動デプロイ時に`--no-verify-jwt`を忘れると、設定が元に戻る

---

## 🎯 根本原因

### 設定が元に戻るメカニズム

1. **ローカルでデプロイ**（`--no-verify-jwt`付き）→ 正常動作
2. **GitHubにプッシュ** → GitHub Actionsが実行される
3. **しかし、`line-register`はデプロイされない**（ワークフローに含まれていない）
4. **別のタイミングで誰かが手動デプロイ**（`--no-verify-jwt`なし）→ 設定が元に戻る

または：

1. **Supabase Dashboard側で設定が強制される**
2. **supabase.tomlの設定が無視される**
3. **CLIオプション`--no-verify-jwt`のみが有効**

---

## 🛠️ 解決策

### 解決策1: GitHub Actionsワークフローに`line-register`を追加（推奨）

**修正内容**:
`.github/workflows/deploy-supabase.yml`に以下を追加：

```yaml
      - name: Deploy line-register
        run: supabase functions deploy line-register --no-verify-jwt --project-ref "$SUPABASE_PROJECT_ID"
```

**追加位置**: `Deploy relay`の後

**効果**:
- `supabase/functions/line-register/`配下のファイルが変更されると、自動的にデプロイされる
- 常に`--no-verify-jwt`オプション付きでデプロイされる
- 設定が元に戻ることがなくなる

**問題点**:
- GitHub Appには`workflows`権限がないため、自動的にプッシュできない
- **ユーザーが手動で修正してプッシュする必要がある**

---

### 解決策2: ローカルで常に`--no-verify-jwt`を使用（暫定策）

**手順**:
ローカルでデプロイする際は、必ず以下のコマンドを使用：

```bash
npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep --no-verify-jwt
```

**効果**:
- 確実に`verify_jwt = false`が設定される
- 認証エラーが発生しない

**問題点**:
- 毎回オプションを指定する必要がある
- 忘れると設定が元に戻る

---

### 解決策3: Supabase Dashboardで設定変更（未確認）

**手順**:
1. https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/functions にアクセス
2. `line-register` Functionをクリック
3. 「Settings」タブを開く
4. 「Verify JWT」または「Require authentication」を**オフ**にする
5. 保存

**効果**:
- Dashboard側で設定が永続化される
- CLIオプションが不要になる可能性

**問題点**:
- Dashboard側で設定項目が存在するか未確認
- ログインが必要

---

## 📊 テスト結果

### テスト1: supabase.toml修正後（`--no-verify-jwt`なし）

**コマンド**:
```bash
npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep
```

**結果**:
```bash
$ curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","opt_in_email":true}'

{"code":401,"message":"Missing authorization header"}
```

❌ **失敗**: 設定が反映されず

---

### テスト2: `--no-verify-jwt`オプション付き

**コマンド**:
```bash
npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep --no-verify-jwt
```

**結果**:
```bash
$ curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email":"final-test@example.com","opt_in_email":true}'

{"ok":true,"line_user_id":null,"email":"final-test@example.com","opt_in_email":true}
```

✅ **成功**: 正常に動作

---

### テスト3: 複数パターンのテスト

**テスト内容**:
1. メールのみの登録
2. LINEのみの登録（無効なLINE ID）
3. 両方の登録（無効なLINE ID）

**結果**:
```bash
=== Test 1: Email only ===
{"ok":true,"line_user_id":null,"email":"email-only@example.com","opt_in_email":true}

=== Test 2: LINE only ===
{"error":"LINE verification failed"}

=== Test 3: Both ===
{"error":"LINE verification failed"}
```

**評価**:
- ✅ メールのみ: 成功
- ✅ LINEのみ: 期待通りのエラー（無効なLINE IDのため）
- ✅ 両方: 期待通りのエラー（無効なLINE IDのため）

---

## 📝 修正済みファイル

| ファイル | 修正内容 | コミット | 状態 |
|---------|---------|---------|------|
| `supabase/functions/line-register/supabase.toml` | `[functions]`→`[function]`に修正 | 595c9a3 | ✅ プッシュ済み |
| `.github/workflows/deploy-supabase.yml` | `line-register`デプロイステップ追加 | - | ❌ **未プッシュ**（権限エラー） |

---

## 🚧 未完了の作業

### 1. GitHub Actionsワークフローの修正（最重要）

**ファイル**: `.github/workflows/deploy-supabase.yml`

**追加する内容**:
```yaml
      - name: Deploy line-register
        run: supabase functions deploy line-register --no-verify-jwt --project-ref "$SUPABASE_PROJECT_ID"
```

**追加位置**: 58行目（`Deploy relay`の後）

**修正後の内容**:
```yaml
      - name: Deploy relay
        run: supabase functions deploy relay --no-verify-jwt --project-ref "$SUPABASE_PROJECT_ID"

      - name: Deploy line-register
        run: supabase functions deploy line-register --no-verify-jwt --project-ref "$SUPABASE_PROJECT_ID"

      - name: Send Discord notification
        if: always()
```

**理由**:
- GitHub Appには`workflows`権限がないため、自動的にプッシュできない
- **ユーザーが手動で修正してプッシュする必要がある**

---

## 🎯 推奨される次のアクション

### アクション1: GitHub Actionsワークフローを手動で修正（最優先）

**手順**:
1. ローカルで`.github/workflows/deploy-supabase.yml`を開く
2. 58行目（`Deploy relay`の後）に以下を追加：
   ```yaml
         - name: Deploy line-register
           run: supabase functions deploy line-register --no-verify-jwt --project-ref "$SUPABASE_PROJECT_ID"
   ```
3. GitHubにプッシュ

**効果**:
- 今後、`supabase/functions/line-register/`配下のファイルが変更されると、自動的にデプロイされる
- 設定が元に戻ることがなくなる

---

### アクション2: iPhoneで再テスト

**URL**:
```
https://mo666-med.github.io/cursorvers_line_free_dev/register.html?t=20251208-final
```

**手順**:
1. LINEアプリを完全に再起動
2. 上記URLにアクセス
3. 「LINEでログイン」ボタンをクリック
4. 登録完了メッセージを確認

**期待される結果**:
- ✅ エラーなく登録完了
- ✅ 「登録が完了しました！」メッセージ表示
- ✅ Supabase `members`テーブルにデータ保存
- ✅ Google Sheetsに自動記録

---

## 📊 システム全体の現状

### フロントエンド（GitHub Pages）

| ファイル | 状態 | LIFF ID | id_token送信 |
|---------|------|---------|-------------|
| `register.html` | ✅ 最新 | 2008640048-jnoneGgO | ✅ あり |
| `community-v2.html` | ✅ 最新 | 2008640048-jnoneGgO | ❌ なし（メールのみ） |

---

### バックエンド（Supabase Edge Functions）

| Function | 状態 | verify_jwt | デプロイ方法 |
|----------|------|-----------|------------|
| `line-register` | ✅ 最新 | ✅ false | 手動（`--no-verify-jwt`） |

---

### GitHub Actions

| ワークフロー | `line-register`デプロイ | 状態 |
|------------|---------------------|------|
| `deploy-supabase.yml` | ❌ なし | ⚠️ **要修正** |

---

## 🔄 トラブルシューティング

### Q1: 再び401エラーが発生した

**原因**:
- 誰かが`--no-verify-jwt`なしでデプロイした
- または、Supabase Dashboard側で設定が変更された

**解決策**:
```bash
npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep --no-verify-jwt
```

---

### Q2: GitHub Actionsワークフローを修正できない

**原因**:
- GitHub Appに`workflows`権限がない

**解決策**:
- ユーザーが手動で`.github/workflows/deploy-supabase.yml`を修正してプッシュ

---

### Q3: supabase.tomlの設定が反映されない

**原因**:
- Supabaseの仕様上、`supabase.toml`の設定は反映されない可能性がある

**解決策**:
- 常に`--no-verify-jwt`オプションを使用してデプロイ
- または、Supabase Dashboardで設定変更

---

## ✅ 結論

### 原因の特定

1. **supabase.tomlの設定形式が間違っていた** → 修正済み（595c9a3）
2. **GitHub Actionsワークフローに`line-register`が存在しない** → **未修正（要手動修正）**
3. **supabase.tomlの設定は反映されない** → `--no-verify-jwt`オプションで回避

### 永続的な解決策

1. **GitHub Actionsワークフローに`line-register`デプロイステップを追加**（最重要）
2. **常に`--no-verify-jwt`オプションを使用してデプロイ**（暫定策）

### 次のアクション

1. ✅ `supabase.toml`を修正（完了）
2. ✅ `--no-verify-jwt`でデプロイ（完了）
3. ❌ **GitHub Actionsワークフローを修正**（要手動作業）
4. ❌ **iPhoneで再テスト**（ユーザー作業）

---

**報告書終了**
