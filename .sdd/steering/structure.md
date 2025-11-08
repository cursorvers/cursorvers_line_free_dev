# Repository Structure – Current Snapshot

## Current State (2024-??)
- Active repository with GitHub Actions-heavy automation, Deno edge relay, Supabase/Sheets tooling, and extensive ops docs already committed.
- Top-level directories of note:
  - `.github/workflows/` – >20 workflows covering LINE intake, Manus progress routing, SLO monitoring, budget guardrails, reporting, state machine sync, etc.
  - `functions/relay/` – Deno-based Front Door (`index.ts`) plus KV helper and tests.
  - `scripts/` – Node scripts for Supabase ingest, Google Sheets ledger, Manus API calls, feature flag helpers, plan generation.
  - `orchestration/` – Plan JSONs, cost estimator (`cost.py`), Manus briefs, plan state folders.
  - `docs/` – Large operations knowledge base (runbooks, troubleshooting, KPI notes, Manus integration guides).
  - `docs/automation/WORKFLOWS.md` – Auto-generated GitHub Actions inventory (`npm run workflows:inventory` to refresh).
  - `scripts/automation/` – Utility scripts invoked from Actions（例: Geminiログ要約PoC）。
  - `scripts/checks/` – Secrets/環境検証用のCLI（`verify-secrets` など）。
  - `scripts/vendor/` – Supabase / Google / Manus 向け vendored helper群。
  - `docs/runbooks/line-actions.md` – 外部委託向け運用ハンドブック。シグナル/コマンド体系、フラグ切替、ログ/Artifact取得を記載。
  - `docs/OPS_COMPLIANCE_NOTIFICATION.md` – Ops/Compliance 向け通知テンプレート。
  - `Cursorvers_LINEsystem/` – Nested Node/TypeScript project (appears legacy scaffold; confirm ongoing usage).
  - `logs/` – Progress JSON archives produced by workflows.
  - `tests/` – Python cost estimator tests plus Node feature flag unit tests.
- `tmp/` や `testfile.tmp` などの一時生成物が残存しており、クリーンアップ方針を決める必要あり。
- `.sdd/` steering notes now coexist with broader documentation.

## Key Entry Points & Patterns
- Edge relay (`functions/relay/index.ts`) validates LINE/Manus signatures, dedupes events via KV/memory, and dispatches sanitized payloads to GitHub via `repository_dispatch`.
- Primary GitHub Actions entrypoints:
  - `line-event.yml` – Heavily scripted workflow handling plan selection (normal/degraded), Supabase/Sheets persistence, Manus dispatch (dev), logging, notifications, cost estimation.
  - `manus-progress.yml` – Processes Manus push telemetry, updates plan deltas, coordinates follow-up jobs (needs deeper review in requirements phase).
  - `webhook-handler.yml` – Canonical GitHub event router; logs issue/PR/comment events, applies state labels via `scripts/webhook-router.mjs`, and escalates failures using the `gh` CLI.
  - `autonomous-agent.yml` – Executes Codex agent runs on `/agent` commands or labels, creates branches/PRs automatically when secrets (`OPENAI_API_KEY`/`LLM_API_KEY`) exist.
  - `manus-task-runner.yml` – Schedules weekly Manus実行、`MANUS_ENABLED`がfalseの場合は即終了、実行前にproduction planを`orchestration/plan/current_plan.json`へコピー。
  - `line-event.yml` 内で Geminiログ要約ステップが `scripts/automation/run-gemini-log-summary.mjs` を呼び出し、Artifact と Step Summary に結果を付加。
  - Guardrail/reporting workflows (`economic-circuit-breaker.yml`, `verify-secrets.yml`, `plan-validator.yml`, `rotate-logs.yml`, `weekly-kpi-report.yml`, etc.) enforce budget limits, secret audits, plan schema checks, telemetry hygiene.
- Shared scripts (`scripts/supabase/*`, `scripts/manus-api.js`, `scripts/lib/feature-flags.js`) centralize logic referenced by workflows to keep YAML manageable.
- Plan artifacts stored under `orchestration/plan/` with production/degraded variants and cost governor inputs; workflows expect consistent JSON schema (Plan v1.2, PlanDelta v1.1).

## Known Conventions & Guardrails
- TypeScript for edge runtime (Deno compat) with unit tests in Deno std asserts.
- Node 20 runtime for GitHub Actions scripts; Python 3.11 for cost estimation.
- Hashing of LINE user IDs before persistence, optional message text redaction for compliance.
- Budget enforcement via `orchestration/cost.py`; workflows surface recommendations but still need policy wiring.
- Feature flags driven via GitHub `vars.*` (`MANUS_ENABLED`, `DEGRADED_MODE`, `DEVELOPMENT_MODE`, etc.) with helper utilities and tests.

## Observed Debt / Follow-ups
- Repository contains legacy directories (`Cursorvers_LINEsystem`) and large `node_modules/` folders; need decision on de-duplication or archive.
- Tests limited (cost estimator, feature flags, relay); 新規に Gemini メトリクス集計／Manus API 問い合わせの Node テストを追加済みだが、LINE コマンドルールや Discord 連携の統合テストは未整備。
- Need clarity on deployment pipeline for `functions/relay` (Edge hosting target not documented in repo).
- Secrets/vars expectations scattered across workflows; consolidate into single reference doc.
- Confirm Google Sheets schema alignment with automation (column count mismatch risk noted in script comment).
- Determine policy for logs growth (`logs/progress` committed via Actions could bloat repo).
- Document safety for remote `curl` fetch of scripts inside `line-event.yml` (cache or vendor to repo).
- Capture required `contents:write` token scopes/branch protection allowances so workflows that push event logs or PRs do not fail silently.
- Gemini要約Artifactの保持期間・削除ポリシーは未定義。PoC終了後にS3等へ移すか削除するか決定が必要。
