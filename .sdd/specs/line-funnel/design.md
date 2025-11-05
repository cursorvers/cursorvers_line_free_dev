# Design – Cursorvers LINE Funnel

## Scope & Goals
- Deliver a GitHub Actions–first automation funnel that converts note article readers into LINE subscribers, nurtures them with compliant messaging, and escalates qualified leads toward consulting offerings.
- Enforce medical safety guardrails on every outbound communication while keeping Manus usage to cost-efficient “last mile” automations with deterministic fallbacks.
- Maintain dual-write persistence between Supabase (system of record) and a Google Sheets interim ledger so Ops can audit membership, tags, and campaign performance.
- Surface real-time telemetry and audit trails through GitHub (workflows, job summaries, committed logs) without allowing repository growth to run unchecked.
- In scope: Front Door Edge function (Supabase Edge or Cloudflare Workers), repository_dispatch integration, GitHub Actions workflows, orchestration scripts (Node/Python), Supabase + Google Sheets persistence, logs/telemetry surfaces, feature flags and degraded-mode handling.
- Out of scope: Legacy `Cursorvers_LINEsystem/` flows, advanced segmentation beyond CTA tags, bespoke CRM tooling; these remain future iterations.

## Architecture Overview

### System Boundaries & Data Flow
```
note CTA -> LINE Official Account webhook
             |
             v
Front Door (Supabase Edge / CF Workers, TypeScript)
  - Verify signature, sanitize payload, dedupe via KV + memory cache
  - repository_dispatch {line_event | manus_progress}
             |
             v
GitHub Actions Orchestration
  ├─ line-event.yml (plan selection, persistence, outbound messaging)
  ├─ manus-progress.yml (progress ingestion, retry/degrade decisions)
  ├─ economic-circuit-breaker.yml (budget guardrails, degraded flags)
  ├─ weekly-kpi-report.yml & supporting monitors (telemetry, rotation)
             |
             v
Supabase (progress_events, line_members, budget_snapshots)
Google Sheets ledger (hashed subscriber metadata)
GitHub logs/progress commits + job summaries + notifications
Optional Manus API requests (development + Manus enabled only)
```

### Component Responsibilities
- **Front Door Edge Function (`functions/relay`)**
  - Validates LINE HMAC (`X-Line-Signature`) or Manus bearer token.
  - Hashes user identifiers with `HASH_SALT`, redacts message bodies when configured, and ensures PHI minimization.
  - Uses KV (Supabase Deno KV or Workers KV) with memory fallback for dedupe keys derived from user, timestamp, and message id to guarantee idempotency.
  - Dispatches normalized payloads to GitHub via `repository_dispatch` with `event_type` of `line_event` or `manus_progress`.

- **GitHub Actions Workflows (`.github/workflows/*.yml`)**
  - `line-event.yml`: Loads `scripts/lib/feature-flags.js`, resolves plan mode (production vs degraded), selects plan JSON from `orchestration/plan/`, invokes `orchestration/cost.py`, updates Supabase and Google Sheets via Node helpers, enforces guardrail footer templates, and optionally calls Manus when feature flags permit.
  - `manus-progress.yml`: Processes Manus progress or PlanDelta payloads, updates Supabase progress events, applies retry/degrade decisions, emits telemetry, and respects concurrency/idempotency locks.
  - Budget and observability workflows (`economic-circuit-breaker.yml`, `weekly-kpi-report.yml`, `rotate-logs.yml`, `verify-secrets.yml`) manage cost ceilings, flag files, log retention, and secret validation to keep the system healthy.

- **Patterns & Libraries**
  - Event-driven choreography using `repository_dispatch` keeps business logic inside GitHub Actions where Ops already operates; we stick with GitHub-native concurrency groups and summaries for auditability.
  - Edge runtime stays in portable TypeScript (Deno-compatible) leaning on standard Web APIs, `createHash` from Deno/Workers, and `fetch` to avoid heavy dependencies while fitting Supabase Edge and Cloudflare Workers.
  - Node side remains ESM with built-in `fetch`, light utilities in `scripts/lib`, and direct REST calls (`/rest/v1`) instead of SDKs to minimise cold-start footprint inside Actions.
  - Google Sheets integration issues signed JWTs manually via `fetch` to `oauth2.googleapis.com/token` and raw Sheets REST writes, matching the existing `scripts/sheets/upsert-line-member.js` approach.
  - Python tooling sticks to stdlib + `requests`-style `urllib` (already in repo) inside `orchestration/cost.py`; no third-party packages keeps Actions runners lean and avoids dependency pinning risk.

- **Alternatives Considered**
  - Leveraging Supabase Functions for full orchestration (bypassing GitHub Actions) was rejected because it fragments operational ownership; Actions keep approvals, logs, and cost governance in one place per business requirement.
  - Introducing a managed queue (e.g., Supabase Realtime, Redis) between Front Door and Actions was declined due to added latency and maintenance—`repository_dispatch` already gives retries and back-pressure when combined with dedupe cache.
  - Adopting the official Supabase JS SDK or Google client libraries inside workflows was considered but dismissed to avoid bundling large dependencies and to simplify secret handling in ephemeral runners.
  - Using Manus as the primary planner for all outreach steps was rejected per D3/D5 decisions; we reserve Manus for last-mile automations so the degraded ICS + LINE-only path stays reliable and affordable.

- **Orchestration Scripts**
  - Node scripts under `scripts/` provide connectors for Google Sheets (service account), Supabase REST, plan validation, and `feature-flags` utilities.
  - Python `orchestration/cost.py` evaluates Manus point consumption and plan compliance against `BUDGET.yml`, surfacing warnings and triggering degraded mode when thresholds are exceeded.
  - Shell utilities (e.g., `scripts/rotate-logs.sh`, `scripts/verify-secrets.sh`) offer operational automation executed inside workflows.

- **Data Stores & Observability**
  - Supabase tables (`progress_events`, `line_members`, `budget_snapshots`) act as the primary system of record.
  - Google Sheets ledger keeps hashed LINE identifiers, subscription timestamps, and campaign/tag metadata for auditors until Supabase migration completes.
  - GitHub `logs/progress/` JSON snapshots, job summaries, and notifications (Slack/webhooks) provide auditable traces with rotation (90-day active, 1-year retention in archive).

### Detailed Flow Scenarios
- **Inbound LINE Message**
  1. Line OA posts webhook → Front Door validates signature and deduplicates event.
  2. Front Door emits `repository_dispatch` (`event_type=line_event`) carrying sanitized events and dedupe metadata.
  3. `line-event.yml` resolves configuration (`MANUS_ENABLED`, `DEGRADED_MODE`, flags), selects plan, runs `orchestration/cost.py` to estimate Manus spend.
  4. Workflow upserts `line_members` (Supabase) and updates Google Sheets ledger; failures short-circuit downstream steps and alert via summary + webhook.
  5. Outbound messaging: compose templates with safety footer, dispatch via LINE Messaging API through existing Node scripts or CLI wrappers.
  6. When development + Manus enabled, optional Manus plan dispatch occurs; otherwise a degraded plan is executed (LINE + ICS fallback).
  7. Events/logs persisted to `logs/progress/` and telemetry emitted via `ProgressEvent v1.1` summary.

- **Manus Progress Notification**
  1. Manus posts progress webhook to Front Door with bearer token; sanitized payload retains decision, point usage, context.
  2. Front Door emits `repository_dispatch` (`event_type=manus_progress`) with normalized metadata and dedupe key.
  3. `manus-progress.yml` updates Supabase `progress_events`, reconciles current plan state, and applies retry/degrade helpers consistent with decision (retry/backoff/amend/abort).
  4. Workflow posts notifications, updates GitHub job summary, and commits delta logs where required.

## Technical Approach

### Patterns & Libraries
- Edge function written in TypeScript/Deno (std crypto, fetch), leveraging lightweight KV for dedupe and environment-provided secrets.
- GitHub Actions steps implemented with Node 20 (ESM) and Python 3.12 for cost governance, reusing repository-local libraries instead of external packages to avoid dependency drift.
- Repository_dispatch used as the universal ingress to keep GitOps alignment and reuse GitHub Actions orchestrators as the source of truth.

### Feature Flags, Plans, and Degraded Mode
- `scripts/lib/feature-flags.js` centralizes plan selection; `MANUS_ENABLED`, `DEGRADED_MODE`, and `degraded.flag` file toggle degrade paths.
- Production plans are stored under `orchestration/plan/production/*.json`; degraded plans (LINE-only + ICS) live beside them and are selected automatically when Manus is disabled or budgets exceeded.
- `economic-circuit-breaker.yml` reads budget telemetry, flips `degraded.flag`, and ensures workflows skip Manus dispatch during controlled rollbacks.

### Idempotency, Concurrency, and Cost Governance
- Front Door dedupe uses KV + memory caches with TTL (default 120s) keyed on hashed IDs and event metadata, preventing duplicate repository_dispatch events.
- Workflows store `idempotency_key` (hash of event id/user id/step) alongside Supabase writes to allow safe retries.
- `orchestration/cost.py` evaluates Manus plan steps, projecting daily/weekly spend before execution. Non-compliant plans trigger warnings, degrade toggles, or short-circuit Manus operations.
- GitHub Actions `concurrency` blocks ensure `line-event` and `manus-progress` do not trample each other for the same dedupe key.

### Observability & Telemetry
- Progress events are published as GitHub job summaries, optional Slack/webhook alerts, and JSON snapshots in `logs/progress/`.
- Budget, webhook success rate, Manus invocation counts, and heartbeat metrics are aggregated by scheduled workflows, feeding into Supabase tables (`budget_snapshots`, `kpi_snapshots`) and GitHub summaries.
- Rotate logs weekly via `scripts/rotate-logs.sh`, compressing archive >90 days and pruning >1 year to control repo growth.

### Security & Compliance Guardrails
- All secrets sourced from GitHub `vars`/`secrets`; Front Door uses OIDC or PAT with minimal scopes to dispatch events.
- LINE user identifiers hashed with salt prior to persistence; optional message redaction toggled via env to minimize PHI.
- Outbound templates append standardized medical-disclaimer footers (per requirements) and prompt users to seek emergency care when necessary.
- GitHub Actions enforce secret presence via `verify-secrets.yml` before plan execution.

### Alternative Approaches Considered
- **Dedicated backend service on Supabase/Cloud Run** was considered but rejected: it duplicates workflow orchestration, complicates auditability, and introduces another deployment surface outside GitOps.
- **Direct Manus-driven orchestration without GitHub Actions** was rejected: budgets, guardrails, and dual-write persistence are already encoded in workflows; bypassing them would erode cost governance and traceability.

## Data Models & API Contracts

### repository_dispatch Payloads
- `line_event` payload:
  ```json
  {
    "event_type": "line_event",
    "client_payload": {
      "dedupe_key": "sha256...",
      "destination": "LINE_CHANNEL_ID",
      "events": [
        {
          "type": "message",
          "timestamp": 1735776000000,
          "source": {"type": "user", "userId": "hashed-id"},
          "replyToken": "abcdef",
          "message": {"type": "text", "id": "123", "text": "hi or [redacted]"}
        }
      ],
      "received_at": "2025-01-08T12:34:56Z"
    }
  }
  ```
  Includes `HASH_SALT` hashed user ids, optional redaction, and metadata required for plan routing.

- `manus_progress` payload:
  ```json
  {
    "event_type": "manus_progress",
    "client_payload": {
      "dedupe_key": "sha256...",
      "progress_id": "task-123",
      "decision": "retry",
      "plan_variant": "production",
      "retry_after_seconds": 30,
      "manus_points_consumed": 12.5,
      "metadata": {
        "step_id": "s1",
        "event_type": "step_failed",
        "manus_run_id": "run-456",
        "context": {"trigger": "#参加", "user_ref": "hashed-id"},
        "preview": null,
        "error": {"code": "SUPABASE_503"}
      }
    }
  }
  ```

### Supabase Schema (authoritative)
- `line_members`: `id` (uuid), `hashed_line_user_id` (text, unique), `subscription_timestamp` (timestamptz), `cta_tag` (text[]), `last_message_at`, `source_campaign`.
- `progress_events`: `id` (uuid), `progress_id`, `plan_variant`, `step_id`, `status`, `manus_points`, `metadata` (jsonb), `event_timestamp`, `raw_payload` (jsonb), `created_at`.
- `budget_snapshots` / `kpi_snapshots`: scheduled inserts capturing spend, opt-in rate, heartbeat success metrics for weekly reporting.

### Google Sheets Ledger (interim CRM)
- Columns: `hashed_line_user_id`, `original_line_user_id` (optional hashed reference), `display_name`, `subscription_timestamp`, `cta_tag`, `consent_version`, `last_outbound_at`, `notes`.
- Access controlled via Google service account; monthly reconciliation script (`scripts/reconcile-ledgers.ts`) compares Supabase vs Sheets and posts discrepancies to Slack.

### Logs and Artifacts
- `logs/progress/YYYY/MM/DD/<event-id>.json`: appended by workflows with status, plan variant, Manus decision, and context.
- Archived logs compressed into `logs/progress/archive/YYYY-MM/*.json.gz` after 90 days.
- GitHub job summaries expose aggregated metrics, linked to Supabase for dashboards.

## Testing Strategy
- **Unit Tests**
  - Deno tests for Front Door utilities (`verifySignature`, `hashUserId`, dedupe) covering signature verification, hashing correctness, and fallback behavior.
  - Node `node --test` suites for feature flags (`tests/node/feature-flags.test.mjs`), Sheets/Supabase helper stubs, and plan validation scripts (dry-run using fixtures).
  - Python unit tests for `orchestration/cost.py`, validating budget calculations and degraded-mode triggers.
- **Integration Tests**
  - Use `act` or GitHub Actions workflow dry-runs with fixture payloads to validate repository_dispatch handling, Supabase/Sheets connectors (mocked via env), and guardrail footers.
  - Replay progress events via `scripts/diagnose-manus-stack.sh` to ensure retry/degrade logic is idempotent.
- **End-to-End Validation**
  - Stage Front Door in Supabase Edge/Workers preview, fire signed LINE and Manus payloads, and observe end-to-end execution in a sandbox repository with mirrored secrets.
  - Budget governor simulation: seed `BUDGET.yml` thresholds and verify `economic-circuit-breaker.yml` flips `degraded.flag`, triggering LINE + ICS fallback.
- **Regression & Compliance Checks**
  - `verify-secrets.yml` ensures required secrets/vars exist prior to deployments.
  - Scheduled tests confirm `scripts/rotate-logs.sh` and reconciliation scripts keep storage within policy.

## Deployment & Migration Considerations
- **Prerequisites**
  - Populate GitHub repo secrets/vars: `GH_PAT` (workflow scope), `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Google service account JSON (base64), `MANUS_API_KEY`, budget thresholds.
  - Configure Supabase Edge / CF Workers environment variables mirroring Front Door `RelayEnv` keys plus `HASH_SALT` and `REDACT_LINE_MESSAGE`.
- **Front Door Deployment**
  - Build & upload `functions/relay` to Supabase Edge or Workers via existing deployment pipeline; ensure KV namespace and environment bindings exist.
  - Smoke-test webhook endpoints with signed fixtures (`scripts/tests/fixtures/line-event.json` if available) before flipping DNS.
- **GitHub Actions Rollout**
  - Enable `repository_dispatch` workflows; ensure concurrency groups and permissions are updated for new plan/telemetry steps.
  - Merge plan JSON updates and `BUDGET.yml` thresholds; run `scripts/plan/validate-plan.js` during CI to avoid malformed plans.
  - Schedule `rotate-logs.yml`, `weekly-kpi-report.yml`, and `economic-circuit-breaker.yml` to guarantee telemetry/retention.
- **Data Migration**
  - Initialize Supabase tables with migrations under `database/migrations/`; seed Google Sheets ledger headers and share per D2 decision.
  - Run reconciliation script post go-live to confirm dual-write consistency; escalate mismatches via Slack.
- **Rollout & Fallback**
  - Launch in staged mode with `MANUS_ENABLED=false` to validate degraded plan end-to-end, then gradually enable Manus in development mode.
  - Maintain ICS fallback template in `docs/alerts/line_degraded_outreach.ics`; ensure ops playbook is linked in RUNBOOK.
  - Rollback strategy: disable Manus + enable `DEGRADED_MODE`, pause webhook ingestion via GitHub Actions concurrency cancelation, and route messages manually per D3.

## Risks & Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| GitHub Actions outage or repository_dispatch failure | Inbound events backlog; potential message delays | Provide retry/backoff at Front Door, monitor webhook failure counts, document manual ICS fallback, allow temporary reroute via Supabase Edge queue. |
| Manus cost spikes beyond budget | Exceeds allocated points, triggers unexpected spend | Mandatory `orchestration/cost.py` estimation, `economic-circuit-breaker.yml` enforcing `degraded.flag`, daily spend telemetry in Supabase/KPI report. |
| Supabase ↔ Google Sheets data drift | Audits fail, inconsistent subscriber state | Scheduled reconciliation script with Slack alerts, manual quarterly review per D2, degrade to Supabase as source of truth when drift exceeds threshold. |
| PHI leakage via logs or Sheets | Compliance breach | Hash/redact data in Front Door, guardrail footer enforcement, redaction feature flag defaulting to true in production, restricted Sheets access. |
| Repository bloat from `logs/progress` commits | Slower clones, potential GitHub limits | Weekly `rotate-logs.yml`, archive compression, warn at 100MB and prune >1 year as per D4. |
| Feature flag misconfiguration | Wrong plan path executed, either overusing Manus or skipping guardrails | Centralize flag resolution in `feature-flags.js`, add unit tests, run `verify-secrets.yml` & configuration assertions at workflow start, document change control. |
| Remote CLI downloads in workflows (e.g., `wget yq`) | Supply-chain risk, runner variability | Pin checksum/version, vendor binaries into repo or swap to maintained setup action; document verification steps in `economic-circuit-breaker` rollout. |
| Pending stakeholder KPI/cadence details | Misaligned automation cadence or success metrics | Track outstanding questions in steering docs, parameterize message cadence via GitHub vars, plan follow-up review before `/sdd-tasks` execution. |
| External API quota exhaustion (LINE, Google Sheets) | Message delivery failures, data sync gaps | Monitor API responses, metrics in job summaries, implement exponential backoff + alerting, keep ICS/manual templates ready. |

## Alignment & Next Steps
- Review this design with Product, Ops, and Infra stakeholders to validate guardrails, data retention, and degraded workflows.
- Once agreed, proceed to `/sdd-tasks` to break down implementation workstreams (Front Door enhancements, workflow updates, telemetry instrumentation, data migrations, testing harness improvements).
