# AGENTS.md - Repository Guidelines

## Project Role

`cursorvers_line_free_dev` is a production-adjacent LINE + Stripe + Discord + Supabase system for Cursorvers.

Treat this repository as a protected business interface.

## Primary Surfaces

- `supabase/functions/line-webhook/`
- `supabase/functions/line-register/`
- `supabase/functions/line-daily-brief/`
- `supabase/functions/stripe-webhook/`
- `supabase/functions/discord-relay/`
- `supabase/functions/manus-audit-line-daily-brief/`

## Read Order

1. Read this file first.
2. Read `README.md` for system overview and operational commands.
3. Read `CLAUDE.md` or `CODEX.md` only as thin adapters.
4. Load deeper docs only for the subsystem you are changing.

## Core Commands

- `deno task test:functions`
- `deno test supabase/functions/line-webhook/test/ --allow-env --allow-net`
- `deno fmt supabase/functions/`
- `deno lint supabase/functions/`

## Critical Rules

- Do not rely on static status numbers in adapters; run the tests instead.
- Preserve LINE ingress, Stripe webhook, Discord relay, and membership-linking contracts.
- Keep secrets out of code, logs, and issue comments.
- Treat Supabase Edge Functions and GitHub Actions as part of the runtime contract.

## Validation Rule

When changing business-critical paths, prefer:

- targeted function tests first
- `deno task test:functions` before completion

## Rule

If a thin adapter conflicts with this file, this file wins.
