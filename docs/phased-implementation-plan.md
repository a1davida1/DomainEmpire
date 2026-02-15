# DomainEmpire Phased Implementation Plan

## Objective

Build a reliable domain pipeline that can:

1. Find and score domains to buy.
2. Route high-confidence candidates through human review.
3. Acquire, launch, and promote domains at small scale first.
4. Scale quickly once quality and ROI guardrails are proven.

This plan intentionally starts small, validates economics, then scales.
Assumption: KDP manuscript authoring is external; app scope is ingesting/linking external KDP assets, metadata, and attribution, not generating manuscripts in-app.

---

## Current Baseline (What Already Exists)

1. Queue and worker infrastructure with lock recovery and retries (`src/lib/ai/worker.ts`).
2. AI content pipeline with outline -> draft -> humanize -> SEO -> meta (`src/lib/ai/pipeline.ts`).
3. Domain evaluation and persistence (`src/lib/evaluation/evaluator.ts`, `src/lib/db/schema.ts` `domain_research`).
4. Domain purchase flow with confirmation and price guardrails (`src/lib/domain/purchase.ts`).
5. Deployment and DNS automation primitives (`src/lib/deploy/processor.ts`, `src/lib/deploy/cloudflare.ts`, `src/lib/deploy/godaddy.ts`).
6. Lead capture and subscriber tracking (`src/app/api/capture/route.ts`, `src/lib/subscribers/index.ts`).
7. PDF generation primitives that can be reused for KDP package attachments and audit exports (`src/lib/pdf/generator.ts`).
8. Research cache fallback for offline/degraded research queries (`cachedKnowledgeBase` — see Phase 1 spec).

---

## Implementation Status (2026-02-15)

1. `Phase 0` mostly complete:
   - feature flags implemented (`acquisition_underwriting_v1`, `preview_gate_v1`, `growth_channels_v1`, `kdp_generator_v1` for external KDP integration gating)
   - queue failure categorization + retry paths wired in worker
2. `Phase 1` complete for MVP scope:
   - acquisition ingestion/enrichment/scoring/bid-plan job chain is implemented
   - underwriting outputs and event logging are persisted
   - research cache (`research_cache`) and refresh job path are implemented
3. `Phase 2` partial:
   - `review_tasks` + preview enforcement exists for domain buying
   - auto-action constraints for review tasks are implemented in schema + API validation
4. `Phase 3` in progress:
   - growth schema foundation implemented: `promotion_campaigns`, `promotion_jobs`, `promotion_events`, `media_assets`, `media_asset_usage`
   - growth worker jobs implemented: `create_promotion_plan`, `generate_short_script`, `render_short_video`, `publish_pinterest_pin`, `publish_youtube_short`, `sync_campaign_metrics`
   - growth API implemented: `GET/POST /api/growth/campaigns`, `POST /api/growth/campaigns/[id]/launch`
   - campaign launch review gate implemented (`campaign_launch` review task required when `preview_gate_v1` is enabled)
   - attribution foundation implemented: `click_events` table, subscriber source linkage, `POST /api/growth/click-events`, UTM ingestion on `/api/capture`
   - media vault API implemented: `GET/POST /api/growth/media-assets`, `PATCH/DELETE /api/growth/media-assets/[id]`, `POST /api/growth/media-assets/[id]/usage`
   - channel publish adapter layer implemented with mock/live switch (`GROWTH_PUBLISH_MOCK`), worker integration, and live API call paths for Pinterest/YouTube
   - encrypted credential vault implemented for growth channels (`growth_channel_credentials`, `GET/PUT/DELETE /api/growth/channel-credentials`)
   - credential refresh automation implemented: auto-refresh on publish for expiring tokens + manual refresh endpoint (`POST /api/growth/channel-credentials`) + warning alerts on refresh failure
   - reconnect drill path implemented (`POST /api/growth/channel-credentials/reconnect`) and credential rotation runbook added (`docs/ops/growth-credential-rotation-runbook.md`)
   - policy preflight baseline implemented in publish path (HTTPS destination enforcement, banned-term blocking, hashtag guardrails, punctuation normalization including no em dashes)
   - worker publish path now resolves per-user stored credentials (with env fallback) via `launchedBy` propagation across growth jobs
   - guardrails implemented in worker: daily caps, duplicate creative suppression, per-domain cooldown, campaign metrics sync
   - per-domain channel compatibility implemented (`domain_channel_profiles`, `/api/domains/[id]/channel-compatibility`, dashboard editor)
   - growth publish scheduling now supports per-domain jitter + UTC quiet-hours windows for Pinterest and YouTube Shorts publish jobs
   - growth dashboard UI now surfaced (`/dashboard/growth`) for campaign creation/launch, media vault management, and credential management
   - reviewer-facing media vault workflows implemented: provenance metadata, moderation state badges, and bulk actions (`/api/growth/media-assets/bulk`, growth dashboard media tab)
   - media upload storage abstraction implemented (`src/lib/growth/media-storage.ts`) with `local` and `s3_compatible` providers, exposed via `POST /api/growth/media-assets/upload`
   - media moderation governance implemented: SLA-aware moderation queue (`media_moderation_tasks`), append-only tamper-evident event log (`media_moderation_events`), reviewer decision APIs, and export endpoint (`/api/growth/media-review/events/export`)
   - escalation automation baseline implemented for moderation queue: sweep service + API (`POST /api/growth/media-review/escalations`) plus worker job type (`run_media_review_escalations`) and hourly scheduler auto-enqueue for users with pending moderation tasks, with backup/chain/team-lead routing and ops-notify fallback metadata
   - multi-approver moderation flow baseline implemented (ordered/any approval workflows with thresholded approvals and partial approval progress persisted on task metadata)
   - role-aware moderation assignment controls implemented (`POST /api/growth/media-review/tasks/[id]/assignment`) with claim/reassign support, reviewer-role validation, escalation routing updates, and dashboard task-level routing UI
   - reviewer directory endpoint implemented (`GET /api/growth/media-review/reviewers`) and surfaced in moderation queue assignment dropdowns with per-reviewer pending workload counts
   - assignment fairness policy implemented (pending-cap + round-robin skew constraints, admin force override, reassignment concentration alerts, and policy snapshot persistence on assignment events/metadata)
   - moderation policy insights endpoint implemented (`GET /api/growth/media-review/insights`) and surfaced on the growth dashboard for reviewer load skew, override counts, concentration share, and daily alert/override trend visibility
   - moderation policy insights CSV export implemented (`GET /api/growth/media-review/insights?format=csv`) and exposed in growth dashboard controls
   - fairness policy ops-channel bridge implemented via webhook (`GROWTH_FAIRNESS_OPS_WEBHOOK_URL` / `OPS_ALERT_WEBHOOK_URL`) for blocked assignments and override/warning escalation signals, with dedup/rate-limit guardrails (`OPS_ALERT_MIN_INTERVAL_SECONDS`)
   - incident-playbook bindings implemented for fairness signals (`FAIRNESS-001..004`) with runbook links (`docs/ops/fairness-alert-playbooks.md`) embedded in assignment notifications, webhook payloads, and policy metadata
   - domain workflow profile editor implemented (per-domain writing-phase template IDs, schedule profile, branding color/style metadata)
   - deploy theme policy fallback implemented (`resolveDomainTheme`) so unknown/empty theme style values resolve to bucket/niche policy themes instead of generic defaults; CI tests cover policy-theme validity and deterministic variance
   - integration marketplace foundation implemented: `integration_connections` + `integration_sync_runs` schema and API endpoints (`GET/POST/DELETE /api/integrations/connections`, `GET/POST /api/integrations/sync-runs`, `PATCH /api/integrations/sync-runs/[id]`)
   - integration provider catalog endpoint implemented (`GET /api/integrations/providers`) with scope/category/executable-sync metadata
   - executable connection sync path implemented (`POST /api/integrations/connections/[id]/sync`) with first provider adapters: registrar renewal sync (`godaddy`, `namecheap`) and metrics sync (`cloudflare`, `google_search_console`)
   - integrations operations UI surfaced (`/dashboard/integrations`) with provider catalog, connection create/list/delete, and manual sync controls
   - scheduled integration sync automation implemented: hourly worker scheduler enqueue (`run_integration_connection_sync`) with per-connection cadence/lookback config (`autoSyncEnabled`, `syncIntervalMinutes`, `syncLookbackDays`) and execution through the integration sync executor
   - content calendar now supports keyword-opportunity mode with difficulty/volume/cpc scoring (`GET /api/content/calendar?strategy=keyword_opportunity`)
   - automated interlinking policy hard-stop implemented (internal interlink suggestion/apply/batch APIs now blocked unless `ENABLE_INTERNAL_LINKING=true`)
   - portfolio cross-domain link blocking enforced at deploy render stage (`ENFORCE_NO_PORTFOLIO_CROSSLINKS`, default on)
   - search-quality monitoring checks implemented (indexing weakness, visibility collapse/manual-action suspicion, thin-content ratio, duplicate fingerprint signals) with monitoring alerts surfaced under `search_quality`
   - scheduler cadence diversification implemented by domain bucket (`build`/`redirect`/`park`/`defensive`) with deterministic phase shifts and weighted publish windows
   - domain differentiation guardrails injected into AI prompts (domain-specific perspective/narrative/structure guidance + intent-coverage balancing in keyword research + voice-seed uniqueness hardening)
   - disclosure defaults hardened to always include transparent About, Editorial Policy, and How-We-Make-Money trust pages unless explicitly overridden

Open gaps for Phase 3 exit:
1. Credential lifecycle completion: execute and validate rotation/reconnect drill in staging with incident checklist.
2. Platform policy compliance tuning for live publishing (expand beyond baseline preflight with channel policy packs + audit dashboard).
3. Assignment governance hardening: add long-horizon persisted trend storage (beyond event-window snapshots) and automated incident ticket creation from playbook-bound fairness signals.
4. Storage hardening (lifecycle/retention/CDN policy automation).

### Assignment Fairness Thresholds

The fairness policy enforces the following concrete numeric constants during reviewer assignment:

| Constant | Value | Description |
|---|---|---|
| `PENDING_CAP_PER_REVIEWER` | 20 | Maximum pending tasks assignable to a single reviewer before the policy blocks further assignments |
| `SKEW_THRESHOLD` | 5 | Maximum allowed difference between the most-loaded and least-loaded reviewer's pending count before triggering a skew warning |
| `CONCENTRATION_SHARE_THRESHOLD` | 0.60 | If a single reviewer holds > 60% of recent assignments, trigger a concentration alert (`FAIRNESS-003`) |
| `ROUND_ROBIN_LOOKBACK_HOURS` | 72 | Time window used to compute recent assignment distribution for skew and concentration checks |
| `OPS_ALERT_MIN_INTERVAL_SECONDS` | 300 | Minimum interval (seconds) between duplicate ops-channel webhook alerts (env-configurable via `OPS_ALERT_MIN_INTERVAL_SECONDS`) |

Admin users may force-override any fairness constraint. When an override occurs, the assignment event payload includes `policyOverrideApplied: true` and the override is counted in the insights endpoint's `overrideCount` metric.

### Escalation Automation Behavior

The escalation sweep (`src/lib/growth/media-review-escalation.ts`) runs as an hourly worker job (`run_media_review_escalations`). Behavior details:

1. **Jitter:** The sweep does not currently apply per-task jitter. All overdue tasks discovered in a single sweep cycle are processed sequentially within a single transaction per task. Future optimization: add configurable batch-size limits and per-sweep random start-offset to avoid thundering-herd patterns when many tasks become overdue simultaneously.
2. **Batching:** Each sweep processes up to 100 overdue tasks per invocation. If more tasks are overdue, the remaining tasks are picked up in the next hourly cycle.
3. **Routing order:** For each overdue task, the escalation chain is evaluated in order: `backupReviewerId` -> `escalationChain[0..N]` -> `teamLeadId`. The first available (active, under pending cap) reviewer receives the reassignment.
4. **Ops-notify fallback:** If all escalation targets are exhausted or unavailable, and `notifyOpsAfterHours` has elapsed since task creation, the task metadata is updated with `opsNotifiedAt` and an ops-channel webhook alert is sent. The task remains in `pending` status but is flagged for manual intervention.
5. **Deduplication:** Ops-notify alerts are rate-limited per source+severity+title key using the `OPS_ALERT_MIN_INTERVAL_SECONDS` interval to prevent alert storms.

### Media Asset Privacy Policy

Media assets uploaded via the media vault (`POST /api/growth/media-assets/upload`) are subject to the following privacy controls:

1. **Ownership:** Each media asset is scoped to a `userId`. API endpoints enforce ownership: users can only access, modify, or delete their own assets unless acting as admin or assigned reviewer on a moderation task referencing the asset.
2. **Moderation access:** Reviewers assigned to a moderation task (`media_moderation_tasks`) gain read access to the task's referenced asset for the duration of the review. Decision routes authorize by task-level assignment (reviewer, listed approver, or admin), not by asset ownership.
3. **Storage:** Media files are stored via the configured storage provider (`local` or `s3_compatible`). When using `s3_compatible`, assets should be stored in a private bucket with signed-URL access. Public CDN exposure requires explicit opt-in per asset via metadata flags.
4. **Retention:** Media assets are retained indefinitely unless explicitly deleted by the owner or purged by an admin. Future: implement configurable retention policies per asset type and auto-archive for assets unused for > 12 months.
5. **Deletion:** `DELETE /api/growth/media-assets/[id]` soft-deletes the asset record. Storage-layer cleanup (actual file deletion) is deferred to a background job to prevent accidental data loss. Hard deletion of storage files occurs 30 days after soft-delete.
6. **Audit:** All media asset operations (upload, update, delete, moderation decisions) are logged in `media_moderation_events` with actor, timestamp, and event type for full traceability.

---

## Content Format Coverage Audit (2026-02-14)

The following list maps the requested content surface to current implementation status and missing pieces needed for production quality.

| Content format | Current status | Missing for production readiness |
|---|---|---|
| Tools and calculators | Partially implemented (`calculator` content type + deploy templates) | Deterministic formula test harness, versioned methodology block UI, assumptions validator, downloadable audit packet with calc version + reviewer signoff |
| Product configurators | Baseline implemented (`configurator` mode with configuration-specific UX copy + summary panel) | Dedicated configurator config schema (pricing matrices, dependency constraints), SKU integration, pricing audit snapshots |
| Quizzes | Baseline implemented (`quiz` mode with score-focused UX copy + configurable rubric scoring, bands, and score outcomes) | Psychometric quality checks, answer randomization controls, score-normalization analytics |
| Surveys | Baseline implemented (`survey` mode with submission-focused UX + response summary) | Survey-specific branching analytics, response export workflow, consent-per-question support |
| Assessments | Baseline implemented (`assessment` mode with assessment-specific UX + configurable rubric scoring, bands, and score outcomes) | Calibrated scoring rubrics, threshold governance, assessor note + rationale workflow |
| Interactive wizards and eligibility screeners | Partially implemented (`wizard` content type + template scaffold) | Decision ruleset versioning, rules change log, confidence bands, explicit "why we ask" UX step, legal policy packs for benefits/insurance |
| Interactive infographics | Baseline implemented (`interactive_infographic` template + filter/sort cards) | Visualization QA snapshots, chart accessibility narration, claim-to-metric citation binding |
| Interactive maps | Baseline implemented (`interactive_map` template using `geoData` region payloads + tile-map interaction layer) | True geo-shape rendering layer, location confidence telemetry, region freshness SLA |
| Comparison tables and scorecards | Partially implemented (`comparison` type + structured `comparisonData`) | Source dataset provenance per row, automated freshness checks, affiliation disclosure hooks at row/item level |
| Explainers and guides | Implemented in pipeline (`article`, `guide`, `cost_guide`) | Claim-to-citation coverage enforcement, reviewer-required gate by YMYL class, automated stale-claim detection |
| FAQs | Implemented (`faq` type and template support) | FAQ schema validation + citation requirement for non-trivial factual claims |
| Checklists | Implemented (`checklist` type + template support) | Versioned checklist governance (change reason + reviewer signoff) and scenario suitability checks |
| Templates and letters | Missing | Template engine with jurisdiction/role constraints, impersonation guardrails, generation input hashing, legal disclosure overlays |
| Downloadable artifacts | Partially implemented (PDF primitives exist) | CSV/PDF output signing, in-file disclosures, output hash registry linked to source article/version |
| Data dashboards | Partially implemented (analytics pages and dataset tables) | Provenance-first dashboard blocks, retrieval cadence monitor, QA checks before chart publication |
| Case studies and scenarios | Partially implemented (content types can express scenarios) | Substantiation workflow, typical-outcome safeguards, scenario ID registry tied to evidence docs |
| Reviews and testing | Partially implemented (`review` type, reviewer roles, QA templates) | Test protocol versioning, raw notes attachments, reviewer expertise display + audit binding |
| Lead-gen landing pages | Implemented (`lead_capture` type + capture route) | Compliance gates for high-risk verticals, stronger claim linting, disclosure placement verification snapshots |
| Lead forms | Implemented (capture APIs + subscriber attribution) | Retention policy enforcement, consent text version pinning at submit time, policy audit export |
| Newsletters | Partially implemented (subscriber system exists) | Campaign send engine, preference center, unsubscribe/compliance reporting and FTC promo labeling pipeline |
| Micro-SaaS product pages | Partially implemented (template framework can render) | Release readiness checklist, uptime/incident surfaced metadata, functional claim verifier |
| Pricing and checkout | Partially implemented (billing primitives exist) | Transparent terms version capture, experiment holdout logging, cancellation flow audit hooks |
| API integrations and docs | Missing | Public API surface, versioned docs, changelog/deprecation policy, auth + rate-limit policy docs |
| UGC and community Q&A | Missing | Moderation queue, abuse report workflow, trust levels, anti-spam and provenance controls |
| Methodology block | Partially implemented (content config + templates can include) | Mandatory methodology section for YMYL tool pages with versioned assumptions and reviewer binding |
| Citations block | Partially implemented (`citations` table + review pages) | Claim-level citation mapping enforcement and source freshness SLA checks |
| Disclosures and disclaimers | Implemented baseline (`disclosure_configs`, compliance snapshots) | Device-level placement verification automation and channel-specific disclosure presets |
| Changelog and last-reviewed | Partially implemented (`content_revisions`, review timestamps) | Public-facing changelog blocks, reason-code taxonomy, freshness SLA alerting |
| Internal audit trail UI | Partially implemented (review tasks/events, revisions, compliance pages) | Immutable event export, diff timeline unification across acquisition/content/growth workflows |

Cross-cutting gaps still open:
1. Prompt hash and prompt body archival by stage for all AI-generated outputs.
2. Unit-test pass ID storage for deterministic tool calculations.
3. Reviewer rationale standards per format (enforced schema, not freeform only).
4. Citation coverage threshold gates before publication for YMYL content.

---

## Phase 0 (Days 1-2): Stabilize Foundation

### Goal
Create one operationally safe baseline before adding growth systems.

### Prerequisites
- `Model routing registry` with fallback chain and versioning (moved from "What Is Missing" -- required before any AI task routing in Phase 0-1).

### Deliverables
1. Select one queue worker implementation as source-of-truth and retire duplicate behavior.
2. Add structured logs and correlation IDs around:
   - domain acquisition calls
   - Cloudflare calls
   - AI calls
3. Add consistent failure categories (retryable vs non-retryable) for all external integrations.
4. Add feature flags:
   - `acquisition_underwriting_v1`
   - `preview_gate_v1`
   - `growth_channels_v1`
   - `kdp_generator_v1`

#### Feature Flag Rollout Strategy

| Flag | Initially | Rollout Plan | Owner | Kill-Switch Procedure | Monitoring Metrics for Rollback | Gates Phase |
|------|-----------|-------------|-------|----------------------|-------------------------------|-------------|
| `acquisition_underwriting_v1` | Disabled in all environments | Canary (5%) -> 50% -> 100% | Underwriting Lead | Set flag to `off` in LaunchDarkly/config; all traffic reverts to legacy scoring within 30s | `underwriting_error_rate`, `hard_fail_false_positive_rate`, `scoring_latency_p99` | Phase 1 |
| `preview_gate_v1` | Disabled in all environments | Canary (5%) -> 50% -> 100% | Review Workflow Lead | Set flag to `off`; approval gates bypass to manual-only queue | `preview_build_failure_rate`, `review_task_staleness`, `gate_bypass_count` | Phase 2 |
| `growth_channels_v1` | Disabled in all environments | Canary (5%) -> 50% -> 100% | Growth Lead | Set flag to `off`; all campaign jobs pause, no new pins/shorts published | `campaign_error_rate`, `daily_cap_violations`, `channel_api_failure_rate` | Phase 3 |
| `kdp_generator_v1` | Disabled in all environments | Canary (5%) -> 50% -> 100% | KDP Lead | Set flag to `off`; external KDP ingestion/sync jobs pause, no new KDP imports linked | `kdp_sync_error_rate`, `kdp_ingest_failure_rate`, `kdp_sync_latency_p99` | Phase 4 |

Each flag must be toggled independently. Rollout progression requires a 24h soak at each stage with fewer than 2 Sev-2 alerts and zero Sev-1 alerts attributable to the feature/flag before advancing. On-call or flag owner must confirm causality of any Sev-2 alert before it blocks progression; unrelated or transient alerts are excluded via a tie-breaking review led by the flag owner and on-call engineer within 4 hours of the alert. Kill-switch activation triggers an incident review within 48h.

### Exit Criteria
1. Worker loop stable for 24h in staging with error rate < 0.1%, zero process crashes, retry success rate >= 95%, 99th-percentile loop latency < 500ms, CPU and memory < 75% of quota, no active Sev-2+ alerts. Verified via Prometheus metrics, error logs, and dashboard review.
2. All external failures include source, reason code, and retry decision.

---

## Phase 1 (Days 3-7): Acquisition Underwriting MVP

### Goal
Move from ad-hoc domain picks to a repeatable underwriting engine.

### Prerequisites
- `Underwriting policy` document with exact thresholds (moved from "What Is Missing" -- required before hard-fail gates can be implemented).
- `Data contracts` per enrichment provider (moved from "What Is Missing" -- required before ingestion and enrichment jobs are built).

### Schema Changes (minimum)
Extend `domain_research` with:

1. Listing context:
   - `listingSource`, `listingId`, `listingType`
   - `currentBid`, `buyNowPrice`, `auctionEndsAt`
2. Risk and quality signals:
   - `tmRiskScore`
   - `historyRiskScore`
   - `backlinkRiskScore`
   - `demandScore`
   - `compsScore`
3. Decision economics:
   - `compLow`, `compHigh`
   - `recommendedMaxBid`
   - `expected12mRevenueLow`, `expected12mRevenueHigh`
   - `confidenceScore`
   - `estimatedAcquisitionCost` (real, required) — actual or projected purchase price
   - `estimatedBuildCost` (real, default 500) — site build and content cost
   - `estimatedOperatingCost` (real, default 200) — 12-month hosting, DNS, maintenance
   - `totalCost` = `estimatedAcquisitionCost` + `estimatedBuildCost` + `estimatedOperatingCost` (computed for ROI checks)
4. Decision controls:
   - `hardFailReason`
   - `underwritingVersion`
   - `decision` and `decisionReason` remain canonical.

Add `acquisition_events` table:
1. `domainResearchId`
2. `eventType` (`ingested`, `enriched`, `hard_fail`, `scored`, `watchlist`, `approved`, `bought`, `passed`)
3. `payloadJson`
4. `createdBy` (`system` or user id)
5. `createdAt`

### Worker Jobs
Add queue job types:

1. `ingest_listings`
2. `enrich_candidate`
3. `score_candidate`
4. `create_bid_plan`
5. `research_cache` table and `cachedKnowledgeBase` query engine (see spec below).

### Hard-Fail Gates (deterministic)
Before any AI scoring:

1. High trademark collision risk: USPTO match score > 0.7 triggers hard fail.
2. Toxic historical footprint (spam/pharma/porn/casino repurposing): confidence > 0.6 triggers hard fail.
3. Backlink profile toxicity beyond threshold: toxic ratio > 40% or spam score > 60 triggers hard fail.
4. Economics fail:
   - Formula: First validate `totalCost > 0` where `totalCost = estimatedAcquisitionCost + estimatedBuildCost + estimatedOperatingCost`. If `totalCost <= 0`, trigger hard fail with reason `"Invalid cost data: totalCost must be positive (acquisition={estimatedAcquisitionCost}, build={estimatedBuildCost}, operating={estimatedOperatingCost})"` and log the cost components for debugging. When `totalCost > 0`, apply: `(expected12mRevenueLow - totalCost) / totalCost < 0.5` triggers hard fail.

See the **Underwriting Policy** document for full threshold rationale, override procedures, and calibration schedule.

### Exit Criteria
1. 100+ candidate domains/day can be ingested and scored.
2. Every recommendation has max-bid and explicit fail/pass rationale.

---

## Phase 2 (Days 8-12): Human-in-the-Loop Preview and Approval

### Goal
No domain or content goes live without reviewer confidence.

### Deliverables
1. Add `preview_builds` table:
   - `domainId`, `articleId` nullable
   - `previewUrl`, `expiresAt`, `buildStatus`, `buildLog`
2. Add `review_tasks` table:
   - `taskType` (`domain_buy`, `content_publish`, `campaign_launch`)
   - `entityId`
   - `checklistJson`
   - `status` (`pending`, `approved`, `rejected`)
   - `reviewerId`, `reviewedAt`, `reviewNotes`
   - `slaHours` (integer, default 24) — time allowed for review before escalation warning
   - `escalateAfterHours` (integer, default 48) — time after which task escalates to backup reviewer
   - `backupReviewerId` (uuid, nullable) — reviewer who receives escalated tasks
   - `escalationChain` (jsonb, nullable) — ordered array of reviewer UUIDs for multi-level escalation; system tries each in order when previous level times out
   - `teamLeadId` (uuid, nullable) — default escalation target when `backupReviewerId` is null or unavailable
   - `notifyOpsAfterHours` (integer, nullable) — if no reviewer is assigned within this many hours, create an ops incident and notify the ops channel
3. Add auto-approval/rejection rules:
   - `autoApproveAfterHours` (integer, nullable) — auto-approve if no action taken within this window (null = disabled)
   - `autoRejectAfterHours` (integer, nullable) — auto-reject if no action taken within this window (null = disabled)
   - `confidenceThresholds` (jsonb) — per-taskType confidence ranges that permit auto-action (e.g., `{"domain_buy": {"autoApproveAbove": 0.95, "autoRejectBelow": 0.3}}`)
   - `domain_buy` auto-approve restrictions:
     - By default, `taskType === "domain_buy"` is **never eligible for auto-approve** — `autoApproveAfterHours` is treated as null/ignored for domain_buy tasks unless explicitly overridden
     - Pilot override: auto-approve may be enabled for domain_buy only when config flag `allowDomainBuyAutoApproveForLowCost` is true **and** the task's `estimatedCost < 100`
     - Pilot gate: the `allowDomainBuyAutoApproveForLowCost` flag cannot be enabled until 100 manual-reviewed domain_buy samples have been completed with a false-positive rate < 2%, verified by the Underwriting Lead
     - Auto-reject remains available for domain_buy tasks per normal `autoRejectAfterHours` and `confidenceThresholds` rules
4. Add approval gate enforcement:
   - purchase blocked unless `domain_buy` approved
   - publish blocked unless `content_publish` approved
   - campaign launch blocked unless `campaign_launch` approved
   - Gate enforcement checks SLA status and triggers escalation when `escalateAfterHours` is exceeded
   - Auto-actions are applied before gate check if confidence thresholds are met and time windows have elapsed
   - Escalation fallback rules:
     - If `backupReviewerId` is null or unavailable and `escalationChain` is provided, iterate through the chain in order
     - If `escalationChain` is exhausted or empty, fall back to `teamLeadId`
     - If `teamLeadId` is also null/unavailable and `notifyOpsAfterHours` has elapsed, create an incident alert and notify ops
     - Every escalation step is logged with timestamp, target reviewer, and escalation reason
5. Add reviewer UI:
   - preview URL
   - scorecard
   - approve/reject with reason
   - SLA countdown timer showing time remaining before escalation
   - Escalation status indicator (normal / warning / escalated)
   - Auto-action indicators showing when auto-approve or auto-reject will fire

### Exit Criteria
1. Reviewer can fully approve/reject in app.
2. All approvals are auditable.
3. SLA and escalation behavior is auditable: every escalation, auto-approval, and auto-rejection is logged with timestamp, reason, and triggering threshold.

---

## Phase 3 (Days 13-21): Small-Scale Growth Engine

### Goal
Validate growth channels on a tight cohort before broad rollout.

### Small-Scale Scope
1. 5-10 domains.
2. 2 channels only: Pinterest + YouTube Shorts.
3. Daily cap per domain and per channel.

### Deliverables
Add growth tables:

1. `promotion_campaigns`:
   - `campaignId` (uuid, PK)
   - `domainId` (uuid, FK -> domain_research)
   - `channels` (jsonb) — e.g. `["pinterest", "youtube_shorts"]`
   - `budget` (real) — total campaign budget
   - `status` (text, enum: `draft`, `active`, `paused`, `completed`, `cancelled`)
   - `dailyCap` (int) — max posts/actions per day
   - `metrics` (jsonb) — aggregated performance metrics
   - `createdAt` (timestamp)

2. `promotion_jobs`:
   - `jobId` (uuid, PK)
   - `campaignId` (uuid, FK -> promotion_campaigns)
   - `jobType` (text) — e.g. `generate_short_script`, `publish_pin`
   - `status` (text, enum: `pending`, `running`, `completed`, `failed`, `cancelled`)
   - `payload` (jsonb) — job-specific input/output data
   - `createdAt` (timestamp)

3. `promotion_events`:
   - `eventId` (uuid, PK)
   - `campaignId` (uuid, FK -> promotion_campaigns)
   - `eventType` (text) — e.g. `impression`, `click`, `lead`, `conversion`
   - `timestamp` (timestamp)
   - `attributes` (jsonb) — event-specific data (channel, creative ID, etc.)

4. `media_assets`:
   - `assetId` (uuid, PK)
   - `type` (text) — e.g. `image`, `video`, `script`, `voiceover`
   - `url` (text) — storage URL
   - `tags` (jsonb) — searchable tags array
   - `usageCount` (int, default 0) — number of times used in campaigns
   - `createdAt` (timestamp)

5. `media_asset_usage`:
   - `usageId` (uuid, PK)
   - `assetId` (uuid, FK -> media_assets)
   - `campaignId` (uuid, FK -> promotion_campaigns)
   - `jobId` (uuid, FK -> promotion_jobs)
   - `createdAt` (timestamp)

6. `domain_channel_profiles`:
   - `profileId` (uuid, PK)
   - `domainId` (uuid, FK -> domain_research) — one profile per domain+channel pair
   - `channel` (text) — e.g. `pinterest`, `youtube_shorts`
   - `enabled` (boolean, default true) — whether this channel is active for the domain
   - `quietHoursStart` (text, nullable) — UTC time string (e.g. `"02:00"`) marking the start of the no-publish window
   - `quietHoursEnd` (text, nullable) — UTC time string (e.g. `"06:00"`) marking the end of the no-publish window
   - `jitterMinutes` (int, default 0) — random delay range applied to scheduled publishes for this domain+channel
   - `brandingColorHex` (text, nullable) — hex color used in creatives for this domain+channel
   - `styleMetadata` (jsonb, nullable) — additional branding/style overrides (fonts, logos, tone)
   - `writingPhaseTemplateId` (uuid, FK -> writing_phase_templates.id, nullable) — per-domain/channel writing-phase template override
   - `scheduleProfile` (jsonb, nullable) — publishing cadence settings (frequency, preferred days/times)
   - `createdAt` (timestamp)
   - `updatedAt` (timestamp)

   **Relationship to other tables:**
   - `promotion_campaigns` may reference `domain_channel_profiles.profileId` when per-channel publish settings are used; campaign-specific overrides (budget, daily cap, status) remain in `promotion_campaigns`.
   - Per-domain/channel publish windows (`quietHoursStart`, `quietHoursEnd`), jitter, branding, and writing-phase template/schedule live in `domain_channel_profiles`.
   - Domain-level fields that are not channel-specific (niche, tier, bucket, siteTemplate) remain in `domain_research`/`domains`.
   - Unique constraint on (`domainId`, `channel`) ensures one profile per domain per channel.

Add queue jobs:

1. `create_promotion_plan`
2. `generate_short_script`
3. `render_short_video`
4. `publish_pinterest_pin`
5. `publish_youtube_short`
6. `sync_campaign_metrics`

Implement:

1. Basic media vault (upload, tag, folder, usage count).
2. Shorts factory: script -> voice -> video render -> asset record.
3. Campaign guardrails:
   - daily post cap
   - duplicate creative suppression
   - per-domain cooldown windows

### Attribution Schema

UTM fields on all campaign-generated URLs:
- `utm_source` — channel identifier (e.g., `pinterest`, `youtube`)
- `utm_medium` — content type (e.g., `pin`, `short`)
- `utm_campaign` — campaignId reference
- `utm_term` — keyword or topic tag
- `utm_content` — creative variant identifier

`click_events` table:
- `click_id` (uuid, PK)
- `campaign_id` (uuid, FK -> promotion_campaigns)
- `timestamp` (timestamp)
- `visitor_id` (text) — anonymous visitor fingerprint or cookie ID
- `full_url` (text) — complete URL with UTM parameters
- `utm_source` (text)
- `utm_medium` (text)
- `utm_campaign` (text)
- `utm_term` (text)
- `utm_content` (text)

Lead source tracking on `subscribers` table (new fields):
- `source_campaign_id` (uuid, FK -> promotion_campaigns, nullable)
- `source_click_id` (uuid, FK -> click_events, nullable)
- `original_utm` (jsonb) — full UTM snapshot at time of lead capture

Revenue records must include:
- `campaign_id` (uuid, FK -> promotion_campaigns, nullable) — for attribution
- `attribution_id` (uuid, nullable) — links to the specific click_event or campaign touchpoint

### Exit Criteria
1. End-to-end flow works for both channels.
2. Attribution exists from campaign -> click -> lead.

---

## Phase 4 (Days 22-35): KDP External Integration

### Goal
Operationalize externally generated KDP assets in DomainEmpire with traceable linkage to domain clusters and campaigns.

### Deliverables
Add/extend KDP integration tables:

1. `kdp_projects`:
   - `projectId` (uuid, PK)
   - `domainClusterId` (uuid, FK) — links to the domain cluster this book targets
   - `externalProvider` (text) — source system name for the external KDP workflow
   - `externalProjectId` (text) — provider-specific project identifier
   - `title` (text) — canonical title synced from external source
   - `status` (text, enum: `linked`, `assets_imported`, `metadata_validated`, `exported`, `uploaded`, `live`, `rejected`)
   - `createdAt` (timestamp)

2. `kdp_exports`:
   - `exportId` (uuid, PK)
   - `projectId` (uuid, FK -> kdp_projects)
   - `externalExportId` (text, nullable) — provider export/package id
   - `manuscriptUrl` (text) — URL to imported manuscript file from external tool
   - `metadataJson` (jsonb) — book metadata (title, subtitle, description, keywords, categories)
   - `sourceManifestJson` (jsonb, nullable) — provider manifest payload for traceability
   - `exportedAt` (timestamp) — when the external export was generated or synced
   - `kdpStatus` (text, enum: `pending`, `exported`, `uploaded`, `live`, `rejected`)

3. `kdp_sync_events`:
   - `eventId` (uuid, PK)
   - `projectId` (uuid, FK -> kdp_projects)
   - `eventType` (text) — `project_linked`, `assets_imported`, `metadata_validated`, `status_synced`, `import_failed`
   - `payloadJson` (jsonb)
   - `createdAt` (timestamp)

Add KDP integration jobs:

1. `link_kdp_project`
2. `ingest_kdp_export_package`
3. `validate_kdp_metadata`
4. `link_kdp_assets_to_domain_campaign`
5. `sync_kdp_publication_status`

Imported package artifacts:

1. manuscript file from external provider
2. metadata sheet
3. source manifest from external provider
4. optional cover spec payload for design tools

### Exit Criteria
1. At least 2 complete externally generated KDP packages ingested and validated from existing domain clusters.
2. KDP assets linked back to domain campaign entities.

---

## Phase 5 (Week 6+): Scale and Hardening

### Goal
Scale from validated pilot to broader portfolio safely.

### Deliverables
1. Cloudflare multi-account sharding by bucket/domain policy.
2. Dynamic queue scaling and throughput controls.
3. Portfolio risk controls:
   - max spend per niche
   - max exposure per acquisition class
   - stop-buy triggers
4. Calibration loop:
   - compare predicted vs actual performance at 30/60/90 days
   - adjust underwriting weights

### Exit Criteria
1. 25-50 domains handled without manual bottlenecks.
2. Underwriting model calibration running automatically.

---

## What Is Wrong With The Plan (Current Gaps)

These are the biggest risks if not addressed explicitly:

1. Too much in parallel.
   - Acquisition, growth channels, KDP integration, and scaling all at once will stall delivery.
2. Not enough deterministic gating.
   - AI scoring without strict hard-fails will create expensive bad buys.
3. Missing explicit kill criteria.
   - Need objective stop conditions per domain/campaign.
4. Missing source-of-truth controls.
   - Workbook/seed/domain-list drift must be resolved with one canonical dataset.
5. Missing legal workflow clarity.
   - Trademark and policy checks need explicit blocking behavior, not soft warnings.
6. Missing attribution rigor.
   - If channel events cannot map to lead/revenue, optimization will be guesswork.
7. No explicit model governance.
   - Task -> model routing must be versioned and auditable.
8. Ops debt before scale.
   - Existing test failures should be resolved before expanding critical workflows.

### Gap Ownership and Resolution Schedule

| Gap | Owner | Must Resolve By | Blocks Phase |
|-----|-------|----------------|--------------|
| 1. Too much in parallel | Project Lead | Day 1 (plan kickoff) | Phase 0 |
| 2. Not enough deterministic gating | Underwriting Lead | Day 5 (before scoring goes live) | Phase 1 |
| 3. Missing explicit kill criteria | Underwriting Lead | Day 7 (end of Phase 1) | Phase 1 |
| 4. Missing source-of-truth controls | Data Lead | Day 3 (start of Phase 1) | Phase 1 |
| 5. Missing legal workflow clarity | Legal / Compliance Lead | Day 5 (before any domain purchase) | Phase 1 |
| 6. Missing attribution rigor | Growth Lead | Day 13 (start of Phase 3) | Phase 3 |
| 7. No explicit model governance | AI/ML Lead | Day 3 (before AI scoring in Phase 1) | Phase 1 |
| 8. Ops debt before scale | Engineering Lead | Day 2 (end of Phase 0) | Phase 0 |
| 9. Missing rollback procedures | Engineering Lead | Day 12 (end of Phase 2) | Phase 3 |

Each gap owner is responsible for producing a resolution artifact (document, config, or code change) by the listed date. Unresolved gaps block entry to the listed phase.

---

## What Is Missing (Must Add)

1. ~~`Underwriting policy` document with exact thresholds.~~ — Moved to Phase 1 prerequisites.
2. ~~`Data contracts` per enrichment provider.~~ — Moved to Phase 1 prerequisites.
3. `Campaign SLOs` and `error budgets`.
4. `Reviewer playbooks` for buy/publish/launch decisions.
5. `Rollback procedures` for bad deploy/campaign outcomes: must cover halting active campaigns/deployments, reverting KDP integration changes, recovering or unpublishing content, and database rollback scripts for Phases 3-5 state changes.
6. ~~`Model routing registry` with fallback chain and versioning.~~ — Moved to Phase 0 prerequisites.

---

## Ideal-State Gaps (Now / Next / Later)

For an ideal domain growth and management platform, these capabilities are still missing beyond current MVP scope.

### Now (0-30 days)

1. `Canonical domain lifecycle state machine`
   - Define strict states (`sourced`, `underwriting`, `approved`, `acquired`, `build`, `growth`, `monetized`, `hold`, `sell`, `sunset`) with allowed transitions and actor permissions.
2. `Portfolio finance ledger + per-domain P&L`
   - Track acquisition, build, operating, channel spend, revenue, and margin in one canonical ledger with monthly close snapshots.
3. `Registrar and ownership operations automation`
   - Renewal windows, expiration risk alerts, transfer tracking, lock/DNSSEC status, and ownership-change audit events.
4. `Platform integrity and anti-abuse controls`
   - Bot/fraud scoring, suspicious activity alerts, rate-limits, destination/link quality checks, and policy-block enforcement.
   - Explicitly no stealth or platform-evasion "anti-detection" behavior.
5. `Operational controls already flagged as missing`
   - Campaign SLOs/error budgets, reviewer playbooks, and rollback procedures.

### Next (30-90 days)

1. `Experimentation and incrementality framework`
   - Holdouts, lift measurement, confidence thresholds, and stop/scale decision gates.
2. `Automated capital allocation and budget optimizer`
   - Shift spend by CAC/LTV/payback bands with hard daily/weekly loss limits.
3. `SEO and site health observability`
   - Indexation, ranking volatility, crawl/runtime failures, and conversion anomaly alerting.
4. `Monetization reconciliation layer`
   - Channel/revenue attribution reconciliation, payout accuracy checks, and partner margin reporting.
5. `Data platform hardening`
   - Warehouse contracts, backfill/replay jobs, metric versioning, and cross-source consistency checks.

### Later (90+ days)

1. `Exit and portfolio disposition workflows`
   - Valuation model, broker workflow, buyer diligence packet generation, and sale-readiness checks.
2. `Scale architecture hardening`
   - Multi-account provider sharding, regional failover, and automated capacity controls.
3. `Closed-loop model calibration`
   - Re-train/reweight underwriting and growth policies from 30/60/90-day realized outcomes.
4. `Compliance automation at portfolio scale`
   - Immutable audit exports, regulatory retention policies, and automated evidence pack generation.

---

## Operator Requirements Integration (2026-02-15)

The following requirements are now incorporated into execution scope for an ideal domain growth and management platform.

### Add To Product Scope (Build)

1. `Revenue tracking integrations`
   - Integrate parking APIs and affiliate network data feeds with normalized revenue attribution per domain and source.
2. `Domain metrics pipeline`
   - Track traffic, rankings, click-through rate, and trend deltas in a unified domain metrics layer.
3. `Renewal management automation`
   - Expand registrar integrations beyond current baseline, include renewal cost tracking and renewal ROI recommendations.
4. `Content pipeline operations`
   - Keep AI-assisted content workflows and scheduling controls as first-class planning and execution tools.
5. `A/B testing management`
   - Support landing page variants and conversion tracking with statistically defensible winner selection.
6. `Affiliate operations`
   - Add commission tracking, program-level performance, and centralized link template management.
7. `SEO monitoring`
   - Expand keyword ranking and backlink tracking into proactive alerts and opportunity scoring.
8. `Competitive analysis`
   - Add domain-to-domain comparison and market research workflows with historical snapshot persistence.
9. `Domain lifecycle management`
   - Enforce lifecycle transitions from registration -> development -> monetization -> renewal/drop decisions.
10. `Cross-domain optimization`
   - Capture reusable winning templates/strategies and apply them portfolio-wide with auditability.
11. `ROI-based prioritization`
   - Automatically resurface high-potential domains/content initiatives from portfolio signals.
12. `Integration marketplace`
   - Add a connection layer for registrars, parking providers, analytics, email, design, and affiliate networks.

### Use Existing Tools (Do Not Rebuild Core Product)

1. `Hosting management`
   - Continue using cPanel and Cloudflare APIs via integration connectors.
2. `Analytics`
   - Continue ingesting external analytics signals instead of rebuilding analytics providers.
3. `Email marketing`
   - Integrate Mailchimp/ConvertKit rather than replacing dedicated campaign tooling.
4. `Design assets`
   - Integrate Figma for asset workflows instead of rebuilding design systems in-app.

### Architecture Alignment

Canonical entity chain for this scope:
`Domain -> Projects -> Tasks -> Content -> Revenue -> Analytics`

Integration families to support:
1. Registrars (`GoDaddy`, `Namecheap`)
2. Parking (`Sedo`, `Bodis`)
3. Analytics/SEO (`Google Analytics`, `Search Console`, `SEMrush`)
4. Affiliate networks (`Impact`, `CJ`, `Awin`, `Rakuten`)
5. Email (`Mailchimp`, `ConvertKit`)
6. Hosting/infra (`Cloudflare`, `cPanel`)
7. Design (`Figma`)

### Execution Sequence Addendum

1. `Wave A` (immediate): integration connection registry + sync audit trail, keyword-difficulty content prioritization.
2. `Wave B`: affiliate/parking revenue attribution ingestion, domain lifecycle state transitions + ROI-based resurfacing.
3. `Wave C`: competitive automation refresh loops, cross-domain strategy propagation, marketplace hardening.

---

## Explicit AI Routing (OpenRouter) - Current vs Required

## Current In-Code Routing (as of now)

Defined in `src/lib/ai/openrouter.ts` `MODEL_CONFIG`:

1. `keywordResearch` -> `x-ai/grok-3-fast`
2. `domainClassify` -> `x-ai/grok-3-fast`
3. `titleGeneration` -> `x-ai/grok-3-fast`
4. `outlineGeneration` -> `anthropic/claude-sonnet-4-5-20250929`
5. `draftGeneration` -> `anthropic/claude-sonnet-4-5-20250929`
6. `humanization` -> `anthropic/claude-sonnet-4-5-20250929`
7. `seoOptimize` -> `anthropic/claude-3-5-haiku-20241022`
8. `voiceSeedGeneration` -> `anthropic/claude-sonnet-4-5-20250929`
9. `research` -> `perplexity/sonar-reasoning`

The humanization stage currently calls:
1. `ai.generate('humanization', PROMPTS.humanize(...))` in `src/lib/ai/pipeline.ts`.
2. Therefore, humanization currently uses `anthropic/claude-sonnet-4-5-20250929`.

## Required Explicit Routing Matrix (add to model governance)

1. Domain underwriting deterministic checks: no AI (rule engine only).
2. Domain enrichment summary (optional): `research` model.
3. Outline and longform draft: `outlineGeneration` and `draftGeneration`.
4. Humanization pass: `humanization` (Sonnet 4.5 currently).
5. SEO/meta compression: `seoOptimize` (Haiku currently).
6. Shorts script generation:
   - first pass: `keywordResearch` (fast)
   - high-performing campaign variants: `draftGeneration` (quality)
7. KDP manuscript generation: external tool (no in-app AI generation in this system).
8. KDP metadata normalization and policy rewrite (when needed): `seoOptimize` default, escalate to `humanization` for high-risk copy.
9. Safety and policy rewrite pass:
   - default `seoOptimize`
   - escalate to `humanization` for high-risk YMYL/KDP listing copy.

## Required Fallback Chain

For each task family, define explicit fallback using exact model keys:

1. Fast tasks: `keywordResearch` -> `seoOptimize`.
2. Quality tasks: `draftGeneration` -> `humanization` -> `seoOptimize`.
3. Research tasks: `research` -> `cachedKnowledgeBase` (query local cache, apply date-window/domain-priority filters, merge top-N results via deterministic scoring — see `cachedKnowledgeBase Component Spec` below).

## Required Model Governance Fields

For every AI job persist:

1. `modelKey` (task key)
2. `resolvedModel`
3. `promptVersion`
4. `routingVersion`
5. `fallbackUsed` boolean
6. `cost`, `latency`, token counts

### cachedKnowledgeBase Component Spec (New — Phase 1)

**Purpose:** Local research cache fallback when external research models are unavailable.

**Schema:** `research_cache` table:
- `id` (uuid, PK)
- `query_hash` (text, unique)
- `query_text` (text)
- `result_json` (jsonb)
- `source_model` (text)
- `fetched_at` (timestamp)
- `expires_at` (timestamp)
- `domain_priority` (int, default 0)

**Filter rules:**
- Date-window filter: exclude entries older than `expires_at` or configurable staleness threshold.
- Domain-priority filter: prefer entries where `domain_priority` >= query context priority.

**Top-N merge:** Deterministic scoring = `0.6 * relevance_score + 0.3 * recency_score + 0.1 * domain_priority_score`. Return top-5 results.

**Fallback behavior:** If cache is empty or all entries stale, fall back to external `research` model. If external also fails, return empty result set with `cacheStatus: 'miss'` and trigger async refresh job (`refresh_research_cache` queue job).

---

## Build vs Buy (Pragmatic)

### Build in-house (core edge)
1. Underwriting score logic and hard-fail policy engine.
2. Human review workflow and approval gates.
3. Campaign attribution and ROI optimizer.

### Use cheap subscriptions for data friction
1. SERP/keyword/cpc APIs for scalable enrichment.
2. Expired/spam history tooling for faster filtering.
3. Sales comps source for max-bid quality.

### Delay expensive suites until scale
1. Premium backlink suites should be optional until pilot proves ROI.
2. Introduce only when they change decision quality materially.

---

## 35-Day Execution Sequence

Week 1:
1. Phase 0 complete.
2. Phase 1 schema + jobs live.

Week 2:
1. Hard-fail + scoring + bid plan stable.
2. Phase 2 preview and approval live.

Week 3:
1. Pinterest + YouTube small cohort live.
2. Campaign attribution baseline live.

Week 4:
1. Phase 4 kickoff, external KDP tool integration and ingest/link workflows.
2. Scale gate review and go/no-go decision for Phase 5.

Week 5:
1. Phase 4 complete: KDP external integration MVP live.
2. KDP assets linked to domain campaigns; at least 2 externally generated export packages verified.

---

## Subscriber PII and Data Privacy (Cross-Phase)

The `subscribers` table stores PII (email, name, phone, ip_address, user_agent, referrer, form_data). The following must be implemented across phases:

### Data Retention Policy
- **Tracking fields** (ip_address, user_agent, referrer): retain for 90 days maximum, then irreversibly null/truncate via automated `purge_subscriber_tracking` queue job (runs daily).
- **form_data**: retain for 12 months from `created_at`, then purge non-essential fields (preserve only source and consent metadata).
- **converted_at**: retain indefinitely for attribution but anonymize linked PII after 24 months.
- **Unsubscribed/bounced subscribers**: anonymize email + phone after 30 days; retain hashed email for deduplication.

### Access Controls
- Enable Row-Level Security (RLS) on `subscribers` table with domain-scoped access policies (each user can only query subscribers belonging to domains they own/manage), referencing `subscribers_domain_id_domains_id_fk`.
- If RLS cannot be applied (e.g., shared service account), enforce equivalent authorization checks in application layer around all subscriber queries (`src/lib/subscribers/index.ts`, `src/app/api/subscribers/route.ts`).

### Data Subject Rights (Export/Delete)
- Implement `GET /api/subscribers/export?email=...` for data subject access requests (returns all stored data for an email across domains).
- Implement `DELETE /api/subscribers/erase?email=...` for right-to-erasure requests: soft-delete with irreversible masking of PII fields (email → hashed, phone → null, name → null, form_data → {}), preserve aggregated/anonymized records.
- Key management for any encryption-at-rest of PII fields (email, phone) should be documented and rotatable.

### Audit Logging
- Log all access to subscriber records (read, update, delete) with actor, timestamp, and action type.
- Audit logs retained for 24 months minimum.

### Documentation
- Update privacy policy to reflect collection, retention, and deletion procedures for subscribers.
- Must be completed by Phase 0 for existing subscriber data; enforcement gates apply from Phase 3 onward when growth campaigns generate new leads at scale.

---

## Final Success Metrics (SMART Targets)

1. Domain acquisition win rate from baseline to >= 60% within 3 months; measured by `domain_win_rate` weekly.
2. Bad-buy rate < 10% vs baseline; measured by domains with negative ROI at 90 days.
3. Reviewer throughput >= 15 decisions/day with rework <= 15%; measured by `review_rework_rate`.
4. Channel campaigns produce >= 50 attributable leads/month with CAC < $20; measured by campaign attribution within 30-day window.
5. KDP external integration processes >= 2 complete external packages per month with < 20% manual remediation; measured by `kdp_ingest_completion_rate`.
6. System handles >= 50 domains with queue lag < 1h and error rate < 2%; measured by `queue_lag_p99` and `error_rate` dashboards.
