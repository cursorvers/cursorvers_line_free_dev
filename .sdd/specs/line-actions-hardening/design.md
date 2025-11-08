# Line Actions Hardening – Design

## 1. Objectives & Scope
- Harden the LINE automation GitHub Actions so every run is reproducible, well-instrumented, and maintainable by internal operators or contracted teams.
- Deliver all nine acceptance criteria from `.sdd/specs/line-actions-hardening/requirements.md`: workflow inventory, router consolidation, vendored helpers, pre-flight validation, resilient log persistence, automated checks, external runbook, parameter registry/CLI, and metrics observability.
- Preserve existing behavior controlled by `MANUS_ENABLED`, `DEGRADED_MODE`, and `DEVELOPMENT_MODE` while eliminating runtime downloads and clarifying degraded-mode fallbacks.

## 2. System Architecture

### 2.1 Boundaries & Data Flow
```
LINE Edge → GitHub repository_dispatch(line_event) ┐
                                                   │
Manus Webhook → GitHub repository_dispatch(manus) ─┼─> .github/workflows/webhook-handler.yml
                                                   │        ↓ (dispatch rules via scripts/webhook-router.mjs)
                                                   │
                                         ┌─────────┴────────┐
                                         │                  │
                                   line-event.yml     manus-progress.yml
                                         │                  │
                                         │                  └─> scripts/vendor/supabase/upsert-progress-event.js
                                         │
                                         ├─> scripts/vendor/supabase/upsert-line-event.js
                                         ├─> scripts/vendor/google/upsert-line-member.js
                                         ├─> orchestration/plan/**/*.json (plan selection)
                                         ├─> scripts/manus-api.js (dev-only Manus dispatch)
                                         ├─> scripts/automation/run-gemini-log-summary.mjs
                                         └─> .github/actions/persist-progress → git commit ∥ artifact fallback
```
- Upstream LINE/Manus ingress and Supabase/Google APIs remain unchanged; this spec focuses on GitHub-side automation and repo assets.
- All executable helpers are checked into `scripts/` (either hand-written or vendor-synced with checksums). Workflows must not fetch remote code at runtime.
- Telemetry (logs, metrics) is persisted via git commits when possible and falls back to GitHub Artifacts via `persist-progress`.

### 2.2 Components & Responsibilities
| Layer | Responsibility | Key Assets |
| --- | --- | --- |
| Router | Canonical entry point that normalizes GitHub events & dispatches follow-up workflows | `.github/workflows/webhook-handler.yml`, `scripts/webhook-router.mjs` |
| Primary workflows | Event ingestion, plan management, Manus progress reconciliation, guardrails | `.github/workflows/line-event.yml`, `manus-progress.yml`, `economic-circuit-breaker.yml`, `rotate-logs.yml` |
| Composite actions | Shared validation, persistence, parameter checks | `.github/actions/validate-config`, `.github/actions/persist-progress`, (new) `.github/actions/check-runtime-config` |
| Script library | Business logic executed by workflows | `scripts/vendor/**`, `scripts/checks/**`, `scripts/logs/archive.mjs`, `scripts/automation/*.mjs`, `scripts/manus/*.mjs` |
| Governance docs | Runbooks, workflow inventory, parameter tables, steering pointers | `docs/automation/WORKFLOWS.md`, `docs/runbooks/line-actions.md`, `docs/operations/runtime-config.md`, `.sdd/steering/tech.md` |
| Telemetry sinks | Metrics aggregation, artifacts, KPI exports | `logs/**`, `scripts/automation/report-gemini-metrics.mjs`, `gemini-*` workflows |

### 2.3 Patterns & Tooling
- GitHub-hosted runners on `ubuntu-latest`, Node.js 20 & Python 3.11 toolchains, `actions/setup-node` / `setup-python`.
- `node:test`, `assert`, `undici` MockAgent for deterministic unit tests covering workflow scripts.
- Composite actions to encapsulate bash + Node glue with clear inputs/outputs.
- `actionlint` and `npm run vendor:verify` enforced in CI to catch workflow syntax issues and manifest drift.
- `act` smoke tests gated by opt-in label to verify happy paths (`line-event`, `manus-progress`) using mocked secrets.

## 3. Detailed Approach (mapped to requirements)

### 3.1 Workflow Inventory & Ownership (AC1)
- Extend `scripts/automation/generate-workflow-inventory.mjs` to include triggers, `permissions`, owning team (`x-owner`), and links to validation/config manifests.
- Regenerate `docs/automation/WORKFLOWS.md` and add a CI guard (new job inside `node-tests.yml`) that fails if the checked-in table diverges from script output.
- Update `.sdd/steering/tech.md` to link the inventory so on-call engineers have a single source of truth.

### 3.2 Vendored Helper Packaging (AC2)
- Maintain helpers in `scripts/vendor/*` with entries in `scripts/vendor/manifest.json` recording source URL & SHA-256; add `manifest.lock.json` to pin digest, file size, and sync timestamp.
- Expand `scripts/vendor/sync.mjs` and `npm run vendor:verify` to diff against the lock file and fail CI if vendored files change without manifest updates.
- Update `line-event.yml` and `manus-progress.yml` to invoke helpers exclusively via `node scripts/vendor/...` (already partially in place) and document refresh workflow in the runbook.

### 3.3 Router Consolidation (AC3)
- Keep `webhook-handler.yml` as the single router: ensure redundant routers (`webhook-event-router.yml`, legacy jobs) are deleted or archived.
- Refactor router steps to call `node scripts/webhook-router.mjs <event> <action>`, passing payload context via environment (labels, comment body, issue number). Add unit tests for routing rules in `tests/actions/webhook-router.test.mjs`.
- Document routing policy (supported events, fallback behavior) inside `docs/automation/WORKFLOWS.md` and the runbook.

### 3.4 Pre-flight Config Validation (AC4)
- Expand `config/workflows/required-secrets.json` with descriptions, support for alternative groups, and references to runtime parameter IDs.
- Evolve `.github/actions/validate-config` so each workflow step enumerates missing items with remediation hints and fails before expensive jobs run. Respect `SKIP_CONFIG_VALIDATION=true` for controlled bypass.
- Introduce `.github/actions/check-runtime-config` (wrapper around the CLI below) to surface aggregated results and GitHub Step Summary tables.

### 3.5 Failure-Safe Log Persistence (AC5)
- Harden `.github/actions/persist-progress` to:
  1. Stage provided log files and attempt commit/push using the workflow token or PAT (document required scopes).
  2. On failure, call `node scripts/logs/archive.mjs` to bundle files under `tmp/log-artifacts/<timestamp>` and upload via `actions/upload-artifact@v4` with configurable retention (default 90 days).
  3. Emit `GITHUB_STEP_SUMMARY` and `::notice::` output with retrieval instructions.
- Update workflows (`line-event`, `manus-progress`, `rotate-logs`, `economic-circuit-breaker`) to call the composite with meaningful commit messages and artifact labels.
- Add rotation guidance (artifact pruning, repo cleanup) to the runbook.

### 3.6 Automated Checks & Coverage (AC6)
- Ensure `node-tests.yml` runs `npm test`, `npm run test:actions`, `npm run lint`, `npm run vendor:verify`, and `actionlint`. Require this workflow on PRs.
- Add fixtures & tests covering: Supabase/Sheets helpers (mock fetch), `scripts/logs/archive.mjs`, config validation CLI, router dispatch, and metrics aggregation.
- Add optional `ci-smoke-act.yml` triggered by `ci-smoke` label that runs `act` for the two primary workflows with sanitized secrets to catch regression in job wiring.

### 3.7 External Maintenance Runbook (AC7)
- Author `docs/runbooks/line-actions.md` covering: Git worktree clone, flag toggles (`gh variable set`/`gh secret set`), degraded mode recovery, running verification scripts locally, retrieving artifacts, and escalation paths.
- Cross-link from `.sdd/steering/tech.md`, `README.md`, and workflow failure notices (Step Summary + notifications).
- Provide runbook checklists for quarterly review and onboarding of subcontractors.

### 3.8 Runtime Parameter Registry & CLI (AC8)
- Create `config/workflows/runtime-parameters.json` enumerating operational flags (e.g., `MANUS_ENABLED`, `DEGRADED_MODE`, `GEMINI_COST_PER_CALL`, webhook URLs) with fields: `id`, `type`, `required`, `default`, `location` (`secret` or `variable`), `owner`, `description`.
- Implement `scripts/checks/verify-runtime-config.mjs` to compare registry expectations against current env (`gh variable list`, `gh secret list`, or provided JSON). Output machine-readable status plus GitHub Summary.
- Wrap the CLI in `.github/actions/check-runtime-config` for CI and local use; expose via `npm run runtime:verify`.
- Update `docs/operations/runtime-config.md` with table exports and instructions for updating registry entries.

### 3.9 Metrics & Observability (AC9)
- Standardize Gemini metrics: extend `scripts/automation/run-gemini-log-summary.mjs` to persist sanitized output and record status/latency/cost in JSONL under `logs/metrics/gemini/<date>.jsonl`.
- Add `scripts/automation/report-gemini-metrics.mjs` aggregation (already present) to compute success rate, latency percentiles, cost totals, and anomaly tags. Produce Markdown/CSV artifacts and optional Slack-friendly summary.
- Update `gemini-metrics` workflows to run nightly, upload artifacts through `persist-progress`, and link metrics to Ops dashboards. Document retention & rotation strategy.

## 4. Data Models & Contracts
- **Workflow Inventory (`docs/automation/WORKFLOWS.md`)**: Deterministic Markdown generated from JSON snapshot, including columns `{workflow, file, owner, triggers, permissions, config reference}`.
- **Vendor Manifest (`scripts/vendor/manifest.json` + `manifest.lock.json`)**: Array of `{id, source, target, sha256, size, last_synced_at}` entries. `npm run vendor:verify` recomputes digests and fails on mismatch.
- **Runtime Parameter Registry (`config/workflows/runtime-parameters.json`)**: 
  ```json
  {
    "parameters": [
      {
        "id": "MANUS_ENABLED",
        "type": "boolean",
        "required": true,
        "default": "true",
        "location": "variable",
        "owner": "ops",
        "description": "Toggle Manus dispatch in production workflows."
      }
    ]
  }
  ```
- **LINE Event Payload (`tmp/event.json`)**: Stored JSON including `event_id`, `received_at`, `events[]` with `type`, `timestamp`, `source.userId`, sanitized before Supabase insert (`scripts/vendor/supabase/upsert-line-event.js`).
- **Progress Event Payload (`tmp/progress-event.json`)**: Contains Manus response fields (`decision`, `retry_after_seconds`, `plan_variant`) consumed by `scripts/vendor/supabase/upsert-progress-event.js`.
- **Gemini Metrics (`logs/metrics/gemini/*.jsonl`)**: JSONL entries with `run_id`, `timestamp`, `status`, `duration_ms`, `latency_ms`, `cost_estimate`, `logs_count`, `model`.
- **Log Artifacts (`tmp/log-artifacts/<timestamp>`)**: TAR/zip-friendly directory produced by `scripts/logs/archive.mjs` for artifact upload; naming scheme `<label>-<yyyymmddhhmmss>`.

## 5. Risks & Mitigations
- **Insufficient token scope to push logs**: Mitigate by documenting PAT requirements, using environment-protected secrets, and relying on artifact fallback when push fails.
- **Vendored script drift or tampering**: Lock digests, enforce `vendor:verify` in CI, and document sync cadence in the runbook.
- **Runtime parameter rot**: Schedule nightly `runtime:verify` workflow posting failures to Ops channel; embed reminders in onboarding checklist.
- **`act` smoke tests flaking**: Keep optional, cache Docker images, and allow retry; do not block PRs on failures without reproduction.
- **Artifact retention not meeting compliance**: Default retention to 90 days, surface metadata in summary, and confirm with Compliance before rollout.
- **Google/Supabase schema changes**: Add unit tests that stub API responses and run contract checks (`npm run test:actions`), ensuring failures are caught before deployment.

## 6. Testing Strategy
- **Unit tests (`npm test`)**: Cover vendor sync utilities, config validators, log archiver, metrics collectors, and router decision logic with fixtures under `tests/node` and `tests/actions`.
- **Composite action tests (`npm run test:actions`)**: Use `execa`+snapshot assertions to validate `.github/actions/validate-config`, `.github/actions/persist-progress`, and the new `check-runtime-config`.
- **Static analysis**: `actionlint`, `npm run lint`, `npm run vendor:verify`, secret-scanner if available.
- **Integration / Smoke**: Optional `act` workflow (label-gated) executing `line-event.yml` in normal/degraded modes and `manus-progress.yml` to ensure repo-dispatched payloads succeed without external fetches.
- **Manual verification**: Runbook checklist for external operators to rehearse degraded-mode flip, secret verification CLI, and artifact retrieval at least once per quarter.

## 7. Deployment & Migration Plan
1. **Vendor hardening**: Introduce `manifest.lock.json`, update `scripts/vendor/sync.mjs`, and regenerate vendored helpers. Run `npm run vendor:verify`.
2. **Inventory & docs**: Regenerate workflow inventory, link from steering doc, and add CI guard.
3. **Router cleanup**: Update `webhook-handler.yml` to rely on `scripts/webhook-router.mjs`, remove legacy router workflows, add tests.
4. **Validation upgrades**: Enhance `validate-config`, add runtime parameter registry + CLI + composite, and wire into critical workflows.
5. **Persistence improvements**: Update `persist-progress` and retrofit workflows to use it consistently; document PAT requirements.
6. **Metrics & telemetry**: Finalize Gemini metrics aggregation, ensure artifacts uploaded via new persistence path, and add scheduling.
7. **Runbook & onboarding**: Publish external maintenance runbook, parameter table, and link from notifications.
8. **CI uplift**: Enforce expanded CI steps, optionally add `act` smoke job, and update status checks.
9. **Sign-off**: Run through runbook dry-run with Ops and Compliance; record approvals and archive design in `sdd-archive`.

## 8. Alternatives Considered
- **Shipping helpers as a private npm package**: Rejected due to additional supply-chain risk and need for registry availability during outages; vendoring keeps repo self-contained.
- **Persisting logs directly to Supabase**: Deferred because it complicates PHI handling and token scopes; GitHub Artifacts satisfy retention/compliance with minimal risk.
- **Multiple routers per domain**: Rejected to avoid split-brain routing logic and duplicated validation; single router simplifies maintenance and auditing.

## 9. Dependencies & Follow-ups
- Dedicated Actions PAT with `contents:write` scope stored in environment-protected secret.
- Confirmation from Compliance on artifact retention (target 90 days) and runtime parameter documentation format.
- Ops team to own runtime parameter registry and review runbook quarterly.
- Schedule periodic vendor manifest refresh (e.g., monthly) and record in release checklist.
