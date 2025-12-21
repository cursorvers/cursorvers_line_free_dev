# Tasks – Cursorvers LINE Funnel

Source design: `.sdd/specs/line-funnel/design.md` (Architecture, Data Models, Testing, Deployment) and CODE_REVIEW_TODOS for daily brief hardening.

## Task List (prioritized)

| # | Priority | Task & Objective | Scope / Files | Owner | Definition of Done | Dependencies / Notes |
|---|----------|------------------|---------------|-------|--------------------|----------------------|
| 1 | P0 | **Architecture alignment decision** – decide whether to keep Supabase `line-webhook`/daily-brief flows or migrate to Front Door + GitHub Actions dispatch path. | `.sdd/steering/{product,tech}.md`, `.sdd/specs/line-funnel/design.md` | TBD | Written decision recorded in steering/design; retained/migrated components listed; downstream tasks updated if migration chosen. | Blocks 2–5; needs stakeholder input. |
| 2 | P0 | **Front Door + repo_dispatch path** – implement or adapt Edge relay with signature verify, idempotency, sanitized payload forwarding. | `supabase/functions/line-webhook/` or new `functions/relay/index.ts`; tests under `tests/` | TBD | Valid/invalid signature tests pass; duplicate suppression works; sample LINE event triggers `repository_dispatch` locally (act/miniflare) without secrets leakage. | Depends on Task 1 decision. |
| 3 | P0 | **Restore orchestration assets** – recreate missing `orchestration/plan` files, `orchestration/cost.py`, Manus brief, degraded assets. | `orchestration/plan/*.json`, `orchestration/cost.py`, `docs/alerts/line_degraded_outreach.ics` | TBD | Line-event workflow can read plan/cost without errors; budget check output generated; degraded assets present. | None (but informs Task 4). |
| 4 | P0 | **Unblock GitHub Actions workflows** – replace TODOs and missing scripts used by `line-event.yml`/`manus-progress.yml` (Supabase upsert, Sheets upsert, plan delta generator, Manus dispatch). | `.github/workflows/line-event.yml`, `.github/workflows/manus-progress.yml`, `scripts/{plan, supabase, sheets}/` | TBD | `act` or dry-run passes all steps; Manus dispatch guarded by feature flags; workflows produce artifacts/logs as designed. | Tasks 1–3 influence scope; Sheets policy (Task 10) impacts payload. |
| 5 | P0 | **LINE safety footer helper** – centralize disclaimer append for all outbound messages. | Shared helper (new file) + `line-webhook`/Actions replies | TBD | All LINE replies include footer via helper; unit test ensures footer presence. | Parallel; integrate into Tasks 2/4. |
| 6 | P1 | **Google Sheets ledger implementation** – hashed IDs + retention policy; implement missing updater script. | `scripts/sheets/upsert-line-member.js` (or Python), README/RUNBOOK updates | TBD | Inserts/updates a test payload into Sheets locally with service account; hashes user IDs with managed salt; documented schema/retention; workflow step passes. | Depends on Task 1 (data source) and Task 10 (policy). |
| 7 | P1 | **CODE REVIEW – critical/high fixes for daily brief** – address SQL injection, env var validation, retries, simplified card update. | `supabase/functions/line-daily-brief/index.ts` | TBD | All CRITICAL/HIGH items in `docs/CODE_REVIEW_TODOS.md` checked off; Deno tests cover regressions. | None; can proceed in parallel. |
| 8 | P1 | **Daily brief scheduling workflow** – add cron GH Action to run daily at 07:00 JST (22:00 UTC) invoking Edge function. | `.github/workflows/line-daily-brief.yml` | TBD | Workflow exists, uses secrets, and `act` dry-run succeeds; references RUNBOOK. | Relies on Task 7 stability. |
| 9 | P1 | **Edge function unit tests (LINE daily brief)** – add Deno tests for selectCard/formatMessage/broadcast with mocks. | `supabase/functions/line-daily-brief/index.test.ts` | TBD | `deno test` passes locally/CI; covers success + retry/backoff paths. | After Task 7 code changes. |
|10 | P1 | **Data handling policy for Sheets** – define hashing salt ownership, retention window, access controls, fallback on quota/auth failures. | `.sdd/steering/{product,tech}.md`, README/RUNBOOK | TBD | Policy documented; workflow steps reference it; fallback path (skip + alert) encoded. | Unblocks Task 6. |
|11 | P1 | **Secrets/env documentation** – consolidate env vars in `.env.example` and docs. | `.env.example` (new), README, RUNBOOK | TBD | All required secrets/vars listed with descriptions; referenced by workflows/functions. | Parallel. |
|12 | P2 | **Medium daily-brief optimizations** – DB-side theme stats function, structured logging, metrics recording to `line_card_broadcasts`, type tightening, index tuning. | `supabase/migrations/005_line_cards_functions.sql` (new), `supabase/functions/line-daily-brief/index.ts`, `supabase/migrations/004_line_cards.sql` | TBD | Migration applies cleanly; structured logs emitted; metrics written; Deno tests updated; CODE_REVIEW_TODOS medium/low items closed. | After Task 7/9. |
|13 | P2 | **Observability & alerts** – notifications on workflow/function failures; progress events surfaced; logs/artifacts retention. | `.github/workflows/*.yml`, `supabase/functions/_shared/utils.ts` | TBD | Alert channel configured (e.g., Discord webhook) with test event; failure in daily brief or line-event triggers notification. | After Task 4/8 for full signal coverage. |
|14 | P2 | **Content sync workflow for line cards** – schedule Obsidian vault sync per docs. | `.github/workflows/sync-line-cards.yml` | TBD | Workflow runs on schedule/manual; verifies sample sync; documented. | Independent; may rely on secrets. |
|15 | P2 | **Daily brief runbook** – dedicated operations guide. | `docs/RUNBOOK_LINE_DAILY_BRIEF.md` (new) | TBD | Includes stop/recover/monitor/troubleshoot, secret list, test steps; reviewed with stakeholders. | After Tasks 7–9 for accuracy. |
|16 | P2 | **Standardized error handling helper** – shared structured error/log utility across Edge functions. | `supabase/functions/_shared/utils.ts`, function call sites | TBD | Functions adopt helper; log format consistent; unit test for helper. | Parallel; coordinate with Task 12 logging. |

## Parallelization Notes
- Tasks 2/4 can proceed in parallel with Task 7 (daily-brief fixes); Task 1 decision should precede large refactors.
- Tasks 7, 8, 9 are tightly coupled; execute sequentially.
- Docs/secrets (Tasks 10–11, 15) can run alongside engineering once decisions land.
- Observability/alerts (Task 13) should follow workflow stabilization (Task 4/8).

## Potential Blockers
- Pending decision on architecture convergence (Task 1).
- Access to Google Sheets service account/secrets for ledger (Task 6/10).
- Confirmation of messaging cadence/segmentation and KPIs (affects Tasks 2/4/10).
- Availability of Manus credentials and budget policy to finalize degraded paths (Task 3/4).
