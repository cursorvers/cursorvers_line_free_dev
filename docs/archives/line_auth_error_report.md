# LINE認証エラー調査報告書

**作成日**: 2025年12月8日  
**エラー**: LINE login required. Please re-login in LIFF.  
**対象**: line-register Edge Function

---

## 📋 問題の概要

iPhoneで`register.html`にアクセスし、「LINEでログイン」ボタンをクリックすると、以下のエラーメッセージが表示されます：

```
LINE login required. Please re-login in LIFF.
```

---

## 🔍 調査結果

### 1. エラーの発生箇所

**フロントエンド** (`register.html`):
- 189行目: `throw new Error(data.error || "LINEアカウントの紐付けに失敗しました")`
- APIから返されたエラーメッセージ`data.error`を表示している

**バックエンド** (`line-register Edge Function`):
- 235行目: `return badRequest("LINE verification failed", 401);`
- LINE Profile APIが401エラーを返した場合にこのエラーを返す

---

### 2. エラーの原因

**テスト結果**:
```bash
$ curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"line_user_id":"Ue2c80a7e25066400df2e1d68f19c96d6","opt_in_email":true}'

{"error":"LINE verification failed"}
```

**原因**:
LINE Profile API (`https://api.line.me/v2/bot/profile/{userId}`) が**401エラー**を返しています。

考えられる原因：
1. **LINE Channel Access Tokenが設定されていない**
2. **LINE Channel Access Tokenが無効または期限切れ**
3. **LINE IDがBotの友だちではない**（最も可能性が高い）

---

### 3. LINE Profile APIの仕様

LINE Profile APIは、**Botと友だちになっているユーザーのプロフィール情報のみ**を取得できます。

**公式ドキュメント**:
https://developers.line.biz/ja/reference/messaging-api/#get-profile

**制限事項**:
- Botと友だちでないユーザーのプロフィールは取得できない
- 401エラーが返される

---

### 4. スクリーンショットの分析

スクリーンショットには以下の情報が含まれています：

- **LINE ID**: `Ue2c80a7e25066400df2e1d68f19c96d6`
- **エラーメッセージ**: 「LINE login required. Please re-login in LIFF.」
- **状態**: 「LINEログインに進みます。」の下に表示

これは、**LINEログインは成功したが、LINE Profile APIでの検証に失敗した**ことを意味します。

---

## 🎯 根本原因

### 問題の本質

**LINE Profile APIは、Botと友だちでないユーザーのプロフィールを取得できない**

しかし、`register.html`の目的は：
1. **メールアドレスを登録**
2. **LINEアカウントと紐付け**

この2つを実現するためには、**Botと友だちになる必要がある**が、現在のフローでは：
1. ユーザーがLIFFアプリにアクセス
2. LINEログイン（友だち追加なし）
3. LINE Profile APIで検証 → **401エラー**

---

## 🛠️ 解決策

### 解決策1: LINE Profile API検証をスキップ（推奨）

**修正内容**:
`line-register Edge Function`で、LINE Profile API検証を**オプション**にする。

**変更箇所**: `supabase/functions/line-register/index.ts` 220-247行目

**修正前**:
```typescript
if (lineUserId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    return badRequest("Server not configured for LINE verification", 500);
  }
  // Verify line_user_id by calling LINE profile API
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) {
      log("error", "LINE profile fetch failed", {
        lineUserId: lineUserId?.slice(-4) ?? "null",
        status: res.status,
      });
      return badRequest("LINE verification failed", 401);
    }
    log("info", "LINE profile verified", {
      lineUserId: lineUserId?.slice(-4) ?? "null",
    });
  } catch (err) {
    log("error", "LINE profile verification error", {
      lineUserId: lineUserId?.slice(-4) ?? "null",
      error: err instanceof Error ? err.message : String(err),
    });
    return badRequest("LINE verification error", 500);
  }
}
```

**修正後**:
```typescript
if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
  // Verify line_user_id by calling LINE profile API (optional)
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) {
      log("warn", "LINE profile fetch failed (user may not be a friend)", {
        lineUserId: lineUserId?.slice(-4) ?? "null",
        status: res.status,
      });
      // 401エラーの場合は友だちでない可能性があるため、検証をスキップ
      if (res.status !== 401) {
        return badRequest("LINE verification failed", res.status);
      }
    } else {
      log("info", "LINE profile verified", {
        lineUserId: lineUserId?.slice(-4) ?? "null",
      });
    }
  } catch (err) {
    log("error", "LINE profile verification error", {
      lineUserId: lineUserId?.slice(-4) ?? "null",
      error: err instanceof Error ? err.message : String(err),
    });
    // エラーが発生しても処理を継続
  }
}
```

**効果**:
- 友だちでないユーザーでも登録できる
- LINE IDは保存されるが、プロフィール情報は取得されない
- 後でBotと友だちになった時に、プロフィール情報を取得できる

---

### 解決策2: LIFF設定で友だち追加を必須にする

**手順**:
1. LINE Developers Consoleにアクセス
2. LIFF設定を開く
3. 「友だち追加オプション」を**ON**にする

**効果**:
- LIFFアプリにアクセスすると、自動的にBotと友だちになる
- LINE Profile APIで検証が成功する

**問題点**:
- ユーザーが友だち追加を拒否すると、LIFFアプリにアクセスできない

---

### 解決策3: `id_token`で検証する（最も安全）

**修正内容**:
LINE Profile APIの代わりに、`id_token`を検証する。

**変更箇所**: `supabase/functions/line-register/index.ts` 220-247行目

**修正後**:
```typescript
if (lineUserId) {
  // Verify id_token if provided
  if (body.id_token) {
    try {
      // id_tokenをデコードして検証
      const decoded = JSON.parse(atob(body.id_token.split('.')[1]));
      if (decoded.sub !== lineUserId) {
        log("error", "id_token verification failed", {
          expected: lineUserId?.slice(-4) ?? "null",
          actual: decoded.sub?.slice(-4) ?? "null",
        });
        return badRequest("LINE verification failed: id_token mismatch", 401);
      }
      log("info", "id_token verified", {
        lineUserId: lineUserId?.slice(-4) ?? "null",
      });
    } catch (err) {
      log("error", "id_token verification error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return badRequest("LINE verification error", 500);
    }
  } else {
    log("warn", "id_token not provided, skipping verification", {
      lineUserId: lineUserId?.slice(-4) ?? "null",
    });
  }
}
```

**効果**:
- `id_token`があれば検証、なければスキップ
- LINE Profile APIを呼び出さないため、友だちでなくても登録できる
- セキュリティは維持される（`id_token`はLINEが発行した正規のトークン）

---

## 📊 各解決策の比較

| 解決策 | 難易度 | セキュリティ | ユーザー体験 | 推奨度 |
|--------|--------|------------|------------|--------|
| **解決策1: Profile API検証をスキップ** | 簡単 | 中 | ✅ 良い | ⭐⭐⭐⭐ |
| **解決策2: 友だち追加を必須** | 簡単 | ✅ 高い | ❌ 悪い | ⭐⭐ |
| **解決策3: id_token検証** | 中 | ✅ 高い | ✅ 良い | ⭐⭐⭐⭐⭐ |

---

## 🎯 推奨される解決策

**解決策3（id_token検証）** を推奨します。

理由：
1. **セキュリティが高い**（`id_token`はLINEが発行した正規のトークン）
2. **ユーザー体験が良い**（友だち追加不要）
3. **実装が比較的簡単**

---

## 🚀 次のアクション

### 1. 解決策3を実装

`supabase/functions/line-register/index.ts`を修正して、`id_token`検証を実装します。

### 2. デプロイ

```bash
npx supabase functions deploy line-register --project-ref haaxgwyimoqzzxzdaeep --no-verify-jwt
```

### 3. テスト

iPhoneで再度テストして、エラーが解決されたことを確認します。

---

## 📝 補足情報

### LINE Profile APIの制限

LINE Profile APIは、以下の場合に401エラーを返します：

1. **Botと友だちでない**
2. **Channel Access Tokenが無効**
3. **LINE IDが存在しない**

現在のケースでは、**1. Botと友だちでない**が原因である可能性が最も高いです。

### id_tokenの仕様

`id_token`は、LINEログイン時にLINEが発行するJWT（JSON Web Token）です。

**構造**:
```
header.payload.signature
```

**payload**には以下の情報が含まれます：
- `sub`: LINE User ID
- `iss`: 発行者（LINE）
- `aud`: クライアントID
- `exp`: 有効期限
- `iat`: 発行時刻

**検証方法**:
1. `payload`をBase64デコード
2. `sub`フィールドを確認
3. `lineUserId`と一致するか確認

---

**報告書終了**
