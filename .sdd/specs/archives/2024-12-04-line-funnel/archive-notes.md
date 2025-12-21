# Archive Notes – Cursorvers LINE Funnel (2024-12-04)

## Completion Check
- Requirements, design, and tasks copied from `/.sdd/specs/line-funnel/` (see `requirements.md`, `design.md`, `tasks.md`) reflect the latest state after scaffolding orchestration assets and documenting the Front Door alignment decision.
- Deviations: implementation is not complete—Front Door dispatch, safety footer integration, real Supabase/Sheets upserts, and daily-brief fixes remain outstanding; stub scripts and placeholder plans/ICS are present.

## Summary
- Delivered: plan/degraded assets, cost estimator stub, helper script stubs (Supabase/SHEETS/PlanDelta), degraded ICS placeholder, steering update on architecture choice, target spec pointer and tasks list.
- Goals coverage: unblocked GitHub Actions file dependencies and captured design/requirements; did not implement runtime changes yet.
- Tests/rollout: no tests executed; no deployment performed (scaffolding only).
- Follow-ups: continue P0 tasks per `tasks.md`—Front Door adaptation in `supabase/functions/line-webhook`, safety footer helper, replace stubs with real integrations, apply CODE_REVIEW_TODOS to daily-brief, add cron workflow and tests.

## Retrospective
- Went well: quickly filled missing orchestration assets to make workflows runnable; clarified architecture decision in steering.
- Challenges: large pre-existing repo changes and missing helper scripts; pending stakeholder inputs on Sheets policy, cadence, degraded paths.
- Next iteration suggestions: secure answers to open questions before coding the Front Door, and replace stubs with minimal working integrations plus tests early to validate workflows via `act`.

## Outstanding Risks
- Architecture drift if Supabase webhook isn’t aligned with Actions path.
- Compliance gaps until safety footer and Sheets hashing policy are enforced.
- Operational gaps until daily-brief fixes, cron, and alerts are implemented.
