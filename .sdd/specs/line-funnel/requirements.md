# Cursorvers LINE Funnel – Requirements

## Problem Summary
We need a governed LINE funnel where webhooks are verified, dispatched through GitHub Actions, contacts are logged with hashed identifiers, outbound messages always include the medical safety footer, and the daily brief pipeline is hardened (SQL injection, env validation, retries). Current workflows are blocked by missing orchestration assets and helper scripts; Supabase functions exist but must align with the Actions-first model.

## Desired Outcome
- LINE/Manus events reliably enter GitHub via a verified Front Door with idempotency.
- Workflows run without missing files/scripts, applying cost/degraded logic and guardrails.
- Contacts are upserted to Google Sheets with hashed IDs and documented retention/access rules.
- Daily brief Edge function is safe/retriable and callable via scheduled workflow.

## Acceptance Criteria (checklist)
- [ ] Front Door path verifies LINE signature, rejects invalid/missing signatures, and suppresses duplicate events via idempotency key/cache; sends `repository_dispatch` with sanitized payload (hashed user IDs). (Design: Front Door)
- [ ] Orchestration assets exist and load cleanly: `orchestration/plan/current_plan.json`, degraded plan/flag, Manus brief, `orchestration/cost.py`; line-event workflow runs without missing file errors in dry-run/act. (Design: Architecture Overview)
- [ ] GitHub Actions `line-event.yml` and `manus-progress.yml` have functioning helper scripts (Supabase upsert, Sheets upsert, Manus dispatch guarded by flags) and complete TODOs; workflows complete successfully in dry-run. (Design: Component Responsibilities)
- [ ] Safety footer helper enforces medical disclaimer appended to all outbound LINE replies; unit test confirms footer presence. (Design: Messaging guardrail)
- [ ] Google Sheets ledger updater hashes user IDs with managed salt, writes required columns, and follows documented retention/access policy; workflow step skips safely when creds missing and logs warning. (Design: Data Persistence)
- [ ] Daily brief Edge function fixes code review critical/high items: parameterized queries (no string interpolation), startup env validation with clear errors, LINE API retry/backoff incl. 429 Retry-After, simplified card update path; Deno tests cover success/retry paths. (CODE_REVIEW_TODOS)
- [ ] Daily brief cron workflow runs 07:00 JST (22:00 UTC) hitting the Edge endpoint with auth; `act` dry-run succeeds; tied to runbook. (Design: Testing/Deployment)
- [ ] Observability: progress/log artifacts retained; failure in daily-brief or line-event workflow emits a notification to the chosen channel (e.g., Discord webhook) and surfaces in logs. (Design: Monitoring)

## Constraints & Dependencies
- External services: LINE Messaging API, GitHub repository_dispatch, Google Sheets API (service account), Supabase (existing functions/tables), Manus (optional last-mile, subject to budget).
- Feature flags/vars: `FEATURE_BOT_ENABLED`, Manus enable/disable vars, degraded mode flag/file, Sheets service account JSON, hashing salt secret, LINE channel secret/access token, GitHub PAT for dispatch.
- Rollout: staging/sandboxes not defined; initial dry-runs via `act`/local; cron to be enabled after Edge function stability.
- Limitations: messaging cadence/segmentation not yet defined; KPI targets beyond 40% opt-in TBD; Sheets quota/latency constraints; progress telemetry store undecided (Supabase vs GitHub artifacts).

## Open Questions / Follow-ups
- Architecture choice: keep Supabase `line-webhook`/daily-brief as-is or migrate behind Front Door + Actions? (affects code moves and workflows)
- Google Sheets policy: who owns hashing salt, retention window, access control, and fallback when quota/auth fails?
- Messaging cadence/segmentation and additional KPIs (consult bookings, latency SLA).
- Degraded path specifics when Manus or budget is unavailable (e.g., ICS-only, LINE-only).
- Credentials readiness: service account for Sheets, Manus API key/base URL, verified domain/PAT for dispatch.
