# Production Verification Log - 2026-04-17

## Summary

Discord `system-monitor` に継続表示されていた Stripe webhook missing signature と E2E Pipeline Monitor warning の誤検知/監視ノイズを修正し、本番環境で正常動作を確認した。

## Result

- Status: 正常
- Objective achievement: 100%
- Remaining slices: 0
- Production E2E: success
- CI: success
- Supabase Edge Functions deploy: success

## Implemented Changes

### Stripe Webhook

- `Stripe-Signature` なしの POST は HTTP 400 `Missing signature` として拒否するのが正常な防御応答。
- Discord 通知は `STRIPE_WEBHOOK_ALERT_ON_MISSING_SIGNATURE=true` の明示設定時のみ送る。
- 監査設定に `stripe_webhook_health` と `stripe_webhook_missing_signature` の期待応答を記録。

### LINE Daily Brief

- `line-daily-brief` に副作用なし health 経路を追加。
- `GET /functions/v1/line-daily-brief?mode=health` は認証成功時のみ HTTP 200 を返し、`cardSent:false` を返す。
- 素の GET は health 扱いせず、配信経路にも入らない。
- legacy 互換として `POST {"type":"health"}` / `POST {"mode":"health"}` も副作用なし health として扱う。

### E2E Pipeline Monitor

- LINE Daily Brief の監視を anon key + POST から service role + `GET ?mode=health` に変更。
- `HTTP 200` かつ `health:true` かつ `cardSent:false` のみ healthy と判定。
- `401` / `403` は healthy 扱いしない。
- 外部 Obsidian repo の Discord Sync チェックがトークン未設定またはアクセス不可の場合は `skipped` として中立扱いにし、不要な warning 通知を止めた。

### Alert Notification Routing

- GitHub Secrets に `DISCORD_SYSTEM_WEBHOOK` が存在することを確認。
- Supabase 本番 Secrets にも `DISCORD_SYSTEM_WEBHOOK` が存在することを確認。
- 直近の `Deploy Supabase Edge Functions` で `DISCORD_SYSTEM_WEBHOOK` への Discord POST が成功していることを確認。
- 旧 `DISCORD_ADMIN_WEBHOOK_URL` だけを参照していた GitHub Actions workflow を、`DISCORD_SYSTEM_WEBHOOK` 優先、旧名フォールバックに修正。
- `Stripe webhook missing signature` は通知しないのが正常動作。署名なしPOSTは HTTP 400 で拒否し、Discord通知は `STRIPE_WEBHOOK_ALERT_ON_MISSING_SIGNATURE=true` の明示設定時のみ送る。

## Verification Evidence

- CI Tests: https://github.com/cursorvers/cursorvers_line_free_dev/actions/runs/24553140335
- Deploy Supabase Edge Functions: https://github.com/cursorvers/cursorvers_line_free_dev/actions/runs/24553140337
- E2E Pipeline Monitor (post-fix healthy): https://github.com/cursorvers/cursorvers_line_free_dev/actions/runs/24553250317
- E2E Pipeline Monitor (post-alert-routing healthy): https://github.com/cursorvers/cursorvers_line_free_dev/actions/runs/24553941995
- Stripe webhook production health:
  - Endpoint: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/stripe-webhook`
  - Result: HTTP 200

## Commits

- `b00965b` - `fix: harden line daily health monitoring`
- `7e0540a` - `fix: suppress expected e2e sync skips`
- `1e6fce0` - `fix: prefer system webhook for alerts`

## Notes

- LINE配信およびStripe決済イベントは実行していない。
- 本番確認は副作用なし health と GitHub Actions のE2E Monitorで実施した。
- 作業前から存在していた未関係の dirty files は変更・revert していない。
