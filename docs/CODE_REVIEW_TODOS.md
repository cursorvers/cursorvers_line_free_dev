# LINE Daily Brief コードレビュー修正タスクリスト

## 【CRITICAL】緊急対応（今すぐ修正）

### 1. SQLインジェクション脆弱性の修正
- **ファイル**: `supabase/functions/line-daily-brief/index.ts:271-277`
- **問題**: `cardId`が直接SQLに埋め込まれている
- **修正**: Supabaseクライアントの`.eq()`メソッドを使用（既に実装済みの部分を使用）

### 2. 環境変数の起動時検証
- **ファイル**: `supabase/functions/line-daily-brief/index.ts:41-44`
- **問題**: 必須環境変数が未設定でも実行時にエラー
- **修正**: 起動時に必須変数をチェックし、未設定ならエラーを投げる

---

## 【HIGH】高優先度（今週中）

### 3. LINE API呼び出しにリトライロジックを追加
- **ファイル**: `supabase/functions/line-daily-brief/index.ts:217-250`
- **問題**: リトライがない、レート制限対応なし
- **修正**: 最大3回リトライ、429エラー時はRetry-Afterヘッダーを尊重

### 4. カード更新ロジックを簡素化
- **ファイル**: `supabase/functions/line-daily-brief/index.ts:255-300`
- **問題**: 3段階のフォールバックが複雑
- **修正**: シンプルな実装（現在の値を取得→更新）

---

## 【MEDIUM】中優先度（今月中）

### 5. パフォーマンス最適化（DB集計関数）
- **ファイル**: `supabase/functions/line-daily-brief/index.ts:71-99`
- **問題**: 全カードを取得してメモリで集計
- **修正**: PostgreSQL関数`get_theme_stats()`を作成してDB側で集計

### 6. 構造化ログの実装
- **ファイル**: `supabase/functions/line-daily-brief/index.ts`全体
- **問題**: 非構造化ログで解析困難
- **修正**: JSON形式の構造化ログ関数を追加

### 7. 型安全性の改善
- **ファイル**: `supabase/functions/line-daily-brief/index.ts:19-26`
- **問題**: `LineCard`インターフェースが緩い（string型が多い）
- **修正**: 厳密な型定義（リテラル型を使用）

---

## 【LOW】低優先度（時間があるとき）

### 8. データベースインデックスの最適化
- **ファイル**: `supabase/migrations/004_line_cards.sql`
- **問題**: 複合インデックスがない
- **修正**: `(theme, status, times_used)`の複合インデックスを追加

### 9. バッチサイズの設定可能化
- **ファイル**: `scripts/export-line-cards/src/supabase-client.ts:89`
- **問題**: ハードコードされたバッチサイズ
- **修正**: 環境変数`BATCH_SIZE`で設定可能に

### 10. 進捗表示の改善
- **ファイル**: `scripts/export-line-cards/src/extractor.ts:194-224`
- **問題**: 進捗が分かりにくい
- **修正**: 10ファイルごとに進捗を表示

---

## 修正順序

1. Critical → High → Medium → Low の順で実施
2. 各修正後、動作確認を実施
3. 修正内容はGitにコミット

---

---

## 【追加タスク】システム全体の改善

### 11. GitHub Actionsワークフローの作成
- **ファイル**: `.github/workflows/line-daily-brief.yml`（新規作成）
- **問題**: 毎日の自動実行が設定されていない
- **修正**: `sec-brief-cron.yml`を参考に、毎日7:00 JST（22:00 UTC）に実行するワークフローを作成
- **参考**: `docs/LINE_DAILY_BRIEF.md`に記載されているが、実際のファイルがない

### 12. Edge Functionのユニットテスト追加
- **ファイル**: `supabase/functions/line-daily-brief/index.test.ts`（新規作成）
- **問題**: テストがextractor_test.tsのみで、Edge Functionのテストがない
- **修正**: Deno.testで主要な関数（selectCard, formatMessage, broadcastMessage）をテスト

### 13. LINE Daily Brief専用RUNBOOKの作成
- **ファイル**: `docs/RUNBOOK_LINE_DAILY_BRIEF.md`（新規作成）
- **問題**: 現在のRUNBOOK.mdはLINE友だち登録システム用で、Daily Brief用の運用マニュアルがない
- **修正**: 緊急停止、復旧手順、監視方法、トラブルシューティングを記載

### 14. 監視・アラート設定
- **ファイル**: 新規作成または既存の監視システムに統合
- **問題**: 配信失敗時の通知がない
- **修正**: 
  - GitHub Actionsの失敗通知（Discord Webhook）
  - Supabase Functionsのエラーログ監視
  - 配信成功/失敗のメトリクス記録

### 15. データベース関数の追加（パフォーマンス最適化）
- **ファイル**: `supabase/migrations/005_line_cards_functions.sql`（新規作成）
- **問題**: テーマ統計の集計がアプリケーション側で行われている
- **修正**: 
  - `get_theme_stats()`関数を作成
  - `select_and_lock_card()`関数でトランザクション処理
  - `increment_times_used()`関数でアトミックな更新

### 16. 配信履歴テーブルの活用
- **ファイル**: `supabase/migrations/004_line_cards.sql`を確認
- **問題**: `line_card_broadcasts`テーブルが定義されているが使用されていない可能性
- **修正**: 配信成功時に履歴を記録し、分析・監視に活用

### 17. エラーハンドリングの統一
- **ファイル**: `supabase/functions/_shared/utils.ts`を拡張
- **問題**: 各Edge Functionでエラーハンドリングがバラバラ
- **修正**: 共通のエラーハンドリング関数を追加（構造化ログ、エラー通知）

### 18. 環境変数のドキュメント化
- **ファイル**: `.env.example`（新規作成または更新）
- **問題**: 必要な環境変数がドキュメントに散在
- **修正**: 全ての環境変数を`.env.example`にまとめ、説明を追加

### 19. 同期スクリプトの定期実行設定
- **ファイル**: `.github/workflows/sync-line-cards.yml`（新規作成）
- **問題**: `docs/LINE_DAILY_BRIEF.md`に記載されているが、実際のファイルがない
- **修正**: 毎日Obsidian Vaultを同期するワークフローを作成

### 20. メトリクス記録の実装
- **ファイル**: `supabase/functions/line-daily-brief/index.ts`に追加
- **問題**: 配信成功率、エラー率などのメトリクスが記録されていない
- **修正**: 
  - 配信成功/失敗を`line_card_broadcasts`テーブルに記録
  - 日次/週次の統計を取得できるビューを作成

---

## 修正状況

### コードレビュー指摘事項
- [x] 1. SQLインジェクション修正
- [x] 2. 環境変数検証
- [x] 3. リトライロジック
- [x] 4. カード更新簡素化
- [x] 5. パフォーマンス最適化
- [x] 6. 構造化ログ
- [x] 7. 型安全性改善
- [x] 8. インデックス最適化
- [x] 9. バッチサイズ設定可能化
- [x] 10. 進捗表示改善

### 追加タスク
- [x] 11. GitHub Actionsワークフロー作成
- [ ] 12. Edge Functionテスト追加
- [ ] 13. RUNBOOK作成
- [ ] 14. 監視・アラート設定
- [ ] 15. データベース関数追加
- [ ] 16. 配信履歴テーブル活用
- [ ] 17. エラーハンドリング統一
- [x] 18. 環境変数ドキュメント化
- [ ] 19. 同期スクリプト定期実行
- [ ] 20. メトリクス記録実装
