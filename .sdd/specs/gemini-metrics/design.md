# Design – Gemini Log Metrics Instrumentation

## Architecture Overview
- **Scope Boundary**: Enhancements stay within GitHub Actions and CLI scripts—no external datastore or production endpoints.
- **Instrumentation Points**:
  - Gemini summary script (`scripts/automation/run-gemini-log-summary.mjs`) captures timing and status.
  - LINE workflow (`.github/workflows/line-event.yml`) records start time, processes results, and uploads metrics artifacts.
  - Aggregation CLI (`scripts/automation/report-gemini-metrics.mjs`, new) merges JSONL artifacts for PoC analysis.

## Data Flow
```
line-event.yml step
  ├─ record start timestamp
  ├─ execute run-gemini-log-summary.mjs
  ├─ script returns { status, summary, raw_response, logs_count }
  ├─ collect metrics (status, duration, latency, cost)
  ├─ append to tmp/gemini/metrics.jsonl
  ├─ upload artifact (gemini-log-summary, gemini-metrics)
  └─ append metrics to step summary

Local report CLI
  ├─ ingest metrics artifacts
  ├─ compute aggregates (success rate, avg duration, total cost)
  └─ output JSON + optional markdown table
```

## Approach & Components
1. **Script Instrumentation**
   - Wrap `callGemini` inside `runGeminiLogSummary` to measure API latency (wall-clock) and return it with the result object.
   - Add `costEstimate` field derived from configurable rate (`process.env.GEMINI_COST_PER_CALL` or GitHub variable fallback).
   - Ensure summary file contains new metrics for downstream use.

2. **Workflow Integration**
   - Extend Gemini step in `line-event.yml` to:
     - capture step start/end timestamps via bash.
     - read returned JSON for `status`, `logs_count`, `latency_ms`, `cost_estimate`.
     - append metrics to `tmp/gemini/metrics.jsonl` (JSON Lines, one object per run).
     - update Step Summary with `status`, `duration`, `cost`.
     - upload metrics artifact (`gemini-metrics`).

3. **Aggregation CLI**
   - New script `scripts/automation/report-gemini-metrics.mjs`:
     - accepts `--input` (file or directory of JSONL files).
     - aggregates totals/averages, failure counts, total spend.
     - outputs structured JSON and optional markdown summary.
     - unit tests verifying aggregation math and input parsing.

4. **Documentation**
   - Update `docs/automation/GEMINI_POC_REPORT.md` to reference the aggregation CLI and metrics data.

## Data Model / Formats
- **metrics.jsonl** (per workflow run):
  ```json
  {
    "run_id": "${{ github.run_id }}:${{ github.run_attempt }}",
    "timestamp": "2025-11-10T02:34:56Z",
    "status": "ok",
    "duration_ms": 2300,
    "latency_ms": 1800,
    "logs_count": 12,
    "cost_estimate": 0.0025,
    "model": "gemini-1.5-flash-latest"
  }
  ```
- Aggregation output example:
  ```json
  {
    "total_runs": 14,
    "success_rate": 0.93,
    "avg_duration_ms": 2450,
    "avg_latency_ms": 1820,
    "total_cost": 0.035,
    "failures": 1,
    "status_breakdown": {"ok": 13, "error": 1}
  }
  ```

## Testing Strategy
- Unit tests for instrumentation functions (duration/latency capture, cost calculation) using mocked timers/fetch.
- CLI tests for aggregator with synthetic JSONL inputs verifying stats.
- Workflow dry-run (manual) to confirm artifacts and Step Summary display.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Inaccurate latency measurement due to script overhead | Capture both API latency (inside Node) and overall step duration; document interpretation. |
| Metrics append failure (file permission) | Use `mkdir -p tmp/gemini` and append with `tee`/`node`; guard with continue-on-error but log failure. |
| Cost estimation drift (pricing changes) | Keep rate configurable via GitHub variable; document default assumption in README/Poc report. |
| Artifact growth | JSONL remains compact; remind Ops to purge artifacts post-PoC. |

## Deployment / Ops Considerations
- Requires new GitHub variable `GEMINI_COST_PER_CALL` (USD per request). Default e.g. `0.002` if unset.
- No additional secrets beyond existing `GEMINI_API_KEY`.
- Aggregation CLI should be runnable locally with `node scripts/automation/report-gemini-metrics.mjs --input ./path`.
- Ensure `.gitignore` already excludes `tmp/` artifacts.
