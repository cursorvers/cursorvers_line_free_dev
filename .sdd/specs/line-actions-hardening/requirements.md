# Line Actions Hardening – Requirements

## Problem Summary
The LINE funnel depends on a dense web of GitHub Actions (`line-event.yml`, `manus-progress.yml`, multiple routers, guardrail jobs) that currently rely on ad-hoc conventions (remote `curl` fetches, duplicated routing logic, implicit secrets). We need to harden this automation so operators can trust every run, avoid supply-chain surprises, and meet compliance expectations while keeping maintenance overhead low.

**Desired Outcome:** Stakeholders（運用Ops／外部メンテナンスチーム）と開発者が、GitHub Actions中心の自動化を中断させることなく安全に保守できる状態を確立する。リポジトリは自己完結型（ランタイムfetch無し）で、必要な設定とRunbookが明確に揃い、縮退運用や外部委託中でも軽量に動作し続ける。

## Acceptance Criteria
- [x] Provide an authoritative inventory of active workflows with owner, trigger, and purpose, captured in repo docs (`docs/automation/WORKFLOWS.md` or similar) and linked from `.sdd/steering/tech.md`.
- [x] Remove the remote `curl` dependency in `line-event.yml` by vendoring or packaging Supabase helper scripts with integrity checks; workflow runs without network fetch.
- [x] Decide on a single GitHub event router path (either consolidate into `webhook-handler.yml` or elevate `webhook-event-router.yml`), document the decision, and retire redundant logic.
- [x] Add pre-flight validation that required secrets/vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, `MANUS_API_KEY`, notification webhooks) exist; workflows fail fast with actionable messaging if misconfigured.
- [x] Define and implement a failure-safe log persistence strategy so commits from Actions either succeed or fall back to artifact upload, with documentation of retention/rotation.
- [x] Introduce automated checks (lint/test/dry-run) that cover core workflow scripts (`scripts/supabase/*.js`, `scripts/sheets/*.js`, `scripts/manus/*.mjs`) to catch regressions before deployment.
- [x] Publish an external-maintenance Runbook: Git worktree 利用手順・フラグの切り替え・縮退モード復旧・Secrets設定フローを含む。外部担当が手順通りに動かせば本番を止めずに保守できることを確認。
- [x] 重要運用パラメータ（`MANUS_ENABLED`, `DEGRADED_MODE`, `GEMINI_COST_PER_CALL` など）を一覧化し、GitHub Variables/Secretsの設定表とチェックCLIに反映。オンコール引き継ぎ時に漏れがないようにする。
- [x] 運用メトリクス（Gemini要約ステップ成功率・応答時間・コスト、ログコミット成功率など）をArtifactsと集計CLIで追えるようにし、PoC後も拡張できる評価基盤を準備。

## Constraints & Dependencies
- **External services:** Supabase REST API, Google Sheets API, Manus API, LINE webhook ingress. Ensure rate limits and secrets management remain within documented bounds.
- **Feature flags:** `MANUS_ENABLED`, `DEGRADED_MODE`, `DEVELOPMENT_MODE` must continue to control plan selection and Manus dispatch logic.
- **Repository policy:** Workflows commit JSON logs; branch protections and token scopes (`contents: write`) must support this or an alternative retention path.
- **Operational cadence:** Guardrail workflows (economic circuit breaker, rotate logs, weekly reports) must remain compatible with any structure changes.
- **Security:** All packaging/vendoring must respect medical data privacy (hashed identifiers, no PHI leakage) and avoid introducing unsigned binaries.

## Open Questions & Follow-ups
- ✅ Scripts will be vendored directly into the repo (`scripts/vendor/`) with a checksum manifest; DevOps owns periodic refresh (decision logged for sign-off).
- ✅ `webhook-handler.yml` becomes the canonical router; Developer Experience team (Product/Ops joint) owns maintenance post-consolidation.
- ✅ GitHub Artifacts serve as the fallback persistence channel when log commits fail; compliance will review quarterly for retention sufficiency.
- ✅ Automated coverage target: unit tests with mocked APIs plus workflow dry-run smoke tests in CI (`node --test` + `act` smoke jobs); QA signs off on scope.
- ✅ Repository admins will maintain a dedicated Actions PAT with `contents:write` scoped via environment protection; branch protections documented in design.

Stakeholder sign-off is still required, but open questions now have proposed resolutions to evaluate during design review.
