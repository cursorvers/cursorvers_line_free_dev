# Gemini Metrics Weekly Reporting – Requirements

## Business Objectives
- Provide Ops/SRE and external maintenance teams with a lightweight, automated weekly snapshot of Gemini log-summary health (success rate, latency, costs) so they can catch regressions early without manual bookkeeping.
- Surface key metrics in habitual channels (GitHub Step Summary, Slack) to keep the automation transparent and trustworthy while keeping operational overhead low.

## Functional Requirements
1. Create a scheduled GitHub Actions workflow (e.g., every Monday 09:00 JST) that:
   - downloads the latest `gemini-metrics` artifacts emitted by `line-event.yml` runs in the previous 7 days,
   - aggregates metrics using `scripts/automation/report-gemini-metrics.mjs`,
   - produces a Markdown summary with success rate, average latency, total cost, and highlights of failures/anomalies.
2. Post the summary to:
   - GitHub Step Summary of the scheduled workflow,
   - Slack webhook (configurable secret) with a concise message and link back to the detailed report artifact.
3. Archive the aggregated JSON/Markdown report as workflow artifact (`gemini-weekly-report`) for auditors to download during the PoC.
4. Allow manual `workflow_dispatch` with a custom date range (start/end) for ad-hoc reviews.
5. Run basic validation before reporting:
   - if no metrics are found, emit a warning message but still succeed.
   - if success rate drops below a configurable threshold (default 90%), include a ⚠️ warning banner in Slack and Step Summary.

## Non-Functional Requirements
- Reports must remain human-friendly and <5KB; raw JSON aggregation is stored alongside Markdown for automation.
- Scheduled workflow must tolerate missing artifacts gracefully (no hard failure) but log missing data for follow-up.
- Slack message should avoid exposing sensitive details—only aggregated metrics and links to internal artifacts.
- Keep dependencies minimal (Node 20 runtime + existing scripts) to preserve lightweight maintenance.

## Assumptions
- `actions/download-artifact` can retrieve `gemini-metrics` artifacts generated within the reporting window (requires retention period ≥ 7 days).
- A Slack incoming webhook URL is available via GitHub Secret `SLACK_WEBHOOK_GEMINI` (or fallback variable) for PoC messaging.
- Timezone for weekly schedule should match Ops routines (JST) but can be adjusted via cron.

## Out of Scope
- Persisting reports to Supabase or external storage beyond artifacts.
- Real-time alerts (separate from weekly digest) for single-run failures.
- Modifying the existing `line-event.yml` metrics logic beyond artifact naming conventions.

## Open Questions / Follow-ups
- Confirm artifact retention meets reporting window; adjust retention or add local caching if needed.
- Determine the default WARNING threshold for success rate (proposal: 0.9).
- Agree on Slack message format and channel once Ops share requirements.
