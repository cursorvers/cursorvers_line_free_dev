# Gemini Log Metrics Instrumentation – Requirements

## Business Objectives
- Quantify the effectiveness and stability of the Gemini log-summary PoC without adding manual bookkeeping.
- Provide Ops and engineering stakeholders with per-run metrics (success/failure, latency, cost) so they can determine ROI and reliability.

## Functional Requirements
1. Capture metrics every time the Gemini step runs inside `line-event.yml`, including:
   - execution status (`ok`, `error`, `skipped_*`)
   - start/end timestamps and derived duration
   - API response latency as reported by the script
   - estimated cost per invocation (configurable rate × call count)
2. Persist metrics in a machine-readable file (e.g., `tmp/gemini/metrics.jsonl`) and upload as a workflow artifact (`gemini-metrics`).
3. Emit a concise summary line in the workflow Step Summary highlighting the latest metrics (status, duration, cost).
4. Provide a CLI command (Node script) to merge artifacts locally and generate an aggregate report (totals, averages, failure rate) for the PoC period.
5. Update the PoC report template (`docs/automation/GEMINI_POC_REPORT.md`) to reference the new CLI output.

## Non-Functional Requirements
- Instrumentation must reuse existing sanitised payloads; no additional sensitive data should be logged or stored.
- The workflow must remain non-blocking: metrics collection errors should not fail the job (but should be surfaced in logs).
- The new artifacts should adhere to retention policies and be easy to delete after the PoC.
- Scripts must include unit tests covering duration/cost calculations and artifact writing under success and failure scenarios.

## Assumptions
- Cost can be approximated by a fixed per-request rate (provided via GitHub variable or default).
- Existing artifact upload permissions allow an additional metrics artifact per run.
- Network timing from the workflow is adequate for latency measurement (no high-resolution timers required).

## Out of Scope
- Writing metrics directly to Supabase or long-term data stores.
- Automated alerts or dashboards; PoC evaluation remains manual.
- Changing Gemini prompt/content—the focus is instrumentation only.

## Open Questions / Follow-ups
- Determine the default cost rate (e.g., USD per 1k tokens vs per request) and where to source it.
- Confirm artifact retention period and whether additional cleanup automation is needed post-PoC.
