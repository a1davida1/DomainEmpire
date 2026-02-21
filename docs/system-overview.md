# DomainEmpire — System Overview

## Database Schema (key tables)

### `domains`
The foundation. Every domain in the portfolio.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `domain` | text | e.g. "myhomevalue.io" |
| `tld` | text | e.g. "io" |
| `registrar` | text | "godaddy", "namecheap", etc. |
| `status` | enum | parked, active, redirect, forsale, defensive |
| `lifecycleState` | enum | sourced → underwriting → approved → acquired → build → growth → monetized → hold → sell → sunset |
| `bucket` | enum | build, redirect, park, defensive |
| `niche` | text | e.g. "real estate" |
| `subNiche` | text | e.g. "Home Value" |
| `vertical` | text | e.g. "Real Estate", "Legal", "Finance" |
| `cluster` | text | Grouping key for theme diversity |
| `siteTemplate` | enum | authority, comparison, calculator, review, tool, hub, decision, cost_guide, niche, info, consumer, brand, magazine, landing, local_lead_gen, docs, storefront, minimal, dashboard, newsletter, community |
| `themeStyle` | text | v1 theme name (legacy) |
| `skin` | text | v2 color skin: slate, ocean, forest, ember, midnight, coral, sage, rose, indigo, sand, teal, wine, plum, steel, cobalt, copper, arctic, charcoal, dusk |
| `cloudflareProject` | text | CF Pages project name |
| `isDeployed` | boolean | Whether site is live |
| `lastDeployedAt` | timestamp | Last successful deploy |
| `siteNameOverride` | text | Manual override for auto-generated site title |
| `contentConfig` | jsonb | Voice seed, schedule, branding overrides, etc. |

### `pageDefinitions` (v2 block system)
Each row is a page (route) with a sequence of blocks.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `domainId` | uuid | FK → domains |
| `route` | text | e.g. "/", "/about", "/calculator" |
| `title` | text | Page title |
| `metaDescription` | text | SEO meta |
| `theme` | text | v2 theme name (clean, editorial, bold, etc.) |
| `skin` | text | v2 skin name |
| `blocks` | jsonb | Array of BlockEnvelope objects |
| `isPublished` | boolean | Only published pages get deployed |
| `status` | enum | draft, review, approved, published, archived |

### `articles`
Content pieces linked to domains. Used by v1 path or as supplementary content.

| Column | Type | Notes |
|--------|------|-------|
| `domainId` | uuid | FK → domains |
| `title`, `slug` | text | URL: `/{slug}/index.html` |
| `contentMarkdown` | text | Source content |
| `contentHtml` | text | Rendered HTML |
| `status` | enum | generating, draft, review, approved, published, archived |
| `contentType` | enum | article, comparison, calculator, cost_guide, lead_capture, health_decision, checklist, faq, review, wizard, configurator, quiz, survey, assessment, interactive_infographic, interactive_map, guide |

### `contentQueue`
Async job processing for AI generation & deployment.

| Column | Type | Notes |
|--------|------|-------|
| `jobType` | enum | generate_outline, generate_draft, humanize, seo_optimize, deploy, bulk_seed, research, evaluate, ... |
| `domainId` | uuid | FK → domains |
| `status` | enum | pending, processing, completed, failed, cancelled |
| `payload` | jsonb | Job-specific data |
| `result` | jsonb | Job output (deploy steps, etc.) |

A partial unique index (`content_queue_deploy_once_uidx`) prevents duplicate pending/processing deploy jobs per domain.

---

## Deploy Pipeline

### Two entry points:

1. **Single domain**: `POST /api/domains/[id]/prepare` → `POST /api/domains/[id]/deploy`
2. **Batch**: `POST /api/domains/batch-prepare-deploy` (up to 50 domains, parallel batches of 5)

### Step 1: `prepareDomain()` (src/lib/deploy/prepare-domain.ts)

The 8-step preparation pipeline that takes a domain from raw DB record to deploy-ready:

1. **Update strategy fields** — Apply niche, vertical, siteTemplate, cluster, wave overrides to the domain record
2. **Assign theme + skin** — `assignThemeSkin()` uses deterministic hash of domain name + cluster for max visual diversity. Fisher-Yates shuffle seeded by cluster name, round-robin assignment.
3. **Seed/regenerate pages** — If no pages exist (or strategy was explicitly overridden), generates homepage + sub-pages using `generateBlueprint()` for structural variety. Each page is a `pageDefinitions` row with a block sequence. Uses `generateSubPagesFromBlueprint()` for sub-pages.
4. **Programmatic fixes** — Fix siteName across all blocks, strip dead internal links, fix lead form endpoints, remove duplicate routes (e.g. /privacy vs /privacy-policy), inject real citations
5. **AI enrichment** — Hero headlines, calculator inputs, FAQ answers, meta descriptions via OpenRouter API calls
6. **Content scanning** — Banned word detection + burstiness scoring + AI rewrite of flagged blocks
7. **Site review + auto-remediation** — AI rubric scoring of the whole site; if rejected, auto-remediate and re-review
8. **Validate** — Final readiness check (page count, block count, issues)

Returns `PrepareResult` with `{ ready: boolean, theme, skin, pageCount, validation, ... }`

### Step 2: `processDeployJob()` (src/lib/deploy/processor.ts)

The 7-step deployment pipeline (runs as a queued job in `contentQueue`):

1. **Generate files** — `generateSiteFiles()` checks for published `pageDefinitions`:
   - **v2 path** (if pages exist): Uses block assembler to render each page → full HTML
   - **v1 path** (fallback): Uses articles with template-based rendering
   - Also generates: styles.css, 404.html, robots.txt, sitemap.xml, favicon.svg, _headers, IndexNow key
   - AI images attempted first (Gemini via OpenRouter), SVG fallback on failure
2. **Upload to Cloudflare Pages** — Direct Upload API (no GitHub dependency). Supports host shard failover across multiple CF accounts.
3. **Add custom domain** — Links domain to CF Pages project
4. **Configure DNS record** — Creates/updates CNAME in Cloudflare zone pointing to Pages project
5. **Update nameservers** — Pushes NS records to registrar (GoDaddy/Namecheap) via their API
6. **Verify DNS** — Live check that NS records point to Cloudflare
7. **Ping search engines** — Bing sitemap ping + IndexNow submission

---

## v2 Block System

### Block Types
Header, Hero, ArticleBody, FAQ, ComparisonTable, QuoteCalculator, CostBreakdown, LeadForm, StatGrid, CTABanner, CitationBlock, Footer, RankingList, ProsConsCard, TrustBadges, TestimonialGrid, PricingTable, Wizard, Checklist, InteractiveMap, DataTable, LastUpdated, AuthorBio, MedicalDisclaimer, Sidebar

### BlockEnvelope structure
```json
{
  "id": "blk_abc123...",
  "type": "Hero",
  "variant": "centered",
  "content": { "headline": "...", "subheadline": "..." },
  "config": { "sticky": true }
}
```

### Homepage Presets (src/lib/deploy/blocks/presets.ts)
Each `siteTemplate` maps to a default block sequence. Examples:
- **authority**: Header → Hero → ArticleBody → FAQ → CitationBlock → CTABanner → Footer
- **calculator**: Header → Hero → QuoteCalculator → ArticleBody → FAQ → CitationBlock → Footer
- **comparison**: Header → Hero → ComparisonTable → FAQ → CTABanner → CitationBlock → Footer

### Structural Blueprint (src/lib/deploy/structural-blueprint.ts)
`generateBlueprint()` produces a structurally differentiated layout for each domain based on domain name hash + niche. Controls: header style, hero structure, homepage section order, footer structure, CTA style, navigation items. This ensures no two sites look identical even with the same template.

---

## Theme + Skin System

### Themes (13)
`clean`, `editorial`, `bold`, `minimal`, `magazine`, `brutalist`, `glass`, `retro`, `corporate`, `craft`, `academic`, `startup`, `noir`

Each theme defines: font families, font sizes, spacing, border-radius, layout rhythm.

### Skins (19)
`slate`, `ocean`, `forest`, `ember`, `midnight`, `coral`, `sage`, `rose`, `indigo`, `sand`, `teal`, `wine`, `plum`, `steel`, `cobalt`, `copper`, `arctic`, `charcoal`, `dusk`

Each skin defines: color palette (primary, secondary, accent, background, text, surface, muted, border, etc.) via CSS custom properties.

### CSS Generation (src/lib/deploy/themes/index.ts)
`generateV2GlobalStyles()` composes layers:
1. Theme tokens (fonts, spacing)
2. Skin tokens (colors)
3. Per-domain hue shift
4. Typography preset
5. Theme modifiers
6. Base styles
7. Layout styles
8. Component styles
9. Block variant styles
10. Domain variant styles
11. Section dividers
12. Dark mode
13. Responsive styles

All randomized per-domain via `randomizeCSS()` to prevent fingerprinting.

### Theme Assignment (src/lib/deploy/theme-assigner.ts)
`assignThemeSkin()` — deterministic assignment ensuring max diversity within a cluster:
- All 13×19 = 247 theme+skin combos are permuted using a seeded Fisher-Yates shuffle (seed = MD5 of cluster name)
- Domains in the cluster are sorted lexicographically
- Round-robin through the permutation

---

## API Routes (key ones)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `POST /api/domains/[id]/prepare` | POST | admin | Run 8-step prepare pipeline |
| `POST /api/domains/[id]/deploy` | POST | admin | Queue deploy job (7 steps) |
| `GET /api/domains/[id]/deploy` | GET | any | Get deploy status |
| `POST /api/domains/batch-prepare-deploy` | POST | admin | Batch prepare + deploy (up to 50) |
| `POST /api/auth/login` | POST | none | Login (auto-seeds admin from ADMIN_PASSWORD on first use) |

### Deploy route payload
```json
{
  "triggerBuild": true,
  "addCustomDomain": true
}
```

### Batch route payload
```json
{
  "domainIds": ["uuid1", "uuid2"],
  "strategy": {
    "niche": "real estate",
    "siteTemplate": "authority",
    "vertical": "Real Estate"
  },
  "skipDeploy": false
}
```

---

## Environment Variables (required)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_EMAIL` | Default admin email for seeding |
| `ADMIN_PASSWORD` | Admin password (seeds on first login) |
| `OPENROUTER_API_KEY` | AI content generation (Grok, Claude, etc.) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account (optional if auto-detected) |
| `GODADDY_API_KEY` + `GODADDY_API_SECRET` | GoDaddy DNS updates |
| `NAMECHEAP_API_USER` + `NAMECHEAP_API_KEY` + `NAMECHEAP_CLIENT_IP` | Namecheap DNS updates |
| `GPTZERO_API_KEY` | AI detection scoring |
| `ENABLE_AI_IMAGES` | Enable Gemini-based image generation |

---

## Worker System

The background worker (`src/lib/ai/worker.ts`) polls `contentQueue` for pending jobs and processes them. Job types include:
- Content pipeline: generate_outline → generate_draft → humanize → seo_optimize → generate_meta
- Deploy: deploy (processed by `processDeployJob()`)
- Research: research, evaluate, keyword_research
- Growth: create_promotion_plan, publish_pinterest_pin, etc.

Supports bounded concurrency, per-job-type limits, abort signals, and circuit breaker patterns.

On Windows dev, the worker doesn't auto-start (npm dev script uses bash). Jobs must be processed via the queue dashboard at `/dashboard/queue` or by running the worker manually.
