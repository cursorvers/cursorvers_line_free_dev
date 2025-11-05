# Design – Gemini Log Summary PoC

## Architecture Overview
- **Trigger Point**: Additional step inside `.github/workflows/line-event.yml` after log commit.
- **Execution**: Node script `scripts/automation/run-gemini-log-summary.mjs` gathers sanitized logs, invokes Gemini via REST, and writes results to `tmp/gemini/log-summary.json`.
- **Workflow Integration**: Step runs with `continue-on-error: true`. Output status and summary are appended to the GitHub Step Summary, and artifact upload is handled via `actions/upload-artifact@v4`.
- **Security Controls**: Inputs are sanitized to retain hashed IDs and metadata only; message text is not transmitted. Secret usage is limited to GitHub Actions through `GEMINI_API_KEY`.

## Data Flow
```
logs/progress/*.json
   │
   ├─ read & sanitize (strip message bodies, keep metadata)
   ▼
payload JSON
   │  (POST)
   ▼
Gemini API → structured JSON → tmp/gemini/log-summary.json
                           │
                           ├─ Step summary output
                           └─ Artifact (gemini-log-summary)
```

## Key Components
- `scripts/automation/run-gemini-log-summary.mjs`
  - Augments limiting, sanitization, prompt construction, and response parsing.
  - Exposes helper functions for testing (`sanitizeLogPayload`, `collectSanitizedLogs`, `callGemini`).
- `tests/node/gemini-log-summary.test.mjs`
  - Covers sanitization, skip behavior (no API key), happy-path parsing, and mocked API calls.
- `.github/workflows/line-event.yml`
  - Inserts the Gemini step, artifact upload, and summary reporting.
- `config/workflows/required-secrets.json`
  - Adds `GEMINI_API_KEY` to existing verifier.
- `docs/automation/GEMINI_POC_REPORT.md`
  - Template for recording pilot outcomes.

## Alternative Considerations & Rejections
- **Direct Edge Function integration**: Rejected to keep PoC scope limited to GitHub Actions.
- **Storing summaries in Supabase**: Out of scope; artifact output suffices for evaluation.
- **Using existing GPT tooling**: Maintained Codex/GPT flows untouched; Gemini is isolated to provide comparative signal.

## Testing Strategy
- Unit tests for script sanitization, API mocks, and missing-secret paths (`npm test`).
- Workflow dry-run via `workflow_dispatch` once secrets are configured; verify artifact and Step Summary content.
- Optional local dry-run: `node scripts/automation/run-gemini-log-summary.mjs --input tests/fixtures/logs --output /tmp/out.json`.

## Deployment / Ops Notes
- Require new GitHub Secret `GEMINI_API_KEY`.
- No additional runtime dependencies beyond Node 20 (available in Actions) and HTTPS access.
- PoC outputs should be reviewed and purged post-pilot according to security guidelines.
