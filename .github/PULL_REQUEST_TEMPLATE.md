## Summary
<!-- 1-3 bullet points -->

## Review Checklist (Phase 6 Guard Rails)

### Authorization Boundary
- [ ] 権限境界テスト: 無料/取消/未払い/商品差分の全パターンを検証
- [ ] Policy Engine (`_shared/policy.ts`) 経由の認可判定を使用
- [ ] 直接 status/tier チェックを行っていない

### State Machine
- [ ] 状態遷移が状態機械定義と整合している
- [ ] 不正な遷移パスが存在しない
- [ ] ロールバック可能な状態管理

### Idempotency / Retry
- [ ] 冪等性: 失敗 → 再送 → 成功のシナリオをテスト
- [ ] Idempotency Store (`_shared/idempotency.ts`) を使用
- [ ] 重複イベント処理が安全にスキップされる

### External API Contracts
- [ ] 外部API (Discord/Stripe/LINE) のエンドポイントが公式ドキュメント準拠
- [ ] Discord API は `DISCORD_ENDPOINTS` 定数経由
- [ ] 必要な権限スコープを確認
- [ ] エラー時の挙動（タイムアウト、Rate Limit、4xx/5xx）を考慮

### Irreversible Operations
- [ ] マージ/ロール付与の安全条件を Identity Resolver で判定
- [ ] 不可逆操作に監査ログを記録
- [ ] 管理者通知が設定されている

### Data Integrity
- [ ] ハードコード値なし（環境変数/定数ファイル使用）
- [ ] 暫定実装にはTODOコメントと期限を記載
- [ ] Decision Table がテストケースと一致

## Test Plan
<!-- Bulleted markdown checklist -->
- [ ] 既存テスト全パス
- [ ] 新規テストカバレッジ 80%+
