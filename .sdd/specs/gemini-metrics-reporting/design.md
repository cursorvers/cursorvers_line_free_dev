# Design – Gemini Metrics Weekly Reporting

## Architecture Overview
- **Workflow**: New scheduled GitHub Actions workflow (`gemini-weekly-report.yml`) executed weekly (cron) and on-demand via `workflow_dispatch`.
- **Data Retrieval**: Uses `actions/download-artifact@v4` with filters to fetch `gemini-metrics` artifacts from the past 7 days. Artifacts are JSONL files created by `line-event.yml`.
- **Processing**: Invokes existing `scripts/automation/report-gemini-metrics.mjs` to aggregate metrics. Adds a small wrapper script/command to support date filtering.
- **Outputs**:
  - Markdown summary saved to `tmp/gemini-weekly/report.md` and JSON summary to `tmp/gemini-weekly/report.json`.
  - GitHub Step Summary includes headline metrics and warning banners when thresholds crossed.
  - Slack notification posts condensed message with success rate, average latency, total cost, and link to workflow run.
  - Artifact upload (`gemini-weekly-report`) bundles Markdown + JSON.

## Data Flow
```
+--------------------------+
| gemini-weekly-report.yml |
+--------------------------+
        |
        | download artifacts (actions/download-artifact)
        v
  tmp/gemini-weekly/*.jsonl
        |
        | run report script (node)
        v
  tmp/gemini-weekly/report.json
  tmp/gemini-weekly/report.md
        |
        | Step summary + Slack message + artifact upload
        v
  Stakeholders consume weekly digest
```

## Components & Approach
1. **Workflow (`.github/workflows/gemini-weekly-report.yml`)**
   - Inputs: `days` (default 7), `threshold` (default 0.9) for manual dispatch.
   - Steps:
     1. Checkout repository.
     2. Use `actions/download-artifact` with `pattern: gemini-metrics*` and `path: tmp/artifacts`. For multiple runs, allow partial failures and continue.
     3. Execute wrapper Node script (see 2) to merge JSONL files within date window.
     4. Append Step Summary including success rate, averages, warnings.
     5. Send Slack message (optional) using `SLACK_WEBHOOK_GEMINI` secret.
     6. Upload markdown/json as artifact.

2. **Wrapper Script (`scripts/automation/prepare-gemini-weekly-report.mjs`)**
   - Accepts `--input <dir>` (artifact path), `--days`, `--start`, `--end`, `--output-json`, `--output-md`, `--threshold`.
   - Filters JSONL entries by timestamp range before delegating to `report-gemini-metrics.mjs` (which aggregates entire dataset).
   - Produces both JSON summary and Markdown (via existing `formatMarkdown`).
   - Returns structured stats with warning flag for success rate < threshold.

3. **Slack Notification**
   - Reuse simple curl webhook (no additional library). Payload includes success rate, avg latency/duration, total cost, failures.
   - Only send if secret is present; otherwise Step Summary suffices.

4. **Documentation**
   - Update `docs/automation/GEMINI_POC_REPORT.md` with instructions on accessing weekly reports.
   - Add mention in `.sdd/steering/tech.md` linking to scheduled workflow.

## Testing Strategy
- Unit tests for `prepare-gemini-weekly-report.mjs` verifying date filtering, threshold warnings, and Markdown output.
- CLI smoke test (node script) using sample artifacts in `tests/fixtures/gemini-metrics-weekly/**`.
- Manual `workflow_dispatch` dry-run in staging branch to ensure artifact download and Slack posting succeed.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Artifact download misses older runs due to retention | Document need for ≥7日 retention; optionally fall back to 3日 or allow manual override via `days` input. |
| Large artifact set causing long download times | Provide `days` input to narrow window; consider using `runs.list` + `curl` as fallback if needed. |
| Slack secret missing | Workflow logs warning and skips message; Step Summary remains primary output. |
| Timezone confusion | Cron scheduled in UTC but documented as JST equivalent; wrapper script uses UTC timestamps from JSONL. |

## Deployment / Ops Considerations
- Configure new GitHub secret `SLACK_WEBHOOK_GEMINI` (optional) and variable `GEMINI_WEEKLY_THRESHOLD` if customization needed.
- Ensure repository artifact retention period >= reporting window.
- Document manual rerun procedure (workflow_dispatch with custom dates) for Ops.
