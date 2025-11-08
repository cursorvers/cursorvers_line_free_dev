# GitHub Actions Workflow Inventory

> 自動生成ファイル。更新する場合は `npm run workflows:inventory` を実行してください。

| ワークフロー | ファイル | オーナー | パーミッション | トリガー | 最終更新 |
| --- | --- | --- | --- | --- | --- |
| [Auto Add Issues to Project](../../.github/workflows/auto-add-to-project.yml) | `.github/workflows/auto-add-to-project.yml` | ops | — | issues | 2025-11-06 65e0e3e |
| [Autonomous Agent Execution](../../.github/workflows/autonomous-agent.yml) | `.github/workflows/autonomous-agent.yml` | devops | contents: write, issues: write, pull-requests: write | issues, issue comment, workflow dispatch | 2025-11-06 65e0e3e |
| [CI Smoke (act)](../../.github/workflows/ci-smoke-act.yml) | `.github/workflows/ci-smoke-act.yml` | devops | contents: read | pull request, workflow dispatch | 未コミット |
| [Deno Tests](../../.github/workflows/deno-tests.yml) | `.github/workflows/deno-tests.yml` | devops | contents: read | push, pull request, workflow dispatch | 2025-11-06 65e0e3e |
| [Deploy GitHub Pages](../../.github/workflows/deploy-pages.yml) | `.github/workflows/deploy-pages.yml` | devops | contents: read, id-token: write, pages: write | push, schedule, workflow dispatch | 2025-11-06 65e0e3e |
| [🔴 Economic Circuit Breaker](../../.github/workflows/economic-circuit-breaker.yml) | `.github/workflows/economic-circuit-breaker.yml` | ops | actions: write, contents: read, issues: write | schedule, workflow dispatch | 2025-11-06 65e0e3e |
| [Gemini Metrics Report](../../.github/workflows/gemini-metrics-report.yml) | `.github/workflows/gemini-metrics-report.yml` | devops | contents: read | schedule, workflow dispatch | 未コミット |
| [Issue Opened - Auto Label](../../.github/workflows/issue-opened.yml) | `.github/workflows/issue-opened.yml` | ops | contents: read, issues: write | issues | 2025-11-06 65e0e3e |
| [🏷️ Sync Labels to GitHub](../../.github/workflows/label-sync.yml) | `.github/workflows/label-sync.yml` | devops | issues: write | push, workflow dispatch | 2025-11-06 65e0e3e |
| [LINE Event Handler](../../.github/workflows/line-event.yml) | `.github/workflows/line-event.yml` | devops | actions: write, contents: write, issues: write, pull-requests: write | repository dispatch, workflow dispatch | 2025-11-06 65e0e3e |
| [Manus Progress Handler](../../.github/workflows/manus-progress.yml) | `.github/workflows/manus-progress.yml` | devops | actions: read, contents: write, issues: write, pull-requests: write | repository dispatch, workflow dispatch | 2025-11-06 65e0e3e |
| [Manus Task Runner](../../.github/workflows/manus-task-runner.yml) | `.github/workflows/manus-task-runner.yml` | devops | contents: read | repository dispatch, workflow dispatch, schedule | 2025-11-06 65e0e3e |
| [Node Tests](../../.github/workflows/node-tests.yml) | `.github/workflows/node-tests.yml` | devops | contents: read | push, pull request, workflow dispatch | 2025-11-06 65e0e3e |
| [Plan Validator](../../.github/workflows/plan-validator.yml) | `.github/workflows/plan-validator.yml` | devops | contents: read | pull request, push, workflow dispatch | 2025-11-06 65e0e3e |
| [PR Opened - Auto Review](../../.github/workflows/pr-opened.yml) | `.github/workflows/pr-opened.yml` | ops | contents: read, pull-requests: write | pull request | 2025-11-06 65e0e3e |
| [Sync Issues to Project](../../.github/workflows/project-sync.yml) | `.github/workflows/project-sync.yml` | ops | issues: read, pull-requests: read | issues, pull request | 2025-11-06 65e0e3e |
| [Python Tests](../../.github/workflows/python-tests.yml) | `.github/workflows/python-tests.yml` | devops | contents: read | push, pull request, workflow dispatch | 2025-11-06 65e0e3e |
| [Rotate Logs](../../.github/workflows/rotate-logs.yml) | `.github/workflows/rotate-logs.yml` | devops | contents: write | schedule, workflow dispatch | 2025-11-06 65e0e3e |
| [🔄 State Machine Automation](../../.github/workflows/state-machine.yml) | `.github/workflows/state-machine.yml` | devops | issues: write, pull-requests: write | issues, pull request, issue comment | 2025-11-06 65e0e3e |
| [Update Project Status](../../.github/workflows/update-project-status.yml) | `.github/workflows/update-project-status.yml` | ops | — | pull request, issues | 2025-11-06 65e0e3e |
| [Verify Secrets](../../.github/workflows/verify-secrets.yml) | `.github/workflows/verify-secrets.yml` | devops | contents: read, secrets: read | push, pull request, workflow dispatch, schedule | 2025-11-06 65e0e3e |
| [🔔 Webhook Event Handler](../../.github/workflows/webhook-handler.yml) | `.github/workflows/webhook-handler.yml` | devops | actions: write, contents: read, issues: write, pull-requests: write | issues, pull request, issue comment, pull request review, push, workflow run | 2025-11-06 65e0e3e |
| [Weekly KPI Report](../../.github/workflows/weekly-kpi-report.yml) | `.github/workflows/weekly-kpi-report.yml` | ops | — | schedule, workflow dispatch | 2025-11-06 65e0e3e |
| [📊 Generate Weekly Report](../../.github/workflows/weekly-report.yml) | `.github/workflows/weekly-report.yml` | ops | contents: read, issues: write | schedule, workflow dispatch | 2025-11-06 65e0e3e |

## Router Policy

- `webhook-handler.yml` is the canonical event router; all GitHub webhooks for this repository should flow through it.
- Routing logic lives in `scripts/webhook-router.mjs`, which manages issue state labels and responds to `/state <value>` comment commands.
- Non-issue events currently emit telemetry summaries only; extend the router script when additional automation is required.
