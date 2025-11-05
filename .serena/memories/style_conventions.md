# Style & Conventions
- TypeScript/Deno Edge Function code uses `type` imports from URL-based std libs, explicit interfaces, and pure helpers; prefer descriptive function names and JSON-structured logging via `console.log(JSON.stringify(...))`.
- Env handling: collect required environment variables in typed interfaces (see `RelayEnv`) and guard optional values; treat secrets as optional with fallbacks, hashing user IDs via `hashUserId` helper before logging.
- Tests run with Node's built-in test runner (`node --test`) using ESM `.mjs` files; Python tests rely on pytest (3.12 compatible) for auxiliary cost calculations.
- Configuration and docs reside under `docs/`; operational JSON data kept under `orchestration/plan` and `logs/` to maintain auditability.