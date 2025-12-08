# Supabase Edge Function 認証エラー解決ガイド

**作成日**: 2025年12月8日  
**対象**: line-register Edge Function  
**エラー**: `401 Missing authorization header`

---

## 🎯 目的

Supabase Edge Functionで発生している`401 Missing authorization header`エラーを解決し、匿名アクセス（認証なし）を許可する。

---

## 📋 問題の詳細

### 現在の状況

**エラーメッセージ**:
```json
{"code":401,"message":"Missing authorization header"}
```

**発生タイミング**:
- line-register Edge Functionを再デプロイした後
- フロントエンド（register.html, community-v2.html）からAPIを呼び出した時

**原因**:
Supabase Edge Functionsは、デフォルトで**JWT認証を要求する**設定になっている可能性があります。フロントエンドは認証ヘッダーを送信していないため、401エラーが発生しています。

---

## 🔧 解決方法（3つの選択肢）

### 方法1: Supabase Dashboardで設定変更（推奨）

#### ステップ1: Supabase Dashboardにログイン

1. ブラウザで以下のURLを開く：
   ```
   https://supabase.com/dashboard/sign-in
   ```

2. ログイン方法を選択：
   - **Continue with GitHub**（推奨）
   - **Continue with SSO**
   - メール＋パスワード

3. ログイン完了後、プロジェクト一覧が表示される

---

#### ステップ2: プロジェクトを開く

1. プロジェクト一覧から**haaxgwyimoqzzxzdaeep**を探す
2. プロジェクト名をクリックして開く

---

#### ステップ3: Edge Functions設定を開く

1. 左サイドバーから**「Edge Functions」**をクリック
2. Function一覧から**「line-register」**をクリック

---

#### ステップ4: 認証設定を確認・変更

**注意**: Supabase Edge Functionsには「Verify JWT」という設定項目が**存在しない可能性**があります。代わりに、以下の設定を確認してください。

##### 4-1. 「Settings」タブを確認

1. **「Settings」**タブをクリック
2. 以下の項目を確認：
   - **「Require authentication」**または**「Verify JWT」**
   - **「CORS settings」**

##### 4-2. 認証設定を無効化

もし「Require authentication」や「Verify JWT」が見つかった場合：
1. チェックボックスを**オフ**にする
2. 「Save」または「Update」ボタンをクリック

##### 4-3. CORS設定を確認

1. **「CORS settings」**セクションを確認
2. 以下のドメインが許可されているか確認：
   ```
   https://mo666-med.github.io
   ```
3. 許可されていない場合は追加して保存

---

#### ステップ5: 動作確認

ターミナルで以下のコマンドを実行：

```bash
curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "opt_in_email": true}'
```

**期待される結果**:
```json
{"ok":true,"line_user_id":null,"email":"test@example.com","opt_in_email":true}
```

**成功**: 上記のJSONが返ってくれば、認証エラーは解決しています。

---

### 方法2: フロントエンドにSupabase Anon Keyを追加

Dashboardで設定変更ができない場合、フロントエンドに認証ヘッダーを追加します。

#### ステップ1: Supabase Anon Keyを取得

1. Supabase Dashboard → プロジェクト → **「Settings」** → **「API」**
2. **「Project API keys」**セクションを確認
3. **「anon public」**キーをコピー

例:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhYXhnd3lpbW9xenp4emRhZWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTg0MjA4MDAsImV4cCI6MjAxMzk5NjgwMH0.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

#### ステップ2: register.htmlを修正

`docs/register.html`の113-117行目を以下のように修正：

**修正前**:
```javascript
const res = await fetch(API_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, opt_in_email: optIn }),
});
```

**修正後**:
```javascript
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE"; // ← 取得したAnon Keyを貼り付け

const res = await fetch(API_ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, // ← 追加
    "apikey": SUPABASE_ANON_KEY // ← 追加
  },
  body: JSON.stringify({ email, opt_in_email: optIn }),
});
```

同様に、183-187行目も修正：

```javascript
const res = await fetch(API_ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, // ← 追加
    "apikey": SUPABASE_ANON_KEY // ← 追加
  },
  body: JSON.stringify(payload),
});
```

---

#### ステップ3: community-v2.htmlを修正

`docs/community-v2.html`の141-148行目を同様に修正：

```javascript
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE"; // ← 取得したAnon Keyを貼り付け

const res = await fetch(API_ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, // ← 追加
    "apikey": SUPABASE_ANON_KEY // ← 追加
  },
  body: JSON.stringify({
    email: email,
    opt_in_email: optIn,
  }),
});
```

---

#### ステップ4: GitHubにプッシュ

```bash
git add docs/register.html docs/community-v2.html
git commit -m "Add Supabase Anon Key to API requests"
git push origin main
```

---

#### ステップ5: GitHub Pagesデプロイ完了を待つ

2-5分待ってから、以下のURLでテスト：

```
https://mo666-med.github.io/cursorvers_line_free_dev/register.html?t=20251208-fix4
```

---

### 方法3: Edge Function内で認証をスキップ（非推奨）

**注意**: この方法はセキュリティリスクがあるため、推奨されません。

#### ステップ1: Edge Functionコードを修正

`supabase/functions/line-register/index.ts`の先頭に以下を追加：

```typescript
// 認証をスキップ（開発用のみ）
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // OPTIONSリクエストに対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 既存のコード...
```

---

## 📊 各方法の比較

| 方法 | 難易度 | セキュリティ | 推奨度 |
|------|--------|------------|--------|
| **方法1: Dashboard設定** | 簡単 | ✅ 安全 | ⭐⭐⭐⭐⭐ |
| **方法2: Anon Key追加** | 中 | ✅ 安全 | ⭐⭐⭐⭐ |
| **方法3: 認証スキップ** | 難しい | ❌ 危険 | ⭐ |

---

## 🎯 推奨される手順

### まず試すべきこと

1. **Supabase Dashboardにログイン**して、方法1を試す
2. Dashboard設定が見つからない場合は、**方法2（Anon Key追加）**を実装
3. どちらも解決しない場合は、Supabaseサポートに問い合わせ

---

## 🔍 トラブルシューティング

### Q1: Supabase Dashboardにログインできない

**A**: GitHubアカウントでログインを試してください。プロジェクトを作成したアカウントでログインする必要があります。

---

### Q2: 「Verify JWT」設定が見つからない

**A**: Supabase Edge Functionsには、この設定項目が存在しない可能性があります。代わりに**方法2（Anon Key追加）**を試してください。

---

### Q3: Anon Keyを追加しても401エラーが出る

**A**: 以下を確認してください：
1. Anon Keyが正しくコピーされているか
2. `Authorization`ヘッダーと`apikey`ヘッダーの両方が追加されているか
3. GitHub Pagesのデプロイが完了しているか（2-5分待つ）

---

### Q4: CORSエラーが出る

**A**: Edge Functionのコードに以下を追加：

```typescript
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

---

## 📞 サポート情報

- **Supabase Dashboard**: https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep
- **Supabase Docs**: https://supabase.com/docs/guides/functions
- **GitHub Repository**: https://github.com/mo666-med/cursorvers_line_free_dev

---

## ✅ 成功の確認方法

以下のコマンドで、APIが正常に動作することを確認：

```bash
curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "opt_in_email": true}'
```

**期待される結果**:
```json
{"ok":true,"line_user_id":null,"email":"test@example.com","opt_in_email":true}
```

この結果が返ってくれば、認証エラーは解決しています。

---

**ガイド終了**
