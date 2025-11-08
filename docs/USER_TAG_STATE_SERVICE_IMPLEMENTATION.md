# User Tag State Service 実装完了報告

## 実装日時
2025-11-08

## 実装内容

### 1. Google Sheets連携モジュールの作成

**ファイル**: `scripts/vendor/google/sheets-client.mjs`

Google Sheets APIへの認証と基本的な操作を提供するモジュールを新規作成しました。

#### 主要機能
- `getAccessToken()` - Google Service Account JSONからアクセストークンを取得
- `fetchSheetValues()` - Google Sheetsから値を取得
- `updateSheetRow()` - 特定行を更新
- `appendSheetRow()` - 新しい行を追加
- `findRowByUserHash()` - user_hashで行を検索
- `normalizeSheetRow()` - 行データを正規化（配列→オブジェクト）
- `serializeTags()` - タグ配列をJSON文字列にシリアライズ
- `resolveSheetsConfig()` - Google Sheets設定を解決
- `isSheetsAvailable()` - Google Sheetsが利用可能かチェック

### 2. User Tag State Serviceの拡張

**ファイル**: `scripts/orchestration/user-state.mjs`

既存のSupabase連携に加えて、Google Sheets連携機能を追加しました。

#### 追加機能

1. **Google Sheetsからの状態取得**
   - `fetchUserState()` が Google Sheets からもデータを取得（オプション）
   - 取得失敗時は警告のみ（非致命的）

2. **Google Sheetsへのタグ同期**
   - `upsertTags()` が Supabase 更新後に Google Sheets にも同期
   - 既存行の更新または新規行の追加を自動判定
   - 同期失敗時は警告のみ（Supabase更新は成功している）

3. **楽観的ロックの準備**
   - `updated_at` フィールドを使用した競合検出の準備
   - 現在は警告のみ（本番環境ではRLSポリシーやトリガーで制御）

#### 実装方針

設計仕様（`.sdd/specs/line-actions-orchestration/design.md` 2.3）に従い：
- **Supabaseへの書き込み**: 逐次実行（必須）
- **Sheetsへの同期**: 非同期実行（オプション、エラーは警告のみ）

### 3. エラーハンドリング

- Google Sheets連携は**非致命的**として実装
- Supabase更新が成功していれば、Sheets同期失敗は警告のみ
- 環境変数が設定されていない場合は自動的にスキップ

## 使用方法

### 基本的な使用例

```javascript
import { fetchUserState, applyTagChanges } from './scripts/orchestration/user-state.mjs';

// ユーザー状態の取得（Supabase + Google Sheets）
const state = await fetchUserState('user-hash-123');
console.log(state.tags);        // タグ配列
console.log(state.raw);         // Supabaseレコード
console.log(state.sheetsData);  // Google Sheetsデータ（オプション）

// タグの追加
await applyTagChanges('user-hash-123', {
  add: ['tag1', 'tag2']
});

// タグの削除
await applyTagChanges('user-hash-123', {
  remove: ['tag1']
});
```

### 環境変数

Google Sheets連携を使用する場合は、以下の環境変数を設定：

```bash
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
GOOGLE_SHEET_ID='your-sheet-id'
GOOGLE_SHEET_NAME='line_members'  # オプション（デフォルト: line_members）
```

環境変数が設定されていない場合、Google Sheets連携は自動的にスキップされます。

## テスト

### 手動テスト

```bash
# ユーザー状態の取得
node scripts/orchestration/user-state.mjs <user_hash>

# タグの追加
node scripts/orchestration/user-state.mjs <user_hash> add tag1,tag2

# タグの削除
node scripts/orchestration/user-state.mjs <user_hash> remove tag1
```

## 次のステップ

1. ✅ User Tag State Serviceの拡張（Google Sheets連携） - **完了**
2. ⏳ 排他制御の実装（楽観的ロック） - **準備完了**（本番環境でRLSポリシーやトリガーで制御）
3. ⏳ Supabase & Sheetsスキーマ整備の確認

## 注意事項

- Google Sheets連携は**非致命的**として実装されています
- Supabase更新が成功していれば、Sheets同期失敗は警告のみで処理は継続されます
- 本番環境では、SupabaseのRLSポリシーやトリガーで排他制御を実装することを推奨します

## 参考資料

- `.sdd/specs/line-actions-orchestration/design.md` - 設計仕様
- `docs/GITHUB_GOOGLE_SHEETS_CONFIG.md` - GitHub設定確認結果
- `scripts/vendor/google/upsert-line-member.js` - 既存のGoogle Sheets更新実装

