# Cursorvers LINE Funnel – Steering Notes

## Product Narrative
- Cursorvers delivers medical-AI auditing and consulting services, with content marketing (notably the public note blog) as the primary top-of-funnel.
- Articles direct readers into a LINE channel where ongoing engagements (updates, resources, event invitations) warm leads into paying advisory clients.
- Platform must respect medical safety guardrails: no individual diagnoses, focus on general guidance and clear escalation messaging.

## Goals & Success Signals
- Grow LINE subscriber base from note articles; provisional target conversion rate: 40% of engaged readers opt into LINE.
- Establish repeat touchpoints via automated updates (article drops, resource delivery, event notices) to increase consultation conversions. Detailed KPIs (e.g., service booking rates, churn) still to be defined with stakeholders.
- Maintain lightweight operations to keep maintenance effort low while ensuring audit readiness and safety compliance.

## Stakeholders & Users
- Marketing/content team publishing note articles and orchestrating campaigns.
- Prospective consulting clients (healthcare providers, administrators) consuming content, joining LINE, and evaluating services.
- Internal operations/engagement owners managing messaging cadence, compliance, and hand-offs to consulting delivery.

## User Journeys
1. Reader discovers note article → taps CTA → lands on LINE add-friend prompt → auto-registration flow logs contact in Google Sheets.
2. Registered contact receives automated notifications (new articles, supplementary materials) plus targeted announcements (events, retainer offers).
3. Interested contact escalates to consultation booking or service inquiry via LINE flows routed to operations.
4. 2025 リニューアル方針: note で学習の「入口」、LINE で合図と分岐、Discord で学習本体を完結。Classroom オペレーションに合わせコマンド体系（#詳しく/#参加/#完了/#受講開始/#つまずき 等）を定義し、タグ (`lead_free`, `trial_active`, `paid_active`, `alumni`, `conversion_invited`) に基づくセグメント管理を行う。

## Pain Points / Risks
- Manual maintenance becomes brittle as operations scale; need automation with minimal human babysitting.
- Compliance risks around handling health-adjacent information and ensuring guardrail messaging is consistently appended.
- Cost governance: Manus usage must stay “last-mile” to avoid point overruns.
- Dependency on third-party platforms (note, LINE, Google services) — require monitoring and graceful degradation paths.

## Open Questions / Assumptions
- Exact KPI baselines for article traffic, conversion funnels, and revenue attribution remain TBD.
- Need clarity on cadence and content types for automated messages (frequency limits, segmentation).
- Governance surrounding Google Sheets access, retention, and auditing still to be set.
- Stakeholder asked for “GitHub Actions-driven requirements definition” but no concrete acceptance criteria shared yet (awaiting clarification).

## Session Notes (2024-??)
- Reconfirmed architecture expectation that funnel automation should stay GitHub Actions-first; no new business metrics provided yet despite follow-up request.
- Still need stakeholder input on broader KPI stack, subscriber segmentation strategy, and operational ownership of content approvals.
- Next steering checkpoint should secure answers to outstanding questions above before advancing to `/sdd-requirements`.
- Current session directive focused on GitHub Actions reconnaissance; stakeholder KPIs/segmentation details remain unprovided.
- 2025-??-??: 再度ビジネス要件（KPI詳細、主要ユーザー導線、運用責任分担、リスク背景）を日本語でヒアリング依頼済み。回答待ちのため製品方針の精緻化は保留。
- 2025-??-??: Geminiログ要約PoCの目的・評価指標（工数削減率、異常検知率、失敗率/応答時間、APIコスト）と想定利用者（オンコールOps／週次レビュー担当エンジニア）を確認。PoC期間は既存手動レビューと併用し、出力は必ず人が検証する方針。
- 2025-11-06: note→LINE→Discord の本番導線を Spec-Driven Codex で再設定する要求を受領。販促メッセージは「行動発火時のみ」「paid_active には送らない」などビジネスルールが提示され、イベント定義・配信ルール・検証ケース・受入基準が明文化された。未回答: KPI の具体値（note→LINE 転換率の最新値、`trial_active`→`paid_active` の目標）、Discord 連携 API の SLA、note webhook の確定スキーマ。

## Session Summary & Next Steps
- Captured product vision (note → LINE → consulting funnel) and provisional conversion target (40% note-to-LINE opt-in).
- Identified automation touchpoints: article alerts, resource delivery, event/consulting promotions, all requiring safety messaging.
- Recognized operational imperatives: lightweight maintainability, cost control on Manus, strong compliance posture.
- Completed reconnaissance of主要GitHub Actions（line-event/manus-progress/manus-task-runner/economic-circuit-breaker）で、週次Manus自動実行やコスト監視のプレースホルダ実装、リモート依存（`wget yq`）といった技術的留意点を把握。
- Steering inputs (webhook spec, Manus brief v2.0/v3.1, Cursor handover package) already prepared; real-time push notification path recommended for progress telemetry.
- Gemini PoCによりログレビュー負荷軽減と異常検知支援を評価する枠組みを確立（要約活用フロー、Secrets管理、評価レポート雛形）。
- Open items before `/sdd-requirements`: align on detailed KPI stack (beyond 40%), finalize message cadence and segmentation rules, confirm Google Sheets data-handling policy, prioritize automation scenarios for MVP, schedule implementation readiness tasks (Edge deploy, Actions wiring, secret provisioning) referenced in the handover plan, and validate GitHub Actions coverage aligns with stakeholder priorities.
- Pending stakeholder replies: note/LINEコンバージョン以外の優先指標、既存LINE登録者のセグメントと改善ポイント、直近の運用課題やリスク事例、日常運用チームの権限範囲（フラグ切替など）を確認する必要あり。回答到着までは要件深化を停止。
- 次回 `/sdd-requirements` 着手時には、今回提示されたイベント表・ルール YAML・検証ケース (V1–V12)・DoD をベースに仕様を固め、未記載の成功指標／Discord 連携仕様を補完すること。
