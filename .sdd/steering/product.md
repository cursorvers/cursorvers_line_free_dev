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
- Existing Supabase functions also cover prompt polishing/risk check flows, course routing, and daily brief broadcasts sourced from Obsidian notes (line_cards table), which need alignment with the newer Actions-first funnel design.

## Pain Points / Risks
- Manual maintenance becomes brittle as operations scale; need automation with minimal human babysitting.
- Compliance risks around handling health-adjacent information and ensuring guardrail messaging is consistently appended.
- Cost governance: Manus usage must stay “last-mile” to avoid point overruns.
- Dependency on third-party platforms (note, LINE, Google services) — require monitoring and graceful degradation paths.
- Architecture drift risk: current Supabase Edge implementations (LINE webhook, daily brief) may diverge from the Front Door + GitHub Actions governance model unless converged.

## Open Questions / Assumptions
- Exact KPI baselines for article traffic, conversion funnels, and revenue attribution remain TBD.
- Need clarity on cadence and content types for automated messages (frequency limits, segmentation).
- Governance surrounding Google Sheets access, retention, and auditing still to be set.
- Which parts of the existing Supabase-based flows should be kept vs. migrated under the GitHub Actions pipeline (e.g., line-webhook logic, daily brief scheduler)?
- Target consulting conversion metrics (post-LINE opt-in) and time-to-first-touch expectations are not yet defined.
- Data minimization rules for Sheets (hashing salt ownership, retention window) and fallback when Sheets quota/auth fails remain unspecified.

## Session Summary & Next Steps
- Vision reaffirmed (note → LINE → consulting funnel, 40% opt-in target) with added context that Supabase functions already handle prompt polish/risk check, course routing, and LINE daily brief broadcasts from Obsidian content.
- Automation touchpoints remain article alerts/resource delivery/event promotions; GitHub Actions workflows exist but rely on missing orchestration scripts and need convergence with current Supabase flows.
- Operational imperatives unchanged: low-maintenance automation, Manus cost control, consistent safety disclaimers, auditability.
- Open items before `/sdd-requirements`: confirm KPI stack beyond opt-in (e.g., consult bookings, latency targets), decide messaging cadence/segmentation, lock Google Sheets retention/access policies, choose migration/retirement plan for existing Supabase webhook/daily-brief logic, and prioritize which automation scenarios enter MVP with the available workflows.
