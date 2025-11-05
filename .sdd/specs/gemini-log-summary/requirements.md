# Gemini Log Summary PoC – Requirements

## Business Objectives
- Reduce manual effort for reviewing LINE workflow logs by providing quick AI-generated summaries during the pilot period.
- Evaluate whether introducing Gemini alongside the existing Codex/GPT stack improves operational visibility without disrupting current automations.

## Functional Requirements
1. Collect recent LINE progress logs (`logs/progress/*.json`) during GitHub Actions runs and send a sanitized snapshot to Gemini.
2. Receive structured JSON from Gemini containing a short summary, anomalies array, and optional observations; persist to `tmp/gemini/log-summary.json`.
3. Publish the generated summary in the workflow step summary and upload the JSON as an artifact; on failure, continue the workflow with a clearly marked status.
4. Add configuration validation so the workflow alerts operators when `GEMINI_API_KEY` or other required secrets are missing.
5. Provide a repeatable CLI entry point for local dry-run tests (e.g., `node scripts/automation/run-gemini-log-summary.mjs --input tests/fixtures/logs`).

## Non-Functional Requirements
- Ensure identifiers remain hashed/redacted before sending to Gemini; avoid transmitting full message content.
- Operate under continue-on-error semantics: the PoC must not block existing LINE automation.
- Record outputs in versioned repo artifacts only for the PoC; no long-term storage or Supabase persistence.
- Unit tests must cover sanitization, missing-secret behavior, and API response parsing.

## Assumptions
- Logs already contain hashed `userId` fields; additional masking only needs to strip message bodies.
- Gemini access will be provided through a GitHub secret named `GEMINI_API_KEY`.
- Network access during GitHub Actions runs is available to call the Gemini endpoint.

## Out of Scope
- Direct integration from Edge Functions or Manus flows.
- Automated decision-making based on Gemini output; the PoC is observational only.
- Merging Gemini results into PlanDelta or Supabase tables during this phase.

## Open Questions (Resolved)
- **Can the PoC rely on Artifacts for output delivery?** → Yes, artifact upload is acceptable and aligns with retention policies.
- **Should failure halt the pipeline?** → No, failure should surface as status messaging while the workflow continues.
