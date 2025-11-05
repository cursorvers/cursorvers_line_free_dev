# Suggested Commands
- `npm test` – run Node-based integration/unit tests under `tests/**/*.test.mjs` via Node's built-in runner.
- `npm run test:feature-flags` – execute targeted feature flag regression tests.
- `python -m pytest tests/test_cost.py` – validate Python cost estimation logic (requires `pip install -r requirements-dev.txt`).
- `supabase login` / `supabase link --project-ref <ref>` / `supabase db push` – authenticate and apply database migrations defined in `database/migrations`.
- `supabase functions deploy relay --project-ref <ref>` – deploy the Supabase Edge Function in `functions/relay`.
- `gh workflow list` / `gh workflow run manus-progress.yml` – inspect or manually trigger Manus-related GitHub Actions.
- `cat logs/progress/*.json | jq -s 'sort_by(.ts) | .[-5:]'` – inspect the latest progress logs as described in the project README.
- `curl -X POST https://<ref>.supabase.co/functions/v1/relay ...` – simulate LINE or Manus events against the deployed Front Door for testing.