# DomainEmpire Phased Implementation Plan

## Objective

Build a reliable domain pipeline that can:

1. Find and score domains to buy.
2. Route high-confidence candidates through human review.
3. Acquire, launch, and promote domains at small scale first.
4. Scale quickly once quality and ROI guardrails are proven.

This plan intentionally starts small, validates economics, then scales.

---

## Current Baseline (What Already Exists)

1. Queue and worker infrastructure with lock recovery and retries (`src/lib/ai/worker.ts`).
2. AI content pipeline with outline -> draft -> humanize -> SEO -> meta (`src/lib/ai/pipeline.ts`).
3. Domain evaluation and persistence (`src/lib/evaluation/evaluator.ts`, `src/lib/db/schema.ts` `domain_research`).
4. Domain purchase flow with confirmation and price guardrails (`src/lib/domain/purchase.ts`).
5. Deployment and DNS automation primitives (`src/lib/deploy/processor.ts`, `src/lib/deploy/cloudflare.ts`, `src/lib/deploy/godaddy.ts`).
6. Lead capture and subscriber tracking (`src/app/api/capture/route.ts`, `src/lib/subscribers/index.ts`).
7. PDF generation primitives that can be reused in KDP pipeline (`src/lib/pdf/generator.ts`).
8. Research cache fallback for offline/degraded research queries (`cachedKnowledgeBase` — see Phase 1 spec).

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
| `kdp_generator_v1` | Disabled in all environments | Canary (5%) -> 50% -> 100% | KDP Lead | Set flag to `off`; all KDP pipeline jobs pause, no new exports created | `kdp_chapter_error_rate`, `kdp_export_failure_rate`, `kdp_latency_p99` | Phase 4 |

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

## Phase 4 (Days 22-35): KDP Generator

### Goal
Turn domain clusters into publishable ebook assets.

### Deliverables
Add KDP tables:

1. `kdp_projects`:
   - `projectId` (uuid, PK)
   - `domainClusterId` (uuid, FK) — links to the domain cluster this book targets
   - `title` (text) — working title of the book
   - `status` (text, enum: `outline`, `drafting`, `review`, `compiling`, `exported`, `published`)
   - `targetWordCount` (int) — target total word count
   - `createdAt` (timestamp)

2. `kdp_chapters`:
   - `chapterId` (uuid, PK)
   - `projectId` (uuid, FK -> kdp_projects)
   - `chapterNumber` (int) — sequential chapter order
   - `title` (text) — chapter title
   - `content` (text) — full chapter content
   - `wordCount` (int) — actual word count of content
   - `status` (text, enum: `outline`, `drafted`, `humanized`, `approved`, `final`)

3. `kdp_exports`:
   - `exportId` (uuid, PK)
   - `projectId` (uuid, FK -> kdp_projects)
   - `manuscriptUrl` (text) — URL to the generated manuscript file
   - `metadataJson` (jsonb) — book metadata (title, subtitle, description, keywords, categories)
   - `exportedAt` (timestamp) — when the export was generated
   - `kdpStatus` (text, enum: `pending`, `exported`, `uploaded`, `live`, `rejected`)

Add KDP pipeline jobs:

1. `kdp_outline`
2. `kdp_chapter_draft`
3. `kdp_humanize`
4. `kdp_compile_manuscript`
5. `kdp_generate_metadata`
6. `kdp_export_package`

Export package outputs:

1. manuscript file
2. metadata sheet
3. chapter/source manifest
4. optional cover spec payload for design tools

### Exit Criteria
1. At least 2 complete KDP-ready packages generated from existing domain clusters.
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
   - Acquisition, growth channels, KDP, and scaling all at once will stall delivery.
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
5. `Rollback procedures` for bad deploy/campaign outcomes: must cover halting active campaigns/deployments, reverting KDP pipeline changes, recovering or unpublishing content, and database rollback scripts for Phases 3-5 state changes.
6. ~~`Model routing registry` with fallback chain and versioning.~~ — Moved to Phase 0 prerequisites.

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
7. KDP chapter drafting: `draftGeneration`
8. KDP style refinement/humanization: `humanization`
9. Safety and policy rewrite pass:
   - default `seoOptimize`
   - escalate to `humanization` for high-risk YMYL/KDP chapters.

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
1. Phase 4 kickoff, KDP outline and chapter drafting.
2. Scale gate review and go/no-go decision for Phase 5.

Week 5:
1. Phase 4 complete: KDP pipeline MVP live.
2. KDP assets linked to domain campaigns; at least 2 export packages verified.

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
5. KDP pipeline produces >= 2 complete packages per month with < 20% manual intervention; measured by `kdp_completion_rate`.
6. System handles >= 50 domains with queue lag < 1h and error rate < 2%; measured by `queue_lag_p99` and `error_rate` dashboards.

