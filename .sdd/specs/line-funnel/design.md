# Design – Cursorvers LINE Funnel

## Scope & Decisions
Implements the LINE funnel with verified Front Door dispatch to GitHub Actions, hashed contact logging to Google Sheets, safety-footed messaging, and hardened LINE Daily Brief. Existing Supabase functions remain the runtime; we will (a) adapt `supabase/functions/line-webhook` to act as the Front Door (signature/idempotency/sanitize → repository_dispatch) and (b) keep `line-daily-brief` on Supabase with required fixes. If stakeholders prefer a new minimal relay, we can factor logic into `functions/relay/index.ts` later with the same contracts.

Known open items (cannot block design): Sheets retention/salt ownership; messaging cadence/segmentation; degraded path specifics when Manus/budget is unavailable; credentials readiness.

## Architecture Overview
```
[note article CTA] → [LINE add friend]
      │  (X-Line-Signature, POST)
      ▼
Supabase Edge Front Door (line-webhook adaptation)
  - Verify LINE signature (HMAC-SHA256)
  - Sanitize & hash userId with managed salt
  - Idempotency cache (KV/in-memory with TTL)
  - Emit GitHub REST POST /repos/{owner}/{repo}/dispatches
      event_type: line_event
      client_payload: sanitized event + metadata
      │
      ▼
GitHub Actions
  - line-event.yml: load plan/cost, mode (normal/degraded), Supabase upsert, Sheets ledger, Manus optional, LINE reply with safety footer
  - manus-progress.yml: log ProgressEvent, analyze, optional Manus dispatch
  - cron: line-daily-brief.yml calls Edge function daily 07:00 JST
      │
      ▼
Supabase/External
  - Supabase tables (line_cards, etc.) for daily brief
  - Google Sheets ledger (hashed IDs)
  - LINE Messaging API for replies/broadcasts
  - Manus (last-mile) guarded by budget flags
```

### Component Responsibilities
- **Front Door (line-webhook adapted)**:
  - Validate signature; reject missing/invalid.
  - Hash `userId` with SHA-256 + salt (env) before forwarding.
  - Apply idempotency cache per event hash; drop duplicates.
  - Dispatch to GitHub via PAT (`GH_PAT`) using `repository_dispatch`.

- **GitHub Actions**:
  - `line-event.yml`: ensure plan assets, resolve degraded mode, run cost check, upsert Supabase (script), upsert Sheets ledger (hashing helper), invoke Manus only when enabled, append safety footer to replies.
  - `manus-progress.yml`: log progress JSON, (future) GPT analysis, optional Manus follow-up; ensure no missing TODOs.
  - `line-daily-brief.yml` (new): cron 07:00 JST, call Edge daily brief endpoint with auth; alert on failure.

- **Orchestration assets**:
  - `orchestration/plan/current_plan.json`, degraded plan/flag, Manus brief, `orchestration/cost.py`.
  - Scripts: plan delta generator (dev), Supabase upsert, Sheets upsert, Manus dispatch helper.

- **Daily Brief (Supabase Edge)**:
  - Fix CRITICAL/HIGH: parameterized queries, env validation at startup, retry/backoff for LINE API (429 Retry-After), simplified card update.
  - Optional medium: metrics to `line_card_broadcasts`, structured logging, DB-side theme stats.

- **Guardrails**:
  - Safety footer helper required for all outbound LINE messages.
  - Budget guard: degrade to non-Manus paths when thresholds exceeded or disabled.

### Data Models & Contracts
- **Dispatch payload (Front Door → GitHub)**:
  ```json
  {
    "event_type": "line_event",
    "client_payload": {
      "source": "line",
      "event_id": "hash(raw body + ts)",
      "received_at": "ISO8601",
      "events": [ /* sanitized, userId hashed */ ],
      "signature_valid": true,
      "idempotency_key": "hash(event)"
    }
  }
  ```
- **Sheets ledger columns**: `line_user_hash`, `display_name`, `status`, `tags`, `source_article`, `registered_at`, `last_active_at`, `channel`, `notes` (optional). Hash: SHA-256(userId + salt).
- **Safety footer**: shared constant appended to every LINE message body (single helper).
- **Daily brief HTTP**: POST from GH Action with auth header (`X-CRON-SECRET` or bearer service role); responds 200/4xx; records metrics/logs.

### Patterns / Libraries
- Supabase Edge (Deno), fetch + crypto.subtle; GitHub REST dispatch via PAT.
- Deno std/testing for unit tests; `act` for workflow dry-runs.
- Node/Python for scripts (`orchestration/cost.py`, Sheets updater via Google API client).

### Alternatives Considered
- **New minimal relay function (Cloudflare/Workers)**: rejected for now to reuse existing Supabase infra; can switch later with same contracts.
- **Direct Supabase-only processing (no Actions)**: rejected to keep GitOps/audit trail.
- **Supabase DB instead of Sheets for contacts**: deferred; Sheets meets interim needs with hashing.

## Testing Strategy
- **Unit**: signature verification (valid/invalid/missing), idempotency cache, safety footer helper, cost estimator budget logic, daily-brief retry/backoff and env validation.
- **Integration**: Front Door → `repository_dispatch` simulated via `act`; Sheets updater with mock/service account; Manus step gated by flag; daily-brief card selection and LINE call mocked.
- **End-to-End**: follow event → dispatch → plan load → Sheets upsert → reply with footer; degraded mode skip Manus; daily-brief cron dry-run hitting Edge with auth.
- CI: run `deno test` for functions, Node/Python lint/tests, `act` smoke for workflows.

## Deployment & Migration
1) Restore orchestration assets (plan/cost/brief/degraded) and scripts; ensure workflows read them.  
2) Adapt `line-webhook` to dispatch while preserving signature/idempotency; set LINE webhook URL to Supabase endpoint.  
3) Add hashing salt secret and Sheets service account; configure GitHub vars/secrets (`GH_PAT`, LINE secrets, Manus optional, PROGRESS webhook).  
4) Deploy daily-brief fixes; add cron workflow; verify via dry-run.  
5) Enable alerts (Discord webhook) on workflow failure.  
Rollback: set `FEATURE_BOT_ENABLED=false`, disable workflows, revert plan/degraded flags.

## Risks & Mitigations
- **Architecture drift (Supabase vs Actions)**: document decision; keep dispatch path thin; revisit if latency/cost issues.  
- **Sheets quota/auth failures**: skip with warning, alert; plan fallback (log only) and future DB migration.  
- **Manus/budget unavailability**: enforce degrade branch; guard Manus steps with flags.  
- **Signature/idempotency bugs**: tests + metrics; 4xx monitoring.  
- **Missing secrets**: startup env validation (daily brief), workflow preflight checks.  
- **Observability gaps**: structured logs + alerting on workflow/Edge failures.

## Open Questions (must resolve with stakeholders)
- Sheets retention/access and salt ownership; fallback path when Sheets fails.  
- Messaging cadence/segmentation and additional KPIs.  
- Degraded-path specifics (ICS-only/LINE-only) when Manus/budget off.  
- Credential readiness (Sheets service account, Manus API/base URL, verified domain/PAT).  

Once these are answered, proceed to `/sdd-tasks` and implementation.
