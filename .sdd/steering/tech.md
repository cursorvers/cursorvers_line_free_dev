# Technical Steering – Cursorvers LINE Funnel

## Architecture & Runtime
- Execution split per existing guidance:
  - Front Door on Edge/Workers receives webhooks (LINE, Manus), performs signature verification, minimal payload sanitization, dispatches GitHub repository_dispatch.
  - GitHub Actions orchestrate planning, automation, safety checks, and ongoing operations (Cost Governor, monitoring, backups).
  - Manus reserved for narrow “last mile” external integrations when automation cannot stay within Actions/Edge (e.g., targeted Gmail or Calendar actions).
  - Cursor IDE (Codex) drives specification, implementation, testing, PR lifecycle.
- LINE registration data to be written to Google Sheets; need connector (likely Manus or direct API via Actions) while avoiding PHI leakage.
- Current repo implements the pattern: `functions/relay/index.ts` (Deno) feeds `line-event.yml` / `manus-progress.yml` workflows; Node/Python scripts called inside workflows handle Supabase upserts, Sheets sync, and Manus task creation.
- Feature flags and degraded mode logic centralized in `scripts/lib/feature-flags.js` with associated unit tests, supporting toggles via GitHub `vars.*`.

## Technology Stack Targets
- Node.js 18+ (or Deno/Miniflare) for Edge/Workers functions, TypeScript preferred for clarity and linting.
- Python 3.11 for orchestration helpers (cost estimation, validation scripts) and potential data tooling.
- GitHub Actions with required concurrency limits per task_id, lint/unit/schema gates, and safety guardrail enforcement.
- Storage currently Google Sheets; future database migration plan TBD.
- Supabase REST API leveraged directly from workflow scripts (`scripts/supabase/upsert-line-event.js`) with hashed user IDs; dedupe built via deterministic SHA-256 keys.
- Google Sheets ledger updated through service-account JWT flow in `scripts/sheets/upsert-line-member.js`; expects header synchronization (`A:E` range).
- Operational convention: when stakeholders request Manus/Supabase actions, attempt available execution paths (GitHub Actions, MCP, or CLI via scripts) before concluding非対応—document blockers only after trying feasible routes.

## Security & Compliance Constraints
- Secrets managed exclusively via GitHub Secrets/Environments with OIDC; no .env files committed.
- All outbound user messaging must append the medical safety disclaimer consistently (shareable helper).
- Payload minimization: hash or redact user identifiers where feasible before persistence.
- Verified domain usage enforced for public URLs; placeholders should default to `{{VERIFIED_DOMAIN}}`.

## Deployment & Ops
- Front Door deployments via Edge/Workers pipeline (process unspecified; TODO capture exact deployment scripts).
- GitHub Actions triggered via repository_dispatch, schedule, or PR events; ensure concurrency, retries, and failure injection tests.
- Monitoring to include HTTP success rates, latency, Manus invocation counts, and heartbeat tracking per prior Cost Governor design.
- Webhook and Manus execution brief (v3.1 cost-aware) designs completed; push-style progress notifications to GitHub (ProgressEvent v1.1) recommended for real-time telemetry.
- Cursor handover package prepared (zip of 13 files including `.cursorrules`, Edge relay stub, Actions workflows, cost estimator, runbook, plan JSON) awaiting upload to GitHub repo `mo666-med/line-friend-registration-system`.
- Need to document actual deployment path for Edge function (Workers/Supabase) since repository currently stores Deno code without deployment scripts.

## GitHub Actions Snapshot
- `line-event.yml` (LINE Event Handler) orchestrates inbound funnel automation: resolves normal/degraded plan assets via `vars.MANUS_ENABLED`, `vars.DEGRADED_MODE`, or `orchestration/plan/production/degraded.flag`; executes `orchestration/cost.py`; consumes vendored Supabase/Sheets helpers under `scripts/vendor/**`; upserts into Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); updates Google Sheets when `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_SHEET_ID` exist; optionally dispatches Manus tasks when `vars.DEVELOPMENT_MODE` and `vars.MANUS_ENABLED` are true; commits JSON payloads under `logs/progress/`; and sends webhook notifications (`NOTIFY_WEBHOOK_URL` or fallback `PROGRESS_WEBHOOK_URL`).
- `manus-progress.yml` persists Manus push telemetry (`repository_dispatch: manus_progress`), writes to Supabase, interprets retry/amend decisions, optionally triggers `scripts/manus/retry-task.mjs` (requires `MANUS_API_KEY`/`MANUS_BASE_URL`) when dev mode allows, and archives raw payloads via git commit.
- `webhook-handler.yml` acts as a generalized GitHub event router with logging, state label routing via `scripts/webhook-router.mjs`, TODO stubs for agent workflows, and `gh` CLI escalations for critical workflow failures (`economic-circuit-breaker`, `agent-runner`, etc.).
- `autonomous-agent.yml` watches issue labels, `/agent` comments, or manual dispatch to run `scripts/codex-agent.js`; depends on OpenAI-compatible secrets (`OPENAI_API_KEY` or `LLM_API_KEY`, `LLM_ENDPOINT`) and can push branches/PRs automatically.
- Ancillary guardrails (`economic-circuit-breaker.yml`, `verify-secrets.yml`, `plan-validator.yml`, `rotate-logs.yml`, `weekly-kpi-report.yml`, etc.) enforce budget, secret hygiene, plan schema, repo log rotation, and reporting cadences—map their schedules and required inputs before altering the automation surface.
- Shared CLI scripts under `scripts/` (Supabase, Sheets, Manus, plan tooling) are invoked extensively; interface changes must be versioned or coordinated to prevent workflow breakage.
- 最新棚卸しは `docs/automation/WORKFLOWS.md` を参照（`npm run workflows:inventory` で更新）。
- `manus-task-runner.yml` schedules weekly Manus task dispatches (Mon 11:30 JST), mirrors production plan into `orchestration/plan/current_plan.json`, and exits early when `vars.MANUS_ENABLED` is not `true`.
- `economic-circuit-breaker.yml` bootstraps `yq` with remote `wget`, estimates Anthropic/Firebase costs via placeholder logic, and scrapes GitHub minutes with `gh api`; tightening dependencies and real billing integration remain TODO.
- LINEイベントワークフローには Geminiログ要約ステップを追加（`scripts/automation/run-gemini-log-summary.mjs`）。Sanitize済みログを Gemini API へ送信し、`tmp/gemini/log-summary.json` と Artifact に保存。失敗時は `status=error` で継続し、メトリクスは `tmp/gemini/metrics.jsonl`（`gemini-metrics` Artifact）へ追記。

## Known Gaps / TODO
- Need detailed plan for Google Sheets integration (auth method, rate limits, failure handling).
- No current test or lint setup in repo; bootstrapping tasks required.
- Health check strategy for Front Door endpoints unspecified.
- Disaster recovery and rollback automation (beyond runbook outline) to be defined.
- Confirm secret provisioning flow for GitHub Actions/Edge, including Progress webhook URL and Manus credentials.
- Determine lifecycle policy for workflow-generated Git commits (`logs/progress`) to avoid repository bloat.
- Clarify ownership and maintenance expectations for legacy `Cursorvers_LINEsystem/` subproject and duplicated `node_modules/`.
- Document resilience for the remote `curl` fetch in `line-event.yml` (cache or vendor scripts) to reduce supply-chain and offline-runner risk.
- Reconcile dual webhook routers to prevent duplicated routing logic or inconsistent automation behaviors.
- Capture required token scopes/branch protections so workflows that push commits or PRs do not fail under tightened repository policies.
- Consider vendoring pinned CLI binaries (`yq`, remote scripts) referenced in workflows to limit supply-chain exposure.
- Establish archival/rotation process for `logs/progress/` commits pushed by workflows to manage repository size and branch protection interactions.
- モデル連携PoCの評価軸（失敗率・応答時間・APIコスト）を自動集計する仕組みは未整備。Geminiステップが増えることでネットワーク障害やレイテンシ増大が起きた際の監視/アラートを追加検討。
