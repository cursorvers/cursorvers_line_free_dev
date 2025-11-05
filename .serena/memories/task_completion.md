# Task Completion Checklist
- Run `npm test` (and targeted `npm run test:feature-flags` if relevant) to confirm Node-based suites pass; run `python -m pytest tests/test_cost.py` for changes touching Python cost logic.
- For Supabase schema edits, execute `supabase db push` (or Dashboard SQL) against the project ref and confirm tables exist.
- After updating the Edge Function, deploy via `supabase functions deploy relay --project-ref <ref>` or document pending deployment steps.
- If workflows or orchestration assets change, note any required GitHub Actions triggers (`gh workflow run …`) or secrets/variables updates.
- Verify progress/log JSON artifacts in `logs/` or `orchestration/plan` when edits impact telemetry, ensuring audit trail consistency.