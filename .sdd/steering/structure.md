# Repository Structure – Current Snapshot

## Current State (2024-12-04)
- Repo now populated: Supabase Edge Functions under `supabase/functions/` (line-webhook, line-daily-brief, stripe-webhook, ingest-hij, generate-sec-brief, discord-bot, health-check, stats-exporter) plus shared utils.
- Supabase migrations define users/interaction_logs/diagnosis_state, security brief tables (hij_raw, sec_brief), and line_cards for daily briefs.
- GitHub Actions present (`.github/workflows/line-event.yml`, `manus-progress.yml`, `economic-circuit-breaker.yml`, `backup.yml`, `sec-brief-cron.yml`, etc.), but several steps reference missing helper scripts (`scripts/plan/**`, `scripts/supabase/upsert-line-event.js`, `scripts/sheets/upsert-line-member.js`) and `orchestration/plan` assets.
- Docs include README, RUNBOOK, LINE_* setup guides, sec brief deployment notes, recovery checklist, and Cursor handover package summary.
- Scripts folder currently only contains `scripts/export-line-cards` (Deno) for extracting LINE cards from Obsidian; other expected orchestration scripts are absent.
- `.sdd/specs/line-funnel/{requirements,design}.md` capture prior spec; `.sdd/steering` already exists.

## Target Layout (per operating rules)
- `.github/workflows/` – GitHub Actions (manus-progress, line-event, slo-monitor, backup, etc.).
- `functions/` – Edge/Workers “Front Door” relay with signature verification and dispatch logic.
- `orchestration/` – Manus briefs, plan schemas/JSON, cost governance helpers.
- `tests/` – Unit tests for signature verification, idempotency, failure injection (403/429/timeout).
- `docs/` – Runbook, flow diagrams, SLO documentation.
- `budgets/` – Interim budget ledgers until centralized DB is adopted.
- `.cursorrules` – Cursor IDE policy file enforcing guardrails.

## Conventions & Patterns to Enforce
- TypeScript (Edge/Deno) and Python (automation) with strict lint/test gates in PR workflow.
- Shared helper to append medical safety guardrail to all outbound messages.
- Plan/PlanDelta exchanges constrained to JSON (no free-text mixing).
- Cost Governor invoked prior to Manus actions; degrade to LINE+ics path when budgets exceeded.
- Push-style progress updates via GitHub repository_dispatch webhook to Actions; ensure ProgressEvent payload conforms to v1.1 spec noted in brief.

## Debt / Follow-ups
- Align current Supabase-heavy implementation (line-webhook, daily brief) with Front Door + GitHub Actions architecture; clarify what to retain vs. retire.
- Scaffold missing orchestration/test assets referenced by workflows (plan files, cost tools, Supabase/Sheets helpers, degraded assets) or prune workflow steps.
- Establish lint/test harness for Deno functions and any Node/Python scripts; current repo lacks tests.
- Determine storage for telemetry/observability (Supabase tables vs. GitHub artifacts) and ensure secrets management aligns with spec.
- Document Git branching policy and PR template aligning with guardrails (Manus usage, degradation path, rationale log).
- Import or reconstruct handover package pieces (Edge relay, Actions wiring, cost tooling) and schedule deployment steps once scope is confirmed.
