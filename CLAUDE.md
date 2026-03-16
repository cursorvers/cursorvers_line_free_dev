# CLAUDE.md - Thin Adapter

Role: Claude is a repository-aware coding assistant for `cursorvers_line_free_dev`.

Primary policy source:

1. `AGENTS.md`
2. `README.md`

## Read Order

1. Read `AGENTS.md` first.
2. Use this file only for provider-specific deltas.
3. Use `README.md` for current system overview and operational commands.

## Operational Focus

- Treat this repo as a protected business interface.
- Prefer executable checks over static status text.
- Preserve LINE, Stripe, Discord, and Supabase contracts unless a task explicitly migrates them.

## Common Commands

- `deno task test:functions`
- `deno test supabase/functions/line-webhook/test/ --allow-env --allow-net`
- `deno fmt supabase/functions/`
- `deno lint supabase/functions/`

## Rule

If this file conflicts with `AGENTS.md`, `AGENTS.md` wins.

## 監査スケジュール

| ワークフロー | スケジュール | 内容 |
|------------|-------------|------|
| manus-audit-daily | 毎日6:00 JST | カード在庫・配信成功率 |
| manus-audit-weekly | 毎週月曜 | 詳細監査 |
| manus-audit-monthly | 毎月1日 | DBメンテナンス |

## カスタムスラッシュコマンド

- `/test` - テスト実行
- `/deploy` - デプロイ実行
- `/verify` - システム動作確認
- `/miyabi-status` - プロジェクトステータス確認

## トラブルシューティング

### LINE Bot応答なし
```bash
npx supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep
npx supabase functions logs line-webhook --project-ref haaxgwyimoqzzxzdaeep
```

### テスト失敗
```bash
cd supabase/functions
deno test --no-check --allow-env --allow-net --allow-read
```

### lint警告が出る
```bash
cd supabase/functions
deno fmt    # フォーマット
deno lint   # lint確認
```

### デプロイ失敗
```bash
gh run list --workflow "Deploy Supabase Edge Functions" --limit 3
gh run view <run-id> --log
```

## 最近の更新 (2025-12)

- ✅ Import Map導入（deno.json拡張）
- ✅ lint clean達成（0 warnings）
- ✅ CI/CD強化（全テスト + Auto-Fix）
- ✅ Manus API連携実装
- ✅ README.md全面改訂
- ✅ 孤児レコードマージ機能追加（LINE登録→有料決済時の重複解消）
- ✅ merge-utils.ts + テスト追加（280テスト達成）

## Platform 連携ルール

**システム変更時は `Cursorvers_Platform/docs/system-architecture.md` を更新すること。**

詳細: `/Users/masayuki/Cursorvers_Platform/.claude/CLAUDE.md` の「システム変更時（自動反映ルール）」を参照
