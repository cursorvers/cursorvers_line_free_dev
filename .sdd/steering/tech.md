# Technical Steering – Cursorvers LINE Funnel

## Architecture & Runtime
- Execution split per existing guidance:
  - Front Door on Edge/Workers receives webhooks (LINE, Manus), performs signature verification, minimal payload sanitization, dispatches GitHub repository_dispatch.
  - GitHub Actions orchestrate planning, automation, safety checks, and ongoing operations (Cost Governor, monitoring, backups).
  - Manus reserved for narrow “last mile” external integrations when automation cannot stay within Actions/Edge (e.g., targeted Gmail or Calendar actions).
  - Cursor IDE (Codex) drives specification, implementation, testing, PR lifecycle.
- LINE registration data to be written to Google Sheets; need connector (likely Manus or direct API via Actions) while avoiding PHI leakage.
- Current codebase includes multiple Supabase Edge Functions (Deno) handling LINE webhook flows, daily brief broadcast, Stripe webhook, Discord bot, security brief ingest/generation, and health checks; GitHub Actions exist but rely on missing orchestration scripts (`scripts/plan/**`, `scripts/supabase/upsert-line-event.js`, `scripts/sheets/upsert-line-member.js`) and absent `orchestration/plan` assets. Decision: adapt existing `supabase/functions/line-webhook` as the Front Door dispatcher (signature/idempotency/sanitize → repository_dispatch) while retaining daily-brief on Supabase; consider a dedicated relay later if needed.

## Technology Stack Targets
- Node.js 18+ (or Deno/Miniflare) for Edge/Workers functions, TypeScript preferred for clarity and linting.
- Python 3.11 for orchestration helpers (cost estimation, validation scripts) and potential data tooling.
- GitHub Actions with required concurrency limits per task_id, lint/unit/schema gates, and safety guardrail enforcement.
- Storage currently Google Sheets; future database migration plan TBD.

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
- GitHub Actions (`line-event.yml`, `manus-progress.yml`, `economic-circuit-breaker.yml`, `backup.yml`, etc.) exist but have TODO placeholders (GPT analysis, Manus dispatch) and missing script dependencies; deployment pipeline for Edge Functions and Sheets connector not yet wired.

## Known Gaps / TODO
- Need detailed plan for Google Sheets integration (auth method, rate limits, failure handling).
- No current test or lint setup in repo; bootstrapping tasks required.
- Health check strategy for Front Door endpoints unspecified.
- Disaster recovery and rollback automation (beyond runbook outline) to be defined.
- Confirm secret provisioning flow for GitHub Actions/Edge, including Progress webhook URL and Manus credentials.
- Decide how existing Supabase functions (line-webhook, daily brief, sec brief) map to the new Front Door + GitHub Actions model; may require migration or dual-run plan.
- Backfill missing orchestration assets referenced in workflows (plan/current_plan.json, cost tooling, degraded assets).
