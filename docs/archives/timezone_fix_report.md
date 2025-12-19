# タイムゾーン修正 検証報告書

**作成日時**: 2025-12-08  
**プロジェクト**: LINE無料会員登録システム  
**対象**: Supabase Edge Function (line-register)

---

## 📋 修正概要

Google SheetsとSupabaseデータベースに保存されるタイムスタンプを、**UTC（協定世界時）**から**JST（日本標準時, UTC+9）**に変更しました。

---

## 🔍 問題の詳細

### 修正前の状況

- **タイムゾーン**: UTC
- **フォーマット**: `2025-12-08T07:24:41.517Z`（Zはzulu time = UTCを示す）
- **日本時間との差**: 9時間

### ユーザーからのフィードバック

> Google Sheetは読み込めてるけど、時間設定がおかしい

### 具体例

| 実際の時刻（JST） | 保存されていた時刻（UTC） | 差分 |
|---|---|---|
| 2025-12-08 16:24 | 2025-12-08T07:24:41.517Z | -9時間 |

---

## ✅ 実施した修正

### 1. `getJSTTimestamp()`ヘルパー関数を追加

```typescript
// 日本時間（JST, UTC+9）を返すヘルパー関数
function getJSTTimestamp(): string {
  const now = new Date();
  const jstOffset = 9 * 60; // JST is UTC+9
  const jstTime = new Date(now.getTime() + jstOffset * 60 * 1000);
  return jstTime.toISOString().replace('Z', '+09:00');
}
```

**動作**:
1. 現在時刻を取得
2. UTC+9時間を加算
3. ISO 8601形式に変換
4. 末尾の`Z`を`+09:00`に置き換え

### 2. 全てのタイムスタンプを置き換え

以下の箇所を`new Date().toISOString()`から`getJSTTimestamp()`に変更：

| 箇所 | 用途 |
|---|---|
| 28行目 | ログのタイムスタンプ |
| 293行目 | データベースの`updated_at`（新規登録） |
| 309行目 | データベースの`updated_at`（有料ユーザーの紐付け） |
| 401行目 | Google Sheetsの`updated_at` |

---

## 🎯 修正後の動作

### タイムスタンプのフォーマット

- **修正前**: `2025-12-08T07:24:41.517Z`（UTC）
- **修正後**: `2025-12-08T16:24:41.517+09:00`（JST）

### 保存先

1. **Supabase `members`テーブル**: `updated_at`フィールドにJST形式で保存
2. **Google Sheets**: `updated_at`列にJST形式で保存
3. **Edge Functionログ**: `timestamp`フィールドにJST形式で記録

---

## 🧪 検証結果

### テストリクエスト

```bash
curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-jst-timezone@example.com","opt_in_email":true}'
```

### レスポンス

```json
{"ok":true,"line_user_id":null,"email":"test-jst-timezone@example.com","opt_in_email":true}
```

✅ **成功**

### 確認項目

- [x] APIが正常に動作
- [ ] Google Sheetsに正しい時刻で保存（ユーザー確認待ち）
- [ ] Supabaseデータベースに正しい時刻で保存（ユーザー確認待ち）

---

## 📊 期待される結果

### Google Sheets

最新の登録データ（`test-jst-timezone@example.com`）の`updated_at`が以下の形式で表示されるはずです：

```
2025-12-08T16:XX:XX+09:00
```

**確認ポイント**:
- 末尾が`Z`ではなく`+09:00`
- 時刻が日本時間（JST）

### Supabaseデータベース

`members`テーブルの`updated_at`フィールドも同様にJST形式で保存されます。

---

## 🚀 デプロイ情報

| 項目 | 詳細 |
|---|---|
| コミット | 59923a4 |
| メッセージ | "Fix timezone: Use JST (UTC+9) for all timestamps" |
| デプロイ日時 | 2025-12-08 |
| デプロイ方法 | `npx supabase functions deploy line-register --no-verify-jwt` |

---

## 📝 注意事項

### タイムゾーンの一貫性

- **Edge Function**: JST形式で保存（`getJSTTimestamp()`）
- **PostgreSQL**: デフォルトはUTCのまま（データベースレベルの設定は変更していない）
- **表示**: アプリケーション側でJST形式を期待

### 既存データ

- **既存データ**: UTC形式のまま（`2025-12-08T07:24:41.517Z`）
- **新規データ**: JST形式（`2025-12-08T16:24:41.517+09:00`）

既存データを一括変換する場合は、別途マイグレーションが必要です。

---

## 🎯 次のアクション

### 1. Google Sheetsで確認（最優先）

1. Google Sheetsを開く
2. 最新の行（`test-jst-timezone@example.com`）を確認
3. `updated_at`列の値を確認
   - **期待値**: `2025-12-08T16:XX:XX+09:00`
   - **NG**: `2025-12-08T07:XX:XX.XXXZ`

### 2. Supabaseデータベースで確認

1. Supabase Dashboardにログイン
2. Table Editor → `members`テーブルを開く
3. 最新の行を確認
4. `updated_at`フィールドの値を確認

### 3. iPhoneで最終テスト

1. LINEアプリを再起動
2. `register.html`にアクセス
3. 登録完了後、Google Sheetsで時刻を確認

---

## 📄 関連ファイル

- `supabase/functions/line-register/index.ts`: 修正したEdge Function
- `timezone_fix_report.md`: 本報告書

---

## 🏁 まとめ

✅ **完了した作業**:
1. `getJSTTimestamp()`ヘルパー関数を追加
2. 全てのタイムスタンプをJST形式に変更
3. コミット・プッシュ・デプロイ完了
4. APIの動作確認完了

⏳ **確認待ち**:
1. Google Sheetsでの時刻確認
2. Supabaseデータベースでの時刻確認

---

**報告者**: Manus AI Agent  
**最終更新**: 2025-12-08
