# DomainEmpire Codebase Audit

**Generated:** 2026-02-18
**Schema file:** `src/lib/db/schema.ts` (2,693 lines)
**Drizzle config:** `drizzle.config.ts` → schema at `./src/lib/db/schema.ts`, dialect `postgresql`

---

## 1. DATABASE SCHEMA

All tables defined in `src/lib/db/schema.ts`. 61 tables total.

### 1.1 `domains` (FULL)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | defaultRandom() | Primary key |
| domain | text | NO | — | FQDN, unique |
| tld | text | NO | — | TLD portion |
| registrar | text | YES | 'godaddy' | Registrar name |
| purchaseDate | timestamp | YES | — | When domain was purchased |
| purchasePrice | numeric(12,2) | YES | — | Cost paid |
| renewalDate | timestamp | YES | — | Next renewal date |
| renewalPrice | numeric(12,2) | YES | — | Renewal cost |
| status | text enum | NO | 'parked' | `'parked' \| 'active' \| 'redirect' \| 'forsale' \| 'defensive'` |
| lifecycleState | text enum | NO | 'sourced' | `'sourced' \| 'underwriting' \| 'approved' \| 'acquired' \| 'build' \| 'growth' \| 'monetized' \| 'hold' \| 'sell' \| 'sunset'` |
| bucket | text enum | NO | 'build' | `'build' \| 'redirect' \| 'park' \| 'defensive'` |
| tier | integer | YES | 3 | Domain tier 1-3 |
| niche | text | YES | — | Primary niche |
| subNiche | text | YES | — | Sub-niche |
| redirectTargetId | uuid | YES | — | FK → domains.id (self-ref) |
| githubRepo | text | YES | — | Legacy GitHub repo name |
| cloudflareProject | text | YES | — | Cloudflare Pages project name |
| isDeployed | boolean | YES | false | Whether site is live |
| lastDeployedAt | timestamp | YES | — | Last deploy timestamp |
| siteTemplate | text enum | YES | 'authority' | `'authority' \| 'comparison' \| 'calculator' \| 'review' \| 'tool' \| 'hub' \| 'decision' \| 'cost_guide' \| 'niche' \| 'info' \| 'consumer' \| 'brand' \| 'magazine' \| 'landing' \| 'docs' \| 'storefront' \| 'minimal' \| 'dashboard' \| 'newsletter' \| 'community'` |
| vertical | text | YES | — | Business vertical (Legal, Insurance, Health, etc.) |
| cloudflareAccount | text | YES | — | Cloudflare account reference for host sharding |
| themeStyle | text | YES | — | Legacy v1 theme name |
| skin | text | YES | 'slate' | v2 color skin |
| monetizationModel | text | YES | — | Revenue strategy description |
| monetizationTier | integer | YES | 3 | 1=Lead Gen, 2=Affiliate, 3=Display, 4=Brand |
| estimatedRevenueAtMaturityLow | real | YES | — | Low revenue estimate |
| estimatedRevenueAtMaturityHigh | real | YES | — | High revenue estimate |
| estimatedFlipValueLow | real | YES | — | Low flip value |
| estimatedFlipValueHigh | real | YES | — | High flip value |
| estimatedMonthlyRevenueLow | real | YES | — | Monthly revenue low |
| estimatedMonthlyRevenueHigh | real | YES | — | Monthly revenue high |
| healthScore | real | YES | — | Domain health 0-100 |
| healthUpdatedAt | timestamp | YES | — | When health was last computed |
| notes | text | YES | — | Free-form notes |
| tags | jsonb | YES | [] | String array |
| contentConfig | jsonb | YES | {} | **See section 1.4 below** |
| createdAt | timestamp | YES | defaultNow() | — |
| updatedAt | timestamp | YES | defaultNow() | — |
| deletedAt | timestamp | YES | — | Soft delete |

**Indexes:** status, lifecycleState, tier, bucket, vertical

**Relations:** keywords (many), articles (many), lifecycleEvents (many), registrarProfile (one), ownershipEvents (many), financeLedgerEntries (many), financeMonthlyCloses (many), monetizationProfile (one), revenueSnapshots (many), expenses (many), notifications (many), competitors (many), backlinkSnapshots (many), approvalPolicies (many), reviewTasks (many), previewBuilds (many), disclosureConfig (one), complianceSnapshots (many), datasets (many), subscribers (many), channelProfiles (many), integrationConnections (many), redirectTarget (self-ref one)

**NOTE:** There is NO `wave` field on the domains table. There is NO `cluster` field. Niche assignment uses `niche` and `subNiche` text fields.

### 1.2 `pageDefinitions` (FULL)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | defaultRandom() | Primary key |
| domainId | uuid | NO | — | FK → domains.id (cascade) |
| route | text | NO | '/' | URL path for this page |
| title | text | YES | — | Page title |
| metaDescription | text | YES | — | SEO meta description |
| theme | text | NO | 'clean' | v2 structural theme name |
| skin | text | NO | 'slate' | v2 color skin name |
| blocks | jsonb | NO | [] | Array of block envelopes (see §2) |
| isPublished | boolean | NO | false | Publication flag |
| status | text | NO | 'draft' | Workflow status string |
| reviewRequestedAt | timestamp | YES | — | When review was requested |
| lastReviewedAt | timestamp | YES | — | When last reviewed |
| lastReviewedBy | uuid | YES | — | FK → users.id |
| version | integer | NO | 1 | Version counter |
| createdAt | timestamp | YES | defaultNow() | — |
| updatedAt | timestamp | YES | defaultNow() | — |

**Indexes:** domainId+route (unique), domainId, isPublished, status

**Relations:** domain (one → domains), lastReviewedByUser (one → users), variants (many → pageVariants)

### 1.3 `contentQueue` (FULL)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | defaultRandom() | Primary key |
| jobType | text enum | NO | — | See full list below |
| domainId | uuid | YES | — | FK → domains.id (cascade) |
| articleId | uuid | YES | — | FK → articles.id (cascade) |
| keywordId | uuid | YES | — | FK → keywords.id (set null) |
| payload | jsonb | YES | {} | Job-specific input data |
| result | jsonb | YES | — | Job output/result |
| status | text enum | YES | 'pending' | `'pending' \| 'processing' \| 'completed' \| 'failed' \| 'cancelled'` |
| priority | integer | YES | 0 | Higher is better |
| attempts | integer | YES | 0 | Number of attempts |
| maxAttempts | integer | YES | 3 | Max retry count |
| errorMessage | text | YES | — | Last error message |
| apiTokensUsed | integer | YES | 0 | Total tokens consumed |
| apiCost | numeric(12,2) | YES | '0' | Total API cost |
| createdAt | timestamp | YES | defaultNow() | — |
| startedAt | timestamp | YES | — | When processing began |
| completedAt | timestamp | YES | — | When job finished |
| scheduledFor | timestamp | YES | — | Future scheduling |
| lockedUntil | timestamp | YES | — | Worker lock expiry |

**Job types (full enum):**
`'generate_outline' | 'generate_draft' | 'humanize' | 'seo_optimize' | 'resolve_external_links' | 'generate_meta' | 'deploy' | 'fetch_analytics' | 'keyword_research' | 'bulk_seed' | 'research' | 'evaluate' | 'content_refresh' | 'fetch_gsc' | 'check_backlinks' | 'check_renewals' | 'check_datasets' | 'ingest_listings' | 'enrich_candidate' | 'score_candidate' | 'create_bid_plan' | 'refresh_research_cache' | 'create_promotion_plan' | 'generate_short_script' | 'render_short_video' | 'publish_pinterest_pin' | 'publish_youtube_short' | 'sync_campaign_metrics' | 'run_media_review_escalations' | 'run_integration_connection_sync' | 'campaign_launch_recovery' | 'generate_block_content' | 'ai_detection_check'`

**Indexes:** scheduledFor, status, priority, lockedUntil, jobType

### 1.4 `contentConfig` JSONB Structure

Defined inline on `domains.contentConfig`. TypeScript type:

```typescript
{
    voiceSeed?: {
        name: string;
        background: string;
        quirk: string;
        toneDial: number;
        tangents: string;
        petPhrase: string;
        formatting: string;
    };
    schedule?: {
        frequency: 'daily' | 'weekly' | 'sporadic';
        timeOfDay: 'morning' | 'evening' | 'random';
        wordCountRange: [number, number];
    };
    contentTypeMix?: Record<string, number>;
    writingWorkflow?: {
        outlineTemplate?: string;
        draftTemplate?: string;
        humanizeTemplate?: string;
        seoTemplate?: string;
        metaTemplate?: string;
        reviewTemplate?: string;
    };
    branding?: {
        colorScheme?: string;
        primaryColor?: string;
        secondaryColor?: string;
        accentColor?: string;
        typographyPreset?: string;
    };
    quickDeploySeed?: number;
}
```

The `writingWorkflow` sub-object allows per-domain override of AI prompt templates for each pipeline stage. The `voiceSeed` is generated by the AI and gives each domain a unique writer persona.

### 1.5 All Other Tables (Summary)

| Table | File | Key Purpose |
|-------|------|-------------|
| pageVariants | schema.ts:158 | A/B test block compositions per page |
| blockTemplates | schema.ts:188 | Cross-domain reusable block library |
| domainLifecycleEvents | schema.ts:215 | Lifecycle transition audit trail |
| domainRegistrarProfiles | schema.ts:237 | Registrar ownership/transfer state |
| domainOwnershipEvents | schema.ts:289 | Ownership operations audit log |
| keywords | schema.ts:328 | Target keywords per domain |
| articles | schema.ts:365 | Content across all domains |
| monetizationProfiles | schema.ts:563 | Per-domain ad/affiliate/lead config |
| contentQueue | schema.ts:609 | Async job processing queue |
| domainResearch | schema.ts:681 | Domain acquisition investigation |
| acquisitionEvents | schema.ts:745 | Candidate lifecycle audit |
| researchCache | schema.ts:761 | Cached online research results |
| domainKnowledge | schema.ts:780 | Per-domain fact accumulation |
| promotionCampaigns | schema.ts:806 | Growth channel orchestration |
| promotionJobs | schema.ts:824 | Promotion job tracking |
| promotionEvents | schema.ts:842 | Promotion event log |
| growthChannelCredentials | schema.ts:854 | Growth channel auth tokens |
| growthCredentialDrillRuns | schema.ts:880 | Credential drill run tracking |
| integrationConnections | schema.ts:907 | External service integrations |
| integrationSyncRuns | schema.ts:959 | Integration sync execution log |
| cloudflareShardHealth | schema.ts:989 | CF shard health monitoring |
| domainChannelProfiles | schema.ts:1029 | Domain-channel compatibility |
| mediaAssets | schema.ts:1067 | Media asset management |
| mediaAssetUsage | schema.ts:1092 | Media asset usage tracking |
| mediaModerationTasks | schema.ts:1105 | Media moderation workflow |
| mediaModerationEvents | schema.ts:1137 | Media moderation event log |
| mediaReviewPolicyDailySnapshots | schema.ts:1160 | Review policy daily metrics |
| mediaReviewPolicyAlertCodeDailySnapshots | schema.ts:1179 | Alert code daily metrics |
| mediaReviewPolicyPlaybookDailySnapshots | schema.ts:1201 | Playbook daily metrics |
| revenueSnapshots | schema.ts:1226 | Daily per-domain revenue |
| siteTemplates | schema.ts:1258 | Reusable site templates |
| apiCallLogs | schema.ts:1281 | AI API call cost tracking |
| expenses | schema.ts:1314 | Portfolio cost tracking |
| domainFinanceLedgerEntries | schema.ts:1340 | Domain-level financial txns |
| domainFinanceMonthlyCloses | schema.ts:1377 | Per-domain P&L snapshots |
| notifications | schema.ts:1403 | In-app alerts |
| competitors | schema.ts:1435 | Competitor domain tracking |
| backlinkSnapshots | schema.ts:1467 | Backlink profile history |
| users | schema.ts:1500 | Multi-user auth (admin/editor/reviewer/expert) |
| sessions | schema.ts:1523 | Auth session tokens |
| contentRevisions | schema.ts:1538 | Immutable content snapshots |
| reviewEvents | schema.ts:1562 | Append-only review audit log |
| qaChecklistTemplates | schema.ts:1590 | Configurable QA checklists |
| qaChecklistResults | schema.ts:1610 | Completed checklist records |
| approvalPolicies | schema.ts:1631 | Per-domain/YMYL approval rules |
| reviewTasks | schema.ts:1653 | Human-in-loop approval queue |
| previewBuilds | schema.ts:1697 | Ephemeral reviewer preview artifacts |
| citations | schema.ts:1723 | Structured source citations |
| disclosureConfigs | schema.ts:1742 | Per-domain compliance settings |
| complianceSnapshots | schema.ts:1762 | Daily compliance metrics |
| datasets | schema.ts:1797 | External data sources |
| articleDatasets | schema.ts:1832 | Article↔dataset join table |
| clickEvents | schema.ts:1847 | Campaign click attribution |
| subscribers | schema.ts:1872 | Email captures from deployed sites |
| abTests | schema.ts:1934 | Title/CTA A/B testing |
| competitorSnapshots | schema.ts:1964 | Historical SERP tracking |
| idempotencyKeys | schema.ts:1985 | Duplicate mutation prevention |
| formSubmissions | schema.ts:2669 | Data from deployed site forms |

---

## 2. BLOCK SYSTEM

### 2.1 Block Envelope

Defined in `src/lib/deploy/blocks/schemas.ts:60-68`:

```typescript
const BlockEnvelopeSchema = z.object({
  id: z.string(),
  type: BlockTypeEnum,       // one of 33 block type strings
  variant: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});
```

The `pageDefinitions.blocks` column stores `Array<BlockEnvelope>`.

### 2.2 All 33 Block Types

#### Layout Blocks

**Header** (`src/lib/deploy/blocks/schemas.ts:77`)
- Category: `layout`
- Variants: `'topbar' | 'centered' | 'minimal' | 'split'`
- Content: `{ siteName: string, logoUrl?: string, navLinks?: {label, href}[] }`
- Config: `{ variant: HeaderVariant, sticky: boolean, showSearch: boolean }`

**Footer** (`schemas.ts:96`)
- Category: `layout`
- Variants: `'minimal' | 'multi-column' | 'newsletter' | 'legal'`
- Content: `{ siteName: string, copyrightYear?: number, columns?: {title, links[]}[], disclaimerText?: string, newsletterEndpoint?: string, newsletterHeadline?: string }`
- Config: `{ variant: FooterVariant, showDisclaimer: boolean }`

**Sidebar** (`schemas.ts:122`)
- Category: `layout`
- Variants: none
- Content: `{ sections: {title, html}[] }`
- Config: `{ position: 'left'|'right', sticky: boolean, width: string }`

#### Page Blocks

**Hero** (`schemas.ts:143`)
- Category: `hero`
- Variants: `'centered' | 'split' | 'minimal' | 'gradient' | 'image'`
- Content: `{ heading: string, subheading?: string, ctaText?: string, ctaUrl?: string, imageUrl?: string, imageAlt?: string, badge?: string }`
- Config: `{ variant: HeroVariant, fullWidth: boolean, overlay: boolean }`
- Example envelope:
```json
{
  "id": "hero-1",
  "type": "Hero",
  "variant": "centered",
  "content": { "heading": "Welcome", "subheading": "Your guide", "ctaText": "Get Started", "ctaUrl": "/guide" },
  "config": { "variant": "centered", "fullWidth": false, "overlay": false }
}
```

#### Content Blocks

**ArticleBody** (`schemas.ts:169`)
- Category: `content`
- Content: `{ markdown: string, title?: string, metaDescription?: string, targetKeyword?: string, secondaryKeywords?: string[] }`
- Config: `{ showTableOfContents: boolean, showPrintButton: boolean }`

**FAQ** (`schemas.ts:186`)
- Category: `faq`
- Content: `{ items: {question, answer}[] }`
- Config: `{ openFirst: boolean, maxAnswerLength?: number, emitJsonLd: boolean }`

**StepByStep** (`schemas.ts:203`) / **Checklist** (`schemas.ts:203`)
- Category: `steps`
- Content: `{ steps: {heading, body}[] }`
- Config: `{ interactive: boolean, showProgress: boolean, showPrintButton: boolean, numbered: boolean }`

**AuthorBio** (`schemas.ts:221`)
- Category: `social-proof`
- Content: `{ name: string, title?: string, bio: string, avatarUrl?: string, credentials?: string[], socialLinks?: {platform, url}[] }`
- Config: `{ layout: 'inline'|'card'|'sidebar' }`

#### Comparison Blocks

**ComparisonTable** (`schemas.ts:245`)
- Category: `comparison`
- Content: `{ options: {name, url?, badge?, scores: Record<string, number|string>}[], columns: {key, label, type, sortable?}[], defaultSort?: string, verdict?: string }`
- Config: `{ variant: 'table'|'cards', showBadges: boolean, showVerdict: boolean, showCta: boolean, emitJsonLd: boolean }`

**VsCard** (`schemas.ts:274`)
- Category: `comparison`
- Content: `{ itemA: {name, description, pros[], cons[], rating?, url?}, itemB: {same}, verdict?: string }`
- Config: `{ showRatings: boolean, highlightWinner: boolean }`

**RankingList** (`schemas.ts:303`)
- Category: `comparison`
- Content: `{ items: {rank, name, description, rating?, badge?, url?}[], title?: string }`
- Config: `{ showRank: boolean, maxItems?: number }`

**ProsConsCard** (`schemas.ts:324`)
- Category: `comparison`
- Content: `{ name: string, rating?: number, pros: string[], cons: string[], summary?: string, url?: string, badge?: string }`
- Config: `{ showRating: boolean, showCta: boolean }`

#### Conversion Blocks

**LeadForm** (`schemas.ts:347`)
- Category: `lead-capture`
- Content: `{ fields: {name, label, type, required?, options?}[], consentText: string, successMessage: string, disclosureAboveFold?: string, privacyPolicyUrl?: string }`
- Config: `{ endpoint: string, submitLabel: string, showDisclosure: boolean }`

**CTABanner** (`schemas.ts:371`)
- Category: `lead-capture`
- Content: `{ text: string, buttonLabel: string, buttonUrl: string }`
- Config: `{ style: 'bar'|'card'|'banner', trigger: 'immediate'|'scroll'|'exit', scrollThreshold: number, dismissible: boolean }`

**ScrollCTA** (`schemas.ts:722`)
- Category: `lead-capture`
- Same as CTABanner with `trigger` defaulting to `'scroll'`

**PricingTable** (`schemas.ts:388`)
- Category: `data-display`
- Content: `{ plans: {name, price, period?, features[], ctaText?, ctaUrl?, highlighted?, badge?}[] }`
- Config: `{ columns: number, showToggle: boolean }`

#### Calculator Blocks

**QuoteCalculator** (`schemas.ts:410`)
- Category: `calculator`
- Content: `{ inputs: {id, label, type, default?, min?, max?, step?, options?}[], outputs: {id, label, format, decimals?}[], formula?: string, assumptions?: string[], methodology?: string }`
- Config: `{ showMethodology: boolean, autoCalculate: boolean, emitJsonLd: boolean }`

**CostBreakdown** (`schemas.ts:449`)
- Category: `calculator`
- Content: `{ ranges: {label?, low, high, average?, dataPoints?}[], factors?: {name, impact, description}[] }`
- Config: `{ showFactors: boolean, currencySymbol: string, showPrintButton: boolean }`

#### Data Blocks

**StatGrid** (`schemas.ts:474`)
- Category: `data-display`
- Content: `{ items: {id, title, metricLabel, metricValue, summary, group}[] }`
- Config: `{ filterable: boolean, sortable: boolean, showBars: boolean, columns: number }`

**DataTable** (`schemas.ts:496`)
- Category: `data-display`
- Content: `{ headers: string[], rows: (string|number)[][], caption?: string }`
- Config: `{ sortable: boolean, searchable: boolean, striped: boolean }`

#### Trust Blocks

**TestimonialGrid** (`schemas.ts:516`)
- Category: `social-proof`
- Content: `{ testimonials: {quote, author, title?, avatarUrl?, rating?}[] }`
- Config: `{ columns: number, showRatings: boolean }`

**TrustBadges** (`schemas.ts:535`)
- Category: `social-proof`
- Content: `{ badges: {label, iconUrl?, description?}[] }`
- Config: `{ layout: 'row'|'grid' }`

**CitationBlock** (`schemas.ts:551`)
- Category: `metadata`
- Content: `{ sources: {title, url?, publisher?, retrievedAt?, usage?}[] }`
- Config: `{ collapsible: boolean }`

**LastUpdated** (`schemas.ts:569`)
- Category: `metadata`
- Content: `{ date: string, reviewedBy?: string, status: 'fresh'|'review-pending'|'stale' }`
- Config: `{ showBadge: boolean, showReviewer: boolean }`

**MedicalDisclaimer** (`schemas.ts:584`)
- Category: `metadata`
- Content: `{ disclaimerText: string, ctaText?: string }`
- Config: `{ showDoctorCta: boolean, position: 'top'|'bottom'|'both' }`

#### Interactive Blocks

**Wizard** (`schemas.ts:604`)
- Category: `lead-capture`
- Content: `{ steps: {id, title, description?, fields[], nextStep?, branches?}[], resultRules: {condition, title, body, cta?}[], resultTemplate: 'summary'|'recommendation'|'score'|'eligibility', collectLead?: {fields[], consentText, endpoint}, scoring?: {method?, weights?, valueMap?, bands?, outcomes?} }`
- Config: `{ mode: 'wizard'|'configurator'|'quiz'|'survey'|'assessment', showProgress: boolean, showAnswerSummary: boolean }`

**GeoContent** (`schemas.ts:672`)
- Category: `content`
- Content: `{ regions: Record<string, {content, label?}>, fallback: string }`
- Config: `{ detectionMethod: 'timezone'|'ip' }`

**InteractiveMap** (`schemas.ts:689`)
- Category: `content`
- Content: `{ regions: Record<string, {label, content}>, defaultRegion?: string }`
- Config: `{ showTileGrid: boolean, showDropdown: boolean }`

**PdfDownload** (`schemas.ts:706`)
- Category: `metadata`
- Content: `{ buttonText?: string, articleId: string, domainId: string }`
- Config: `{ type: 'article'|'worksheet', gated: boolean, captureApiUrl?: string }`

**EmbedWidget** (`schemas.ts:731`)
- Category: `content`
- Content: `{ sourceBlockId: string, title: string }`
- Config: `{ width: string, height: string }`

**ResourceGrid** (`schemas.ts:793`)
- Category: `internal-links`
- Content: `{ heading?: string, items: {icon, title, description, href}[] }`
- Config: `{}` (passthrough)

**LatestArticles** (`schemas.ts:808`)
- Category: `internal-links`
- Content: `{ heading?: string, articles: {title, excerpt, href, image?}[] }`
- Config: `{}` (passthrough)

### 2.3 Block Schema Registry

`BLOCK_SCHEMA_REGISTRY` at `schemas.ts:874-911` maps every `BlockType` string to its `{ content: ZodSchema, config: ZodSchema }`.

### 2.4 Section Categories

Defined as `BLOCK_CATEGORIES` at `schemas.ts:964-998`:
`'hero' | 'content' | 'faq' | 'steps' | 'social-proof' | 'comparison' | 'lead-capture' | 'calculator' | 'data-display' | 'internal-links' | 'layout' | 'metadata'`

### 2.5 Page Type Templates

6 canonical page shapes defined as `PAGE_TYPE_TEMPLATES` at `schemas.ts:1021-1096`:
- `offer` — Lead-capture landing page
- `comparison` — X vs Y / Best-of pages
- `directory` — Hub/listing page
- `article` — Long-form content
- `calculator` — Interactive tool page
- `legal` — Privacy/terms/contact

### 2.6 Block Composition

Pages are composed by storing an ordered array of `BlockEnvelope` objects in `pageDefinitions.blocks`. Each block has an `id`, `type`, optional `variant`, optional `content`, optional `config`. The assembler (`src/lib/deploy/blocks/assembler.ts`) iterates this array and renders each block to HTML using registered renderers.

### 2.7 Key Block File Paths

| File | Purpose |
|------|---------|
| `src/lib/deploy/blocks/schemas.ts` | All Zod schemas, types, registry, categories |
| `src/lib/deploy/blocks/assembler.ts` | HTML rendering engine, page assembly, SEO |
| `src/lib/deploy/blocks/renderers-interactive.ts` | Interactive block renderers (18 types) |
| `src/lib/deploy/blocks/renderer-registry.ts` | Registry system for block renderers |
| `src/lib/deploy/blocks/presets.ts` | Homepage presets (20+ templates) |
| `src/lib/deploy/blocks/sub-page-presets.ts` | Sub-page presets (~15 per domain) |
| `src/lib/deploy/blocks/default-content.ts` | Default content generators |
| `src/lib/deploy/blocks/seed.ts` | Seeds page definitions from v1 templates |
| `src/lib/deploy/blocks/freshness.ts` | Block content freshness checking |
| `src/lib/deploy/blocks/index.ts` | Barrel exports |
| `src/lib/ai/block-pipeline.ts` | AI content generation for blocks |
| `src/lib/ai/block-prompts.ts` | Per-block AI prompt templates |

---

## 3. THEME AND SKIN SYSTEM

### 3.1 Theme Definitions (Structural Tokens)

**File:** `src/lib/deploy/themes/theme-tokens.ts`

4 themes:

| Theme Name | Heading Font | Body Font | Container Max | Line Height |
|-----------|-------------|-----------|--------------|-------------|
| `clean` | Public Sans | Public Sans | 1100px | 1.72 |
| `editorial` | Merriweather | Source Sans Pro | 900px | 1.78 |
| `bold` | DM Sans | Inter | 1200px | 1.7 |
| `minimal` | system-ui | system-ui | 680px | 1.8 |

Each theme emits CSS custom properties:
```
--font-heading, --font-body, --font-mono, --font-size-base, --line-height,
--radius-sm, --radius-md, --radius-lg, --radius-full,
--shadow-sm, --shadow-md, --shadow-lg,
--spacing-unit, --container-max, --border-width, --transition-speed,
--sp-1 through --sp-8, --section-padding
```

### 3.2 Skin Definitions (Color Tokens)

**File:** `src/lib/deploy/themes/skin-definitions.ts`

6 skins:

| Skin Name | Primary | Accent | Background | Description |
|-----------|---------|--------|------------|-------------|
| `slate` | #1e293b | #2563eb | #ffffff | Neutral professional |
| `ocean` | #1e3a5f | #2563eb | #f8fbff | Blue professional |
| `forest` | #047857 | #10b981 | #f0fdf4 | Green natural |
| `ember` | #b45309 | #f59e0b | #fffbf5 | Warm amber |
| `midnight` | #38bdf8 | #38bdf8 | #0f172a | Dark mode |
| `coral` | #7c3aed | #fb7185 | #fffaf2 | Purple/pink vibrant |

Each skin emits CSS custom properties:
```
--color-primary, --color-primary-hover, --color-secondary,
--color-bg, --color-bg-surface, --color-text, --color-text-muted,
--color-accent, --color-accent-hover, --color-border, --color-border-strong,
--color-success, --color-success-light, --color-success-hover,
--color-warning, --color-warning-light, --color-warning-hover,
--color-error, --color-error-light, --color-error-hover,
--color-hero-bg, --color-hero-text, --color-header-border,
--color-footer-bg, --color-footer-text,
--color-badge-bg, --color-badge-text,
--color-link, --color-link-hover
```

### 3.3 Theme+Skin Assignment

- **Per-domain:** `domains.themeStyle` (v1 legacy), `domains.skin` (v2 color)
- **Per-page:** `pageDefinitions.theme` and `pageDefinitions.skin` — these are the v2 fields actually used during rendering
- Per-page overrides take precedence over domain defaults

### 3.4 Theme+Skin Application During Rendering

**Function:** `generateV2GlobalStyles(themeName, skinName, siteTemplate?, domain?)` in `src/lib/deploy/themes/index.ts`

Layers: theme tokens CSS → skin tokens CSS → base styles → layout styles → component styles → block variant styles → domain variant styles → dark mode overrides → responsive styles.

The output is also run through `randomizeCSS(raw, domain)` (from `src/lib/deploy/themes/class-randomizer.ts`) for anti-fingerprinting, then minified.

### 3.5 V1 → V2 Migration Maps

```typescript
// src/lib/deploy/themes/theme-tokens.ts
V1_THEME_TO_V2_THEME: Record<string, string>
// src/lib/deploy/themes/skin-definitions.ts
V1_THEME_TO_SKIN: Record<string, string>
```

16 v1 themes map to v2 theme+skin pairs.

### 3.6 Additional Theme Files

| File | Purpose |
|------|---------|
| `src/lib/deploy/themes/base.ts` | Base CSS (reset, typography) |
| `src/lib/deploy/themes/components.ts` | Component-level CSS |
| `src/lib/deploy/themes/block-variants.ts` | Block-specific variant CSS |
| `src/lib/deploy/themes/responsive.ts` | Responsive breakpoint CSS |
| `src/lib/deploy/themes/variants.ts` | Per-domain CSS variation |
| `src/lib/deploy/themes/class-randomizer.ts` | Anti-fingerprint class name randomization |
| `src/lib/deploy/themes/theme-definitions.ts` | Legacy v1 theme definitions |
| `src/lib/deploy/themes/policy.ts` | Theme resolution policy |
| `src/lib/deploy/layouts/layout-css.ts` | Layout-specific CSS |

---

## 4. PAGE DEFINITION STRUCTURE

### 4.1 TypeScript Type

```typescript
type PageDefinition = {
    id: string;                  // uuid
    domainId: string;            // uuid FK → domains
    route: string;               // URL path, default '/'
    title: string | null;
    metaDescription: string | null;
    theme: string;               // v2 theme name, default 'clean'
    skin: string;                // v2 skin name, default 'slate'
    blocks: Array<{
        id: string;
        type: string;
        variant?: string;
        content?: Record<string, unknown>;
        config?: Record<string, unknown>;
    }>;
    isPublished: boolean;        // default false
    status: string;              // default 'draft'
    reviewRequestedAt: Date | null;
    lastReviewedAt: Date | null;
    lastReviewedBy: string | null; // uuid FK → users
    version: number;             // default 1
    createdAt: Date | null;
    updatedAt: Date | null;
};
```

### 4.2 Route/Slug

The `route` field is the URL path for the page. Combined with `domainId`, it forms a unique index (`page_def_domain_route_uidx`). Routes like `/`, `/guides/home-insurance`, `/calculator/mortgage` etc.

### 4.3 Theme/Skin Overrides

Each pageDefinition has its own `theme` and `skin` fields. These override the domain-level settings. During rendering, the page's theme+skin are used to generate CSS.

### 4.4 Publish/Review Workflow

- `status`: Free text field (default `'draft'`), no enum constraint in schema — but typically `'draft'`, `'review'`, `'published'`
- `isPublished`: Boolean flag used for deploy filtering
- `reviewRequestedAt`: When review was requested
- `lastReviewedAt`: When last reviewed
- `lastReviewedBy`: FK to users table
- `version`: Integer incremented on updates

### 4.5 Relation to Domains

Each pageDefinition belongs to exactly one domain via `domainId`. A domain can have many page definitions (homepage + sub-pages). The deploy processor queries for published pages: `pageDefinitions WHERE domainId = X AND isPublished = true`.

---

## 5. AI WORKER AND CONTENT PIPELINE

### 5.1 Worker Structure

**File:** `src/lib/ai/worker.ts` (3,907 lines)

Main functions:
- `runWorkerContinuously()` — Infinite polling loop
- `runWorkerOnce()` — Single batch pass
- `executeJob()` — Switch statement routing to job handlers (at line 2278)

Constants:
- `LOCK_DURATION_MS` = 5 min
- `JOB_TIMEOUT_MS` = 10 min
- `BATCH_SIZE` = env `WORKER_BATCH_SIZE` or 10
- `POLL_INTERVAL_MS` = 5000ms
- `STALE_LOCK_CHECK_INTERVAL` = 60s
- `SCHEDULER_CHECK_INTERVAL` = 1 hour

### 5.2 Content Queue Job Types (executeJob routing)

| Job Type | Handler | Import |
|----------|---------|--------|
| `generate_outline` | `processOutlineJob()` | `./pipeline` |
| `generate_draft` | `processDraftJob()` | `./pipeline` |
| `humanize` | `processHumanizeJob()` | `./pipeline` |
| `seo_optimize` | `processSeoOptimizeJob()` | `./pipeline` |
| `resolve_external_links` | `processResolveExternalLinksJob()` | `./pipeline` |
| `ai_detection_check` | `processAiDetectionCheckJob()` | `./pipeline` |
| `generate_meta` | `processMetaJob()` | `./pipeline` |
| `keyword_research` | `processKeywordResearchJob()` | `./pipeline` |
| `research` | `processResearchJob()` | `./pipeline` |
| `bulk_seed` | `processBulkSeedJob()` | local |
| `deploy` | `processDeployJob()` | `@/lib/deploy/processor` |
| `evaluate` | `evaluateDomain()` | `@/lib/evaluation/evaluator` |
| `fetch_analytics` | inline (CF + GSC) | `@/lib/analytics/cloudflare` |
| `content_refresh` | `checkAndRefreshStaleContent()` | `@/lib/content/refresh` |
| `fetch_gsc` | `getDomainGSCSummary()` | `@/lib/analytics/search-console` |
| `check_backlinks` | `checkBacklinks()` | `@/lib/analytics/backlinks` |
| `check_renewals` | `checkRenewals()` | `@/lib/domain/renewals` |
| `check_datasets` | `checkStaleDatasets()` | `@/lib/datasets/freshness` |
| `ingest_listings` | inline acquisition pipeline | local |
| `enrich_candidate` | inline | local |
| `score_candidate` | inline | local |
| `create_bid_plan` | inline | local |
| `refresh_research_cache` | `refreshResearchCacheEntry()` | `@/lib/ai/research-cache` |
| `generate_block_content` | block pipeline | `@/lib/ai/block-pipeline` |
| `create_promotion_plan` | inline growth | local |
| `generate_short_script` | growth execution | `@/lib/growth/publishers` |
| `render_short_video` | growth execution | local |
| `publish_pinterest_pin` | `publishToGrowthChannel()` | `@/lib/growth/publishers` |
| `publish_youtube_short` | `publishToGrowthChannel()` | `@/lib/growth/publishers` |
| `sync_campaign_metrics` | inline | local |
| `run_media_review_escalations` | `runMediaReviewEscalationSweep()` | `@/lib/growth/media-review-escalation` |
| `run_integration_connection_sync` | `runIntegrationConnectionSync()` | `@/lib/integrations/executor` |
| `campaign_launch_recovery` | launch freeze recovery | `@/lib/growth/launch-freeze` |

### 5.3 Multi-Stage Writing Workflow

8 stages in order (from `src/lib/ai/pipeline.ts`):

1. **Research** — Deep research with online model (Perplexity/Sonar)
2. **Outline Generation** — Content structure via quality model
3. **Draft Generation** — Full article draft
4. **Humanization** — Anti-AI rewriting
5. **SEO Optimization** — Keyword optimization + internal linking
6. **External Link Resolution** — Resolve `[EXTERNAL_LINK]` placeholders
7. **AI Detection Check** — GPTZero validation
8. **Meta Generation** — SEO metadata (title, description, schema)

### 5.4 WritingWorkflow Customization

`contentConfig.writingWorkflow` on a domain can override prompt templates per stage:
- `outlineTemplate` → outline generation
- `draftTemplate` → draft generation
- `humanizeTemplate` → humanization pass
- `seoTemplate` → SEO optimization
- `metaTemplate` → meta generation
- `reviewTemplate` → AI review

### 5.5 AI Model/Provider Configuration

**File:** `src/lib/ai/openrouter.ts`

Provider: **OpenRouter** (gateway to multiple models)
Base URL: `https://openrouter.ai/api/v1`
Env var: `OPENROUTER_API_KEY`

Model configuration (all configurable via env vars):

| Task | Env Override | Default |
|------|-------------|---------|
| keywordResearch | `OPENROUTER_MODEL_FAST` | `openrouter/auto` |
| domainClassify | `OPENROUTER_MODEL_FAST` | `openrouter/auto` |
| seoOptimize | `OPENROUTER_MODEL_SEO` | `openrouter/auto` |
| titleGeneration | `OPENROUTER_MODEL_FAST` | `openrouter/auto` |
| outlineGeneration | `OPENROUTER_MODEL_QUALITY` | `openrouter/auto` |
| draftGeneration | `OPENROUTER_MODEL_QUALITY` | `openrouter/auto` |
| humanization | `OPENROUTER_MODEL_QUALITY` | `openrouter/auto` |
| bulkOperations | `OPENROUTER_MODEL_FAST` | `openrouter/auto` |
| voiceSeedGeneration | `OPENROUTER_MODEL_QUALITY` | `openrouter/auto` |
| aiReview | `OPENROUTER_MODEL_REVIEW` | `anthropic/claude-opus-4.1` |
| research | `OPENROUTER_MODEL_RESEARCH` | `openrouter/auto` |
| blockContent | `OPENROUTER_MODEL_QUALITY` | `openrouter/auto` |
| vision | `OPENROUTER_MODEL_VISION` | `google/gemini-2.0-flash-001` |
| imageGenFast | `OPENROUTER_MODEL_IMAGE_GEN_FAST` | `google/gemini-2.0-flash-exp:free` |
| imageGenQuality | `OPENROUTER_MODEL_IMAGE_GEN_QUALITY` | `google/gemini-2.5-pro-preview` |

Each task has a fallback chain defined in `MODEL_ROUTING_REGISTRY`. The client includes retry logic, circuit breaker integration, cost tracking, and a 120s fetch timeout.

### 5.6 AI Prompt Templates

**File:** `src/lib/ai/prompts.ts` — PROMPTS object with these generators:

| Key | Purpose |
|-----|---------|
| `research` | Deep research prompt for online models |
| `voiceSeed` | Generate unique writer persona |
| `article` | Standard article with anti-AI rules |
| `comparison` | X vs Y comparison page |
| `calculator` | Calculator/tool page HTML |
| `costGuide` | Cost guide article |
| `leadCapture` | Legal lead capture page |
| `healthDecision` | Health decision content |
| `humanize` | Anti-AI rewriting pass |
| `seoOptimize` | SEO optimization pass |
| `meta` | SEO metadata generation |
| `aiReview` | Opus-class editorial + AI-detection review |

All prompts embed extensive anti-AI writing rules including: banned words list, em-dash prohibition, sentence length variance requirements, personality markers, triad pattern avoidance.

**File:** `src/lib/ai/block-prompts.ts` — Per-block prompt templates for Template System v2 block content generation.

### 5.7 Worker Bootstrap

**File:** `src/lib/ai/worker-bootstrap.ts` — Server-side worker startup with auto-restart and exponential backoff.

**File:** `src/scripts/worker.ts` — Standalone worker process entry point.

---

## 6. DEPLOYMENT PIPELINE

### 6.1 Processor

**File:** `src/lib/deploy/processor.ts`

### 6.2 Deploy Steps (Production)

1. **Generate Files** — `generateSiteFiles(domainId)` from `src/lib/deploy/generator.ts`
2. **Upload to Cloudflare** — Direct Upload API via `directUploadDeploy()` from `src/lib/deploy/cloudflare.ts`
3. **Add Custom Domain** — `addCustomDomain()` links domain to Pages project
4. **Configure DNS Record** — `ensurePagesDnsRecord()` creates CNAME → `{project}.pages.dev`
5. **Update Nameservers** — `updateRegistrarNameservers()` via GoDaddy/Namecheap API
6. **Verify DNS** — `verifyDomainPointsToCloudflare()` ground-truth NS check

### 6.3 Staging Deploys

When `deployTarget === 'staging'`, only steps 1-2 run. Upload uses `{ branch: 'staging' }` parameter. The staging URL is captured from the upload response.

### 6.4 Static HTML Generation

**File:** `src/lib/deploy/generator.ts`

Two paths:
- **v1:** Template-based generation using `siteTemplate` + articles (legacy)
- **v2:** Block-based generation using `pageDefinitions` with `assembler.ts`

The generator also produces AI-generated images via Gemini (through OpenRouter) with SVG fallbacks from `src/lib/deploy/image-gen.ts`.

### 6.5 Cloudflare Pages Direct Upload

**File:** `src/lib/deploy/cloudflare.ts`

API calls:
- `createDirectUploadProject(projectName, credentials)` — Create or get Pages project
- `directUploadDeploy(projectName, files, credentials, options?)` — Upload files
- `addCustomDomain(projectName, domain, credentials)` — Link custom domain
- `ensurePagesDnsRecord(domain, target, credentials)` — Create/update CNAME
- `getZoneNameservers(domain, credentials)` — Get zone NS records
- `verifyDomainPointsToCloudflare(domain)` — Verify DNS resolution

### 6.6 Host Sharding

**File:** `src/lib/deploy/host-sharding.ts`

Distributes domains across multiple Cloudflare accounts. Resolves shard plans via:
1. Domain-level override (`domains.cloudflareAccount`)
2. Integration connections with provider=`cloudflare`
3. Hash bucket assignment
4. Fallback to env `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`

Health tracking via `cloudflareShardHealth` table with penalty scoring, cooldowns, and rate limit detection.

### 6.7 DNS Configuration

**Files:**
- `src/lib/deploy/godaddy.ts` — GoDaddy DNS API
- `src/lib/deploy/namecheap.ts` — Namecheap DNS API
- `src/lib/deploy/registrar.ts` — Registrar abstraction layer

### 6.8 Required Env Vars

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `GODADDY_API_KEY` / `GODADDY_API_SECRET` — For DNS updates
- `NAMECHEAP_API_USER` / `NAMECHEAP_API_KEY` / `NAMECHEAP_USERNAME` / `NAMECHEAP_CLIENT_IP` — For Namecheap DNS

---

## 7. EXISTING DASHBOARD ROUTES

| Route | File | Purpose |
|-------|------|---------|
| `/dashboard` | `page.tsx` | Main dashboard overview |
| `/dashboard/domains` | `page.tsx` | Domain portfolio list |
| `/dashboard/domains/new` | `new/page.tsx` | Add new domain |
| `/dashboard/domains/import` | `import/page.tsx` | Bulk domain import |
| `/dashboard/domains/[id]` | `[id]/page.tsx` | Domain detail view |
| `/dashboard/domains/[id]/pages` | `[id]/pages/page.tsx` | Domain page definitions |
| `/dashboard/domains/[id]/preview` | `[id]/preview/page.tsx` | Domain site preview |
| `/dashboard/domains/[id]/disclosures` | `[id]/disclosures/page.tsx` | Domain compliance disclosures |
| `/dashboard/domains/[id]/monetization` | `[id]/monetization/page.tsx` | Domain monetization settings |
| `/dashboard/content` | `content/page.tsx` | Content overview |
| `/dashboard/content/articles` | `articles/page.tsx` | Article list |
| `/dashboard/content/articles/[id]` | `articles/[id]/page.tsx` | Article detail/editor |
| `/dashboard/content/articles/[id]/audit` | `audit/page.tsx` | Article audit trail |
| `/dashboard/content/articles/[id]/citations` | `citations/page.tsx` | Article citations |
| `/dashboard/content/articles/[id]/revisions` | `revisions/page.tsx` | Article revision history |
| `/dashboard/content/articles/[id]/review` | `review/page.tsx` | Article review interface |
| `/dashboard/content/articles/[id]/visual-review` | `visual-review/page.tsx` | Visual content review |
| `/dashboard/content/new` | `new/page.tsx` | New article creation |
| `/dashboard/content/calendar` | `calendar/page.tsx` | Content calendar |
| `/dashboard/content/duplicates` | `duplicates/page.tsx` | Duplicate content detection |
| `/dashboard/content/freshness` | `freshness/page.tsx` | Content freshness tracker |
| `/dashboard/deploy` | `deploy/page.tsx` | Deployment management |
| `/dashboard/queue` | `queue/page.tsx` | Job queue monitor |
| `/dashboard/analytics` | `analytics/page.tsx` | Traffic/revenue analytics |
| `/dashboard/revenue` | `revenue/page.tsx` | Revenue dashboard |
| `/dashboard/finances` | `finances/page.tsx` | Financial tracking |
| `/dashboard/keywords` | `keywords/page.tsx` | Keyword research/tracking |
| `/dashboard/kpis` | `kpis/page.tsx` | KPI dashboard |
| `/dashboard/competitors` | `competitors/page.tsx` | Competitor tracking |
| `/dashboard/research` | `research/page.tsx` | Domain research |
| `/dashboard/acquisition` | `acquisition/page.tsx` | Domain acquisition pipeline |
| `/dashboard/subscribers` | `subscribers/page.tsx` | Email subscriber management |
| `/dashboard/review` | `review/page.tsx` | Review task queue |
| `/dashboard/review/domain-buy` | `domain-buy/page.tsx` | Domain purchase review |
| `/dashboard/review/domain-buy/[id]/preview` | `preview/page.tsx` | Purchase candidate preview |
| `/dashboard/review/campaign-launch` | `campaign-launch/page.tsx` | Campaign launch review |
| `/dashboard/compliance` | `compliance/page.tsx` | Compliance dashboard |
| `/dashboard/integrations` | `integrations/page.tsx` | Integration connections |
| `/dashboard/monitoring` | `monitoring/page.tsx` | System monitoring |
| `/dashboard/workflow` | `workflow/page.tsx` | Workflow management |
| `/dashboard/site-builder` | `site-builder/page.tsx` | Visual site builder |
| `/dashboard/settings` | `settings/page.tsx` | General settings |
| `/dashboard/settings/users` | `users/page.tsx` | User management |
| `/dashboard/settings/qa-templates` | `qa-templates/page.tsx` | QA checklist templates |
| `/dashboard/settings/review-policies` | `review-policies/page.tsx` | Review policy config |
| `/dashboard/settings/operations` | `operations/page.tsx` | Operations settings |

---

## 8. EXISTING API ROUTES

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/login` | POST | User authentication |
| `/api/health` | GET | Health check |
| `/api/search` | GET | Global search |
| `/api/collect` | POST | Click/event collection |
| `/api/domains` | GET, POST | List/create domains |
| `/api/domains/[id]` | GET, PATCH, DELETE | Domain CRUD |
| `/api/domains/[id]/deploy` | POST | Trigger deploy |
| `/api/domains/[id]/staging-deploy` | POST | Trigger staging deploy |
| `/api/domains/[id]/seed` | POST | Seed articles for domain |
| `/api/domains/[id]/preview` | GET | Preview domain site |
| `/api/domains/[id]/cloudflare-zone` | GET, POST | Cloudflare zone management |
| `/api/domains/[id]/nameservers` | GET, POST | Nameserver management |
| `/api/domains/[id]/nameservers/status` | GET | NS propagation status |
| `/api/domains/[id]/ownership/sync` | POST | Sync ownership from registrar |
| `/api/domains/[id]/purchase` | POST | Domain purchase flow |
| `/api/domains/[id]/tags` | PATCH | Update domain tags |
| `/api/domains/[id]/disclosures` | GET, PATCH | Disclosure config |
| `/api/domains/import` | POST | Bulk domain import |
| `/api/domains/bulk-deploy` | POST | Bulk deployment |
| `/api/domains/bulk-seed` | POST | Bulk article seeding |
| `/api/domains/bulk-status` | PATCH | Bulk status update |
| `/api/domains/bulk-niche` | PATCH | Bulk niche assignment |
| `/api/domains/bulk-cloudflare-zones` | POST | Bulk CF zone setup |
| `/api/domains/bulk-nameservers` | POST | Bulk NS cutover |
| `/api/domains/lifecycle/sweep` | POST | Lifecycle monitoring sweep |
| `/api/domains/renewal-risk` | GET | Renewal risk report |
| `/api/articles` | GET, POST | List/create articles |
| `/api/articles/[id]` | GET, PATCH, DELETE | Article CRUD |
| `/api/articles/[id]/status` | PATCH | Update article status |
| `/api/articles/[id]/refine` | POST | AI refinement pass |
| `/api/articles/[id]/quality` | GET | Quality assessment |
| `/api/articles/[id]/qa` | GET, POST | QA checklist |
| `/api/articles/[id]/citations` | GET, POST | Citation management |
| `/api/articles/[id]/datasets` | GET, POST | Dataset linking |
| `/api/articles/[id]/revisions` | GET | Revision history |
| `/api/articles/[id]/ai-detection` | POST | Run AI detection check |
| `/api/articles/[id]/expert-signoff` | POST | Expert review signoff |
| `/api/articles/[id]/interlink/apply` | POST | Apply interlinking |
| `/api/articles/interlink/batch` | POST | Batch interlink processing |
| `/api/articles/suggest-titles` | POST | AI title suggestions |
| `/api/pages` | GET, POST | List/create page definitions |
| `/api/pages/[id]` | GET, PATCH, DELETE | Page definition CRUD |
| `/api/pages/[id]/status` | PATCH | Update page status |
| `/api/pages/[id]/preview` | GET | Preview page HTML |
| `/api/pages/[id]/generate` | POST | Generate block content via AI |
| `/api/pages/[id]/blocks/[blockId]/regenerate` | POST | Regenerate single block |
| `/api/pages/[id]/variants` | GET, POST | Page A/B variants |
| `/api/pages/seed` | POST | Seed page definitions |
| `/api/block-templates` | GET, POST | Block template library |
| `/api/queue/process` | POST | Trigger queue processing |
| `/api/queue/health` | GET | Queue health stats |
| `/api/queue/stream` | GET | SSE queue event stream |
| `/api/queue/retry` | POST | Retry failed jobs |
| `/api/queue/export` | GET | Export queue data |
| `/api/deploy/status` | GET | Deployment status |
| `/api/subscribers` | GET | List subscribers |
| `/api/ab-tests/[id]/assign` | POST | Assign A/B test variant |
| `/api/ab-tests/[id]/decision` | GET, POST | A/B test decision |
| `/api/ab-tests/[id]/decision/apply` | POST | Apply A/B winner |
| `/api/ab-tests/track` | POST | Track A/B test events |
| `/api/acquisition/candidates` | GET, POST | Acquisition candidates |
| `/api/acquisition/candidates/[id]/decision` | POST | Candidate decision |
| `/api/acquisition/candidates/bulk-decision` | POST | Bulk candidate decisions |
| `/api/analytics/backlinks` | GET | Backlink analytics |
| `/api/competitors` | GET, POST | Competitor management |
| `/api/datasets/[id]/refresh` | POST | Refresh dataset |
| `/api/expenses` | GET, POST | Expense tracking |
| `/api/finance/ledger` | GET, POST | Finance ledger |
| `/api/finance/monthly-close` | POST | Monthly P&L close |
| `/api/growth/campaigns` | GET, POST | Growth campaigns |
| `/api/growth/campaigns/[id]/launch` | POST | Launch campaign |
| `/api/growth/campaigns/auto-plan` | POST | Auto-plan campaigns |
| `/api/growth/launch-freeze/override` | POST | Override launch freeze |
| `/api/growth/media-assets` | GET | Media asset listing |
| `/api/growth/media-assets/upload` | POST | Upload media asset |
| `/api/growth/media-review/tasks/[id]/decision` | POST | Media review decision |
| `/api/growth/seo-observability/summary` | GET | SEO observability |
| `/api/integrations/connections` | GET, POST | Integration connections |
| `/api/integrations/connections/[id]/sync` | POST | Trigger sync |
| `/api/integrations/sync-runs` | GET | Sync run history |
| `/api/integrations/sync-runs/[id]` | GET | Sync run detail |
| `/api/integrations/cloudflare-shards/health` | GET | CF shard health |
| `/api/integrations/revenue/ingest` | POST | Revenue data ingest |
| `/api/monetization/affiliates` | GET, POST | Affiliate management |
| `/api/qa-templates` | GET, POST | QA templates |
| `/api/research/domains` | GET, POST | Domain research |
| `/api/research/domains/compare` | POST | Domain comparison |
| `/api/research/suggest` | POST | Research suggestions |
| `/api/review/tasks` | GET | Review task queue |
| `/api/review/tasks/[id]/decision` | POST | Review task decision |
| `/api/review/policies` | GET, POST | Review policies |
| `/api/users` | GET, POST | User management |
| `/api/users/[id]` | GET, PATCH, DELETE | User CRUD |

**NOTE:** `/api/domains/[id]/page.tsx` and `/api/domains/[id]/edit/DomainEditForm.tsx` exist — these appear to be misplaced page components inside the API directory. This is likely a Next.js route group issue or intentional for the domain detail API page.

---

## 9. EXISTING DOMAIN DATA

**Cannot query the database directly** — no DB credentials available in this read-only audit.

No seed files found. The project uses Drizzle migrations (42 migration files in `drizzle/`). Data would need to be queried via:

```sql
-- Domain count
SELECT COUNT(*) FROM domains WHERE deleted_at IS NULL;

-- Domains with pageDefinitions
SELECT COUNT(DISTINCT domain_id) FROM page_definitions;

-- Deployed domains
SELECT COUNT(*) FROM domains WHERE is_deployed = true AND deleted_at IS NULL;

-- Lifecycle state distribution
SELECT lifecycle_state, COUNT(*) FROM domains WHERE deleted_at IS NULL GROUP BY lifecycle_state;

-- Domains with contentConfig
SELECT COUNT(*) FROM domains WHERE content_config IS NOT NULL AND content_config != '{}' AND deleted_at IS NULL;

-- Wave field check
-- No 'wave' column exists on the domains table.

-- Niche distribution
SELECT niche, COUNT(*) FROM domains WHERE deleted_at IS NULL AND niche IS NOT NULL GROUP BY niche;
```

**Key findings from schema analysis:**
- There is **no `wave` field** on the domains table
- There is **no `cluster` field** on the domains table
- Niche assignment uses `niche` (text) and `subNiche` (text)
- Vertical assignment uses `vertical` (text)

---

## 10. GAPS AND ISSUES FOUND

### 10.1 TODO/FIXME/HACK Comments

**No TODO, FIXME, or HACK comments found** in any TypeScript files across the codebase.

### 10.2 Misplaced Files

- `src/app/api/domains/[id]/page.tsx` — A React page component inside an API route directory
- `src/app/api/domains/[id]/edit/DomainEditForm.tsx` — A React component inside an API route directory

These appear to be Next.js pages that render at `/api/domains/[id]` but would typically belong under `/dashboard/`.

### 10.3 Image Generation

**File:** `src/lib/deploy/image-gen.ts`

Exports:
- `generateOgImage(opts: OgImageOptions): string` — SVG social card (1200×630)
- `generateHeroImage(opts: HeroImageOptions): string` — SVG hero background
- `generateArticleImage(opts: ArticleImageOptions): string` — SVG article banner
- `generateSiteImages(opts: GenerateImagesOpts): PageImageSet[]` — Full image set for a deploy
- `getOgImagePath(route: string): string` — Path helper
- `getFeaturedImagePath(route: string): string` — Path helper

All output is pure SVG (no raster dependencies). The generator also supports AI-generated raster images via Gemini through OpenRouter (configured in `src/lib/ai/openrouter.ts` as `imageGenFast` and `imageGenQuality` tasks), but these are optional enhancements. The SVG pipeline is the primary/fallback path.

Imported by `src/lib/deploy/generator.ts` during site generation.

### 10.4 Form/Submission Handling

The `formSubmissions` table exists (schema.ts:2669) for capturing form data from deployed sites. The `subscribers` table handles email captures. The `/api/collect` route handles click tracking. There is a `LeadForm` block type that generates forms on deployed sites with a configurable `endpoint`.

### 10.5 Potential Issues

1. **`pageDefinitions.status` is free text** — No enum constraint in schema. Could lead to inconsistent status values across the codebase.

2. **Large worker file** — `worker.ts` is 3,907 lines with inline job handlers for acquisition, growth, and other pipelines. Could benefit from extraction into separate modules.

3. **v1 vs v2 dual paths** — The generator supports both v1 template-based and v2 block-based generation. The v1 path is legacy but still active, creating maintenance burden.

4. **Missing env var documentation** — Several env vars are referenced in code but not in `.env.example`:
   - `OPENROUTER_MODEL_FAST`, `OPENROUTER_MODEL_SEO`, `OPENROUTER_MODEL_QUALITY`, `OPENROUTER_MODEL_RESEARCH`, `OPENROUTER_MODEL_VISION`, `OPENROUTER_MODEL_IMAGE_GEN_FAST`, `OPENROUTER_MODEL_IMAGE_GEN_QUALITY`, `OPENROUTER_MODEL_FALLBACK`
   - `WORKER_BATCH_SIZE`
   - `GROWTH_CHANNEL_COOLDOWN_HOURS`, `GROWTH_DEFAULT_DAILY_CAP`, `GROWTH_DEFAULT_MIN_JITTER_MINUTES`, `GROWTH_DEFAULT_MAX_JITTER_MINUTES`
   - `GROWTH_DEFAULT_QUIET_HOURS_START`, `GROWTH_DEFAULT_QUIET_HOURS_END`
   - `MEDIA_REVIEW_ESCALATION_SWEEP_USER_LIMIT`

5. **Circuit breaker and retry** — Imported from `@/lib/tpilot/core/` but these files were not found in the standard search paths. They may be in a subdirectory not fully indexed.

6. **Several imported modules not verified** — The worker imports from paths like `@/lib/content/refresh`, `@/lib/compliance/metrics`, `@/lib/monitoring/triggers`, `@/lib/growth/publishers`, `@/lib/growth/policy`, `@/lib/growth/media-review-escalation`, `@/lib/growth/media-retention`, `@/lib/finance/reconciliation-monitor`, `@/lib/data/contracts-monitor`, `@/lib/growth/capital-allocation-monitor`, `@/lib/competitors/refresh-sweep`, `@/lib/domain/strategy-propagation-monitor`, `@/lib/review/campaign-launch-sla`, `@/lib/growth/integrity`, `@/lib/queue/content-queue`, `@/lib/security/encryption`. These files exist (the project builds) but were not individually verified in this audit.

---

## 11. DEPENDENCY VERSIONS

From `package.json`:

### Core Framework
| Package | Version |
|---------|---------|
| next | 16.1.6 |
| react | 19.2.3 |
| react-dom | 19.2.3 |
| typescript | ^5 |

### Database
| Package | Version |
|---------|---------|
| drizzle-orm | ^0.45.1 |
| drizzle-kit | ^0.31.9 (dev) |
| postgres | ^3.4.8 |

### AI SDKs
| Package | Version |
|---------|---------|
| (none — uses OpenRouter REST API directly) | — |

### Cloudflare SDKs
| Package | Version |
|---------|---------|
| (none — uses Cloudflare REST API directly) | — |

### UI Libraries
| Package | Version |
|---------|---------|
| @radix-ui/react-dialog | ^1.1.15 |
| @radix-ui/react-dropdown-menu | ^2.1.16 |
| @radix-ui/react-popover | ^1.1.15 |
| @radix-ui/react-scroll-area | ^1.2.10 |
| @radix-ui/react-select | ^2.2.6 |
| @radix-ui/react-separator | ^1.1.8 |
| @radix-ui/react-slot | ^1.2.4 |
| @radix-ui/react-tabs | ^1.1.13 |
| @radix-ui/react-tooltip | ^1.2.8 |
| radix-ui | ^1.4.3 |
| shadcn | ^3.8.4 (dev) |
| lucide-react | ^0.563.0 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.4.0 |
| tailwindcss | ^4 (dev) |
| tw-animate-css | ^1.4.0 (dev) |

### Other Notable
| Package | Version |
|---------|---------|
| zod | ^4.3.6 |
| @tanstack/react-table | ^8.21.3 |
| react-hook-form | ^7.71.1 |
| @hookform/resolvers | ^5.2.2 |
| recharts | ^3.7.0 |
| date-fns | ^4.1.0 |
| marked | ^17.0.1 |
| sanitize-html | ^2.17.0 |
| sonner | ^2.0.7 |
| uuid | ^13.0.0 |
| exceljs | ^4.4.0 |
| googleapis | ^171.4.0 |
| nodemailer | ^8.0.1 |
| next-themes | ^0.4.6 |
| @upstash/ratelimit | ^2.0.8 |
| @upstash/redis | ^1.36.2 |
| vitest | ^4.0.18 (dev) |

---

## 12. FILE TREE

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── api/
│   │   ├── ab-tests/[id]/assign/route.ts
│   │   ├── ab-tests/[id]/decision/apply/route.ts
│   │   ├── ab-tests/[id]/decision/route.ts
│   │   ├── ab-tests/track/route.ts
│   │   ├── acquisition/candidates/[id]/decision/route.ts
│   │   ├── acquisition/candidates/bulk-decision/route.ts
│   │   ├── acquisition/candidates/route.ts
│   │   ├── analytics/backlinks/route.ts
│   │   ├── articles/[id]/ai-detection/route.ts
│   │   ├── articles/[id]/citations/route.ts
│   │   ├── articles/[id]/datasets/route.ts
│   │   ├── articles/[id]/expert-signoff/route.ts
│   │   ├── articles/[id]/interlink/apply/route.ts
│   │   ├── articles/[id]/qa/route.ts
│   │   ├── articles/[id]/quality/route.ts
│   │   ├── articles/[id]/refine/route.ts
│   │   ├── articles/[id]/revisions/route.ts
│   │   ├── articles/[id]/route.ts
│   │   ├── articles/[id]/status/route.ts
│   │   ├── articles/interlink/batch/route.ts
│   │   ├── articles/route.ts
│   │   ├── articles/suggest-titles/route.ts
│   │   ├── auth/login/route.ts
│   │   ├── block-templates/route.ts
│   │   ├── collect/route.ts
│   │   ├── competitors/route.ts
│   │   ├── datasets/[id]/refresh/route.ts
│   │   ├── deploy/status/route.ts
│   │   ├── domains/[id]/cloudflare-zone/route.ts
│   │   ├── domains/[id]/deploy/route.ts
│   │   ├── domains/[id]/disclosures/route.ts
│   │   ├── domains/[id]/edit/DomainEditForm.tsx
│   │   ├── domains/[id]/nameservers/route.ts
│   │   ├── domains/[id]/nameservers/status/route.ts
│   │   ├── domains/[id]/ownership/sync/route.ts
│   │   ├── domains/[id]/page.tsx
│   │   ├── domains/[id]/preview/route.ts
│   │   ├── domains/[id]/purchase/route.ts
│   │   ├── domains/[id]/route.ts
│   │   ├── domains/[id]/seed/route.ts
│   │   ├── domains/[id]/staging-deploy/route.ts
│   │   ├── domains/[id]/tags/route.ts
│   │   ├── domains/bulk-cloudflare-zones/route.ts
│   │   ├── domains/bulk-deploy/route.ts
│   │   ├── domains/bulk-nameservers/route.ts
│   │   ├── domains/bulk-niche/route.ts
│   │   ├── domains/bulk-seed/route.ts
│   │   ├── domains/bulk-status/route.ts
│   │   ├── domains/import/route.ts
│   │   ├── domains/lifecycle/sweep/route.ts
│   │   ├── domains/renewal-risk/route.ts
│   │   ├── domains/route.ts
│   │   ├── expenses/route.ts
│   │   ├── finance/ledger/route.ts
│   │   ├── finance/monthly-close/route.ts
│   │   ├── growth/campaigns/[id]/launch/route.ts
│   │   ├── growth/campaigns/auto-plan/route.ts
│   │   ├── growth/campaigns/route.ts
│   │   ├── growth/launch-freeze/override/route.ts
│   │   ├── growth/media-assets/route.ts
│   │   ├── growth/media-assets/upload/route.ts
│   │   ├── growth/media-review/tasks/[id]/decision/route.ts
│   │   ├── growth/seo-observability/summary/route.ts
│   │   ├── health/route.ts
│   │   ├── integrations/cloudflare-shards/health/route.ts
│   │   ├── integrations/connections/[id]/sync/route.ts
│   │   ├── integrations/connections/route.ts
│   │   ├── integrations/revenue/ingest/route.ts
│   │   ├── integrations/sync-runs/[id]/route.ts
│   │   ├── integrations/sync-runs/route.ts
│   │   ├── monetization/affiliates/route.ts
│   │   ├── pages/[id]/blocks/[blockId]/regenerate/route.ts
│   │   ├── pages/[id]/generate/route.ts
│   │   ├── pages/[id]/preview/route.ts
│   │   ├── pages/[id]/route.ts
│   │   ├── pages/[id]/status/route.ts
│   │   ├── pages/[id]/variants/route.ts
│   │   ├── pages/route.ts
│   │   ├── pages/seed/route.ts
│   │   ├── qa-templates/route.ts
│   │   ├── queue/export/route.ts
│   │   ├── queue/health/route.ts
│   │   ├── queue/process/route.ts
│   │   ├── queue/retry/route.ts
│   │   ├── queue/stream/route.ts
│   │   ├── research/domains/compare/route.ts
│   │   ├── research/domains/route.ts
│   │   ├── research/suggest/route.ts
│   │   ├── review/policies/route.ts
│   │   ├── review/tasks/[id]/decision/route.ts
│   │   ├── review/tasks/route.ts
│   │   ├── search/route.ts
│   │   ├── subscribers/route.ts
│   │   ├── users/[id]/route.ts
│   │   └── users/route.ts
│   ├── dashboard/
│   │   ├── acquisition/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── competitors/page.tsx
│   │   ├── compliance/page.tsx
│   │   ├── content/
│   │   │   ├── articles/[id]/audit/page.tsx
│   │   │   ├── articles/[id]/citations/page.tsx
│   │   │   ├── articles/[id]/page.tsx
│   │   │   ├── articles/[id]/revisions/page.tsx
│   │   │   ├── articles/[id]/review/page.tsx
│   │   │   ├── articles/[id]/visual-review/page.tsx
│   │   │   ├── articles/page.tsx
│   │   │   ├── calendar/page.tsx
│   │   │   ├── duplicates/page.tsx
│   │   │   ├── freshness/page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── page.tsx
│   │   ├── deploy/page.tsx
│   │   ├── domains/
│   │   │   ├── [id]/disclosures/page.tsx
│   │   │   ├── [id]/monetization/page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   ├── [id]/pages/DomainPagesClient.tsx
│   │   │   ├── [id]/pages/page.tsx
│   │   │   ├── [id]/preview/page.tsx
│   │   │   ├── import/page.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── page.tsx
│   │   ├── error.tsx
│   │   ├── finances/page.tsx
│   │   ├── integrations/page.tsx
│   │   ├── keywords/page.tsx
│   │   ├── kpis/page.tsx
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── monitoring/page.tsx
│   │   ├── page.tsx
│   │   ├── queue/page.tsx
│   │   ├── research/page.tsx
│   │   ├── revenue/page.tsx
│   │   ├── review/
│   │   │   ├── campaign-launch/page.tsx
│   │   │   ├── domain-buy/[id]/preview/page.tsx
│   │   │   ├── domain-buy/page.tsx
│   │   │   ├── loading.tsx
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   ├── operations/page.tsx
│   │   │   ├── page.tsx
│   │   │   ├── qa-templates/page.tsx
│   │   │   ├── review-policies/page.tsx
│   │   │   └── users/page.tsx
│   │   ├── site-builder/page.tsx
│   │   ├── subscribers/page.tsx
│   │   └── workflow/page.tsx
│   ├── globals.css
│   ├── global-error.tsx
│   └── layout.tsx
├── components/
│   ├── content/InterlinkManager.tsx
│   ├── dashboard/ (30+ components)
│   ├── monetization/ (3 components)
│   ├── theme-provider.tsx
│   └── ui/tooltip.tsx
├── lib/
│   ├── ab-testing/
│   │   ├── assignment.ts
│   │   └── index.ts
│   ├── ai/
│   │   ├── ai-detection.ts
│   │   ├── block-pipeline.ts
│   │   ├── block-prompts.ts
│   │   ├── classify-domain.ts
│   │   ├── domain-knowledge.ts
│   │   ├── image-generator.ts
│   │   ├── openrouter.ts
│   │   ├── pipeline.ts
│   │   ├── prompts.ts
│   │   ├── scheduler.ts
│   │   ├── worker-bootstrap.ts
│   │   ├── worker-config.ts
│   │   └── worker.ts
│   ├── alerts/fairness-incidents.ts
│   ├── analytics/cloudflare.ts
│   ├── api-fetch.ts
│   ├── audit/events.ts
│   ├── auth/index.ts
│   ├── datasets/index.ts
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── deploy/
│   │   ├── allowed-parent-origin.ts
│   │   ├── blocks/ (10 files)
│   │   ├── cloudflare.ts
│   │   ├── configurator-bridge.ts
│   │   ├── generator.ts
│   │   ├── godaddy.ts
│   │   ├── host-sharding.ts
│   │   ├── image-gen.ts
│   │   ├── layouts/layout-css.ts
│   │   ├── namecheap.ts
│   │   ├── preflight.ts
│   │   ├── processor.ts
│   │   ├── registrar.ts
│   │   ├── site-randomizer.ts
│   │   ├── templates/shared.ts
│   │   ├── themes/ (10 files)
│   │   └── visual-identity.ts
│   ├── domain/
│   │   ├── lifecycle-monitor.ts
│   │   ├── lifecycle-playbooks.ts
│   │   ├── lifecycle-sync.ts
│   │   ├── nameserver-status.ts
│   │   ├── registrar-operations.ts
│   │   ├── renewals.ts
│   │   └── roi-priority-service.ts
│   ├── domains/index.ts
│   ├── evaluation/
│   │   ├── evaluator.ts
│   │   └── niche-data.ts
│   ├── feature-flags.ts
│   ├── format-utils.ts
│   ├── growth/
│   │   ├── channel-credentials.ts
│   │   ├── launch-freeze.ts
│   │   └── seo-observability.ts
│   ├── health/sweep.ts
│   ├── hooks/use-queue-stream.ts
│   ├── integrations/
│   │   ├── cloudflare-shard-saturation.ts
│   │   ├── executor.ts
│   │   └── health-monitor.ts
│   ├── notifications/
│   │   ├── email.ts
│   │   └── index.ts
│   ├── privacy/prompt-redaction.ts
│   ├── rate-limit.ts
│   ├── review/
│   │   ├── content-quality.ts
│   │   └── task-decision.ts
│   ├── search.ts
│   ├── settings/operations.ts
│   ├── site-randomizer.ts
│   ├── subscribers/
│   │   ├── index.ts
│   │   └── privacy.ts
│   └── tpilot/core/failure-categorizer.ts
├── middleware.ts
├── scripts/
│   ├── regenerate-all-sites.ts
│   ├── trigger-test-job.ts
│   └── worker.ts
├── __tests__/ (40+ test files)
└── docs/
    └── CODEBASE_AUDIT.md (this file)
```

Also at project root:
```
scripts/
├── list-domains.ts
├── migrate-to-blocks.ts
├── sync-spreadsheet.ts
└── visual-diff.ts
drizzle/
├── 0000-0042 SQL migrations
└── meta/ (snapshots + journal)
docs/
├── ops/domain-lifecycle-alert-playbooks.md
├── ops/seo-observability-playbooks.md
├── phased-implementation-plan.md
├── visual-configurator-plan.md
└── v2-block-system-plan.md
```
