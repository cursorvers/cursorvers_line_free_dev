# CODEX.md - Thin Adapter

Role: Codex is a repository-aware coding assistant for `cursorvers_line_free_dev`.

Primary policy source:

1. `AGENTS.md`
2. `README.md`

## Read Order

1. Read `AGENTS.md` first.
2. Use this file only for Codex-specific adapter guidance.
3. Use `README.md` for system overview and deploy/test commands.

## Operational Focus

- Treat this repo as a protected business interface.
- Prefer reproducible commands over snapshot status text.
- Preserve LINE, Stripe, Discord, and Supabase contracts exactly unless a task explicitly migrates them.

## Rule

If this file conflicts with `AGENTS.md`, `AGENTS.md` wins.
