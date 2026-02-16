# Template System v2: Composable Block Architecture

## Status: IMPLEMENTED — All 3 phases complete

---

## Executive Summary

Replace the current monolithic template system with a composable block architecture.
Pages become ordered sequences of independent, typed blocks with a separated theme/skin
CSS variable system. The AI content pipeline becomes block-aware, generating typed content
per block instead of markdown blobs. No visual editor — automation-first.

**Estimated effort:** 8–12 pair-programming sessions across Phases 1–3.

---

## What Exists Today (v1)

### Current Architecture

```
Domain (DB)
  └─ siteTemplate: 'authority' | 'comparison' | 'calculator' | ... (20 options)
  └─ themeStyle: 'navy-serif' | 'green-modern' | ... (14 options)
  └─ articles[] (each has contentType: 'article' | 'calculator' | 'comparison' | ...)

generateSiteFiles(domainId)
  ├── resolves theme, layout, disclosure config
  ├── builds page shell (header, footer, sidebar)
  ├── generates index.html (hero + article listing)
  ├── for each article: dispatches to content-type template
  │     calculator.ts → full HTML page with calc form + JS
  │     comparison.ts → full HTML page with sortable table + JS
  │     faq.ts        → full HTML page with accordion
  │     cost-guide.ts → full HTML page with cost ranges + factors
  │     lead-capture.ts → full HTML page with form + AJAX
  │     wizard.ts     → full HTML page with multi-step flow + JS
  │     review.ts     → full HTML page with review cards
  │     checklist.ts  → full HTML page with checkbox items
  │     health-decision.ts → standard article + medical disclaimer
  │     interactive-infographic.ts → filterable data cards
  │     interactive-map.ts → state/region selector with data panels
  │     (+ embed, geo-content, scroll-cta, pdf-download)
  ├── generates styles.css (base + layout + components + theme + variants + responsive)
  ├── generates 404, robots.txt, sitemap.xml, favicon, _headers
  └── all files uploaded to Cloudflare Pages via Direct Upload
```

### Template System (16 files, ~3,500 lines)

| File | Lines | What it does |
|------|-------|-------------|
| `templates/shared.ts` | 532 | HTML shell, escape utils, trust elements, schema.org, OG tags |
| `templates/calculator.ts` | 306 | Calculator form + safe formula eval + methodology |
| `templates/wizard.ts` | 755 | Multi-step wizard/configurator/quiz/survey/assessment |
| `templates/comparison.ts` | 206 | Sortable comparison table + winner badges |
| `templates/lead-capture.ts` | 204 | Lead form + FTC disclosure + AJAX submit |
| `templates/cost-guide.ts` | 198 | Cost range bars + factor cards |
| `templates/review.ts` | 166 | Review cards with pros/cons/ratings |
| `templates/checklist.ts` | 158 | Checkbox steps with progress indicator |
| `templates/faq.ts` | 143 | Accordion Q&A + FAQPage JSON-LD |
| `templates/interactive-infographic.ts` | ~180 | Filterable data card grid |
| `templates/interactive-map.ts` | ~200 | State/region data explorer |
| `templates/health-decision.ts` | 70 | Article + medical disclaimer |
| `templates/geo-content.ts` | ~60 | Geo-adaptive content blocks |
| `templates/scroll-cta.ts` | ~80 | Scroll-triggered CTA bar |
| `templates/embed.ts` | ~100 | Embeddable widget versions |
| `templates/pdf-download.ts` | ~60 | PDF download button |

### Theme System (6 files, ~600 lines)

| File | Lines | What it does |
|------|-------|-------------|
| `themes/base.ts` | 16 | CSS reset + basic typography |
| `themes/components.ts` | 214 | All component CSS (calc, comparison, FAQ, wizard, etc.) |
| `themes/theme-definitions.ts` | 57 | 14 theme CSS override strings |
| `themes/variants.ts` | 79 | Per-domain deterministic visual variance (CSS vars) |
| `themes/policy.ts` | 113 | Vertical/niche → theme auto-resolution |
| `themes/responsive.ts` | 55 | Tablet, mobile, print breakpoints |

### Layout System (3 files, ~420 lines)

| File | Lines | What it does |
|------|-------|-------------|
| `layouts/layout-definitions.ts` | 109 | 20 layout configs (grid, header, hero, listing, footer) |
| `layouts/layout-css.ts` | 302 | CSS generators for each layout dimension |
| `layouts/index.ts` | 8 | Barrel exports |

### Generator (1 file, 512 lines)

- `generator.ts` — Orchestrates everything. Loads domain + articles from DB, resolves theme/layout, builds page shell, dispatches to templates, generates all output files.

---

## v1 Limitations

### 1. Pages are template-locked
A domain picks one `siteTemplate` (e.g., 'comparison'). The homepage gets that layout.
Each article picks a `contentType` and gets that template. You cannot mix a comparison
table AND a calculator AND a FAQ on the same page. They're separate pages with
separate templates.

### 2. No page composition
There's no concept of "this page has blocks A, B, C in this order." The page structure
is hardcoded per template. If you want a hero + comparison table + FAQ + CTA on one
page, you'd need to create a new monolithic template that combines all four.

### 3. Themes are CSS string blobs
Each theme is a single CSS string that overrides base styles:
```ts
'green-modern': `body{font-family:Inter,system-ui,sans-serif;background-color:#f0fdf4;color:#14532d}.logo{color:#15803d}a{color:#16a34a}`
```
No CSS custom properties. No separation of structural tokens (spacing, radius, shadows)
from color tokens. Changing one color means editing a minified CSS string.

### 4. AI generates markdown blobs
The content pipeline generates a markdown article. The template then tries to parse
structured data out of it (e.g., extracting FAQ items by splitting on H2 headings,
extracting cost ranges by regex-matching dollar amounts). This is fragile and lossy.

### 5. No cross-page shared blocks
Header, footer, and sidebar are built by `buildPageShell()` in generator.ts. There's no
way to add a "Trust Badges" section or "Newsletter Signup" block to specific pages
without editing the shell code.

### 6. 78 domains × 20 layouts = visual sameness
The variant system (`variants.ts`) adds per-domain deterministic differences (radius,
shadows, spacing), which helps. But the structural layout and color palette options are
limited, and domains in the same vertical tend to look very similar.

---

## v2: What Changes

### Core Concept: Pages are block sequences

```
v1: domain → siteTemplate → hardcoded page structure
v2: domain → page definition → [Block, Block, Block, ...] → rendered HTML
```

A page definition is a JSON array of blocks stored in the database:

```json
{
  "route": "/",
  "theme": "clean",
  "skin": "ocean",
  "blocks": [
    { "id": "blk_001", "type": "Header", "variant": "topbar", "config": { "sticky": true } },
    { "id": "blk_002", "type": "Hero", "variant": "split", "content": { "heading": "...", "subheading": "..." } },
    { "id": "blk_003", "type": "ComparisonTable", "variant": "cards", "content": { "items": [...] } },
    { "id": "blk_004", "type": "FAQ", "content": { "items": [...] } },
    { "id": "blk_005", "type": "CTABanner", "content": { "headline": "...", "buttonText": "..." } },
    { "id": "blk_006", "type": "Footer", "variant": "newsletter" }
  ]
}
```

### Improvement Matrix

| Dimension | v1 | v2 | Improvement |
|-----------|----|----|-------------|
| **Page flexibility** | 1 template per page, locked | Mix any blocks on any page | **10×** — unlocks entirely new page types |
| **Theme control** | 14 CSS string blobs | 4 themes × 6+ skins = 24+ combos via CSS vars | **~2×** more looks, infinitely easier to customize |
| **Content generation** | AI → markdown blob → regex parse | AI → typed JSON per block schema | **5×** — eliminates parsing fragility, better output quality |
| **Block reuse** | Headers/footers shared; nothing else | Any block reusable across pages/domains | **3×** — fix once, propagate everywhere |
| **Per-domain uniqueness** | Variant system (radius/shadow tweaks) | Theme × skin × block variants × variant system | **4×** — dramatically more visual diversity |
| **New page types** | Write new monolithic template (200+ lines) | Compose from existing blocks (0 new code) | **∞** — combinatorial explosion of page types |
| **Deploy safety** | Direct to production | + Staging branch deploys on CF Pages | **2×** — catch issues before they're live |

### What stays the same
- Plain HTML output (no Astro, no React on generated sites)
- Cloudflare Pages Direct Upload deploy pipeline
- Existing 6-step deploy processor (generate → upload → custom domain → CNAME → NS → verify)
- Database: Drizzle ORM + PostgreSQL
- All existing interactive JS (calculator eval, wizard state machine, etc.) preserved

---

## Implementation Plan

### Phase 1: Block Foundation (Sessions 1–5)

#### 1.1 Block Schema Definitions
**New file:** `src/lib/deploy/blocks/schemas.ts`

Define Zod schemas + TypeScript interfaces for every block type. These schemas serve
three purposes:
1. Validate block content at save time
2. Type-check block renderers at build time  
3. Define what the AI pipeline needs to generate per block

**Block types (24):**

| Category | Blocks | Derived from |
|----------|--------|-------------|
| Layout | `Header`, `Footer`, `Sidebar` | Current `buildPageShell()` |
| Content | `ArticleBody`, `FAQ`, `StepByStep`, `AuthorBio`, `Checklist` | Current `faq.ts`, `checklist.ts`, `health-decision.ts` |
| Comparison | `ComparisonTable`, `VsCard`, `RankingList`, `ProsConsCard` | Current `comparison.ts`, `review.ts` |
| Conversion | `LeadForm`, `CTABanner`, `PricingTable`, `QuoteCalculator` | Current `lead-capture.ts`, `calculator.ts`, `scroll-cta.ts` |
| Data | `CostBreakdown`, `StatGrid`, `Chart`, `DataTable` | Current `cost-guide.ts`, `interactive-infographic.ts` |
| Trust | `TestimonialGrid`, `TrustBadges`, `CitationBlock`, `LastUpdated`, `MedicalDisclaimer` | Current shared trust elements, `health-decision.ts` |
| Interactive | `Wizard`, `GeoContent`, `InteractiveMap` | Current `wizard.ts`, `geo-content.ts`, `interactive-map.ts` |
| Page | `Hero` | Current hero section in `generator.ts` |

#### 1.2 DB Migration
**New file:** `drizzle/XXXX_page_definitions.sql`
**Schema change:** `src/lib/db/schema.ts`

```sql
CREATE TABLE page_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  route TEXT NOT NULL DEFAULT '/',
  theme TEXT NOT NULL DEFAULT 'clean',
  skin TEXT NOT NULL DEFAULT 'slate',
  blocks JSONB NOT NULL DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(domain_id, route)
);
CREATE INDEX page_def_domain_idx ON page_definitions(domain_id);
```

Also add `skin` column to `domains` table for the default domain-level skin.

#### 1.3 CSS Variable Theme/Skin System
**Refactor:** `src/lib/deploy/themes/theme-definitions.ts`
**New file:** `src/lib/deploy/themes/skin-definitions.ts`

Replace CSS string blobs with structured token objects that emit CSS custom properties:

```ts
// Theme = structural tokens
interface ThemeTokens {
  fontHeading: string;
  fontBody: string;
  fontMono: string;
  fontSizeBase: string;
  fontSizeScale: number;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  spacingUnit: string;
  spacingDensity: 'compact' | 'relaxed' | 'generous';
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  containerMax: string;
  lineHeight: number;
}

// Skin = color tokens
interface SkinTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorBg: string;
  colorText: string;
  colorAccent: string;
  colorSurface: string;
  colorBorder: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
}
```

Emitted as:
```css
:root {
  --font-heading: 'DM Sans', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --radius-sm: 4px;
  --radius-md: 8px;
  --color-primary: #0066cc;
  --color-bg: #f7fafc;
  /* ... */
}
```

All component CSS updated to reference `var(--color-primary)` etc. instead of hardcoded
hex values. The existing `variants.ts` per-domain system is preserved on top of this.

**Themes (4):** Clean, Editorial, Bold, Minimal
**Skins (6+):** Ocean, Forest, Ember, Slate, Midnight, Coral
**Combinations:** 4 × 6 = 24 base looks (vs. 14 today), plus variant layer.

**Migration path:** Generate a mapping from the 14 current theme names to the closest
theme+skin combo, so existing domains are auto-migrated without visual regression.

#### 1.4 Block Renderers
**New directory:** `src/lib/deploy/blocks/renderers/`

Each block type gets a renderer function:
```ts
function renderComparisonTable(block: ComparisonTableBlock, context: RenderContext): string
```

These are extracted from the existing monolithic templates. The existing template code
is preserved as-is for backward compatibility during migration. Each renderer:
- Takes typed block config + content
- Returns an HTML string
- References CSS variables (not hardcoded colors)
- Includes any inline JS needed (calculator eval, wizard state, etc.)

**Refactoring map:**

| Existing template | Extracted blocks |
|-------------------|-----------------|
| `comparison.ts` | `ComparisonTable`, `VsCard` renderers |
| `calculator.ts` | `QuoteCalculator` renderer |
| `faq.ts` | `FAQ` renderer |
| `cost-guide.ts` | `CostBreakdown` renderer |
| `lead-capture.ts` | `LeadForm` renderer |
| `wizard.ts` | `Wizard` renderer (all 5 modes) |
| `review.ts` | `ProsConsCard`, `RankingList` renderers |
| `checklist.ts` | `Checklist` (reuse as `StepByStep`) |
| `health-decision.ts` | `MedicalDisclaimer` + `ArticleBody` |
| `interactive-infographic.ts` | `StatGrid` / `DataTable` renderers |
| `interactive-map.ts` | `InteractiveMap` renderer |
| `geo-content.ts` | `GeoContent` renderer |
| `scroll-cta.ts` | `CTABanner` renderer |
| `generator.ts` (buildPageShell) | `Header`, `Footer`, `Sidebar`, `Hero` renderers |
| `shared.ts` (trust elements) | `CitationBlock`, `LastUpdated`, `TrustBadges`, `AuthorBio` |

#### 1.5 Block Assembler
**New file:** `src/lib/deploy/blocks/assembler.ts`

The assembler replaces the monolithic `generateSiteFiles()` for domains that have
`page_definitions` records:

```ts
async function assemblePageFromBlocks(
  pageDefinition: PageDefinition,
  domain: DomainRecord,
  renderContext: RenderContext,
): Promise<string> {
  const renderedBlocks = pageDefinition.blocks.map(block =>
    renderBlock(block, renderContext)
  );
  return wrapInHtmlDocument(renderedBlocks.join('\n'), renderContext);
}
```

**Backward compatibility:** If a domain has no `page_definitions` rows, the existing
`generateSiteFiles()` path runs unchanged. Migration is per-domain, not all-or-nothing.

#### 1.6 Presets
**New file:** `src/lib/deploy/blocks/presets.ts`

Presets are saved block sequences — the v2 equivalent of v1's `siteTemplate`:

```ts
const PRESETS: Record<string, BlockDefinition[]> = {
  'comparison-site': [Header(topbar), Hero(split), ComparisonTable(cards), FAQ, CTABanner, Footer(newsletter)],
  'cost-guide': [Header(simple), Hero(minimal), CostBreakdown, QuoteCalculator, FAQ, CTABanner, Footer(minimal)],
  'authority-blog': [Header(topbar), Hero(centered), ArticleBody+Sidebar, AuthorBio, CitationBlock, Footer(multi)],
  // ...maps to existing 20 siteTemplate values
};
```

When a domain is first migrated, its `siteTemplate` value is used to auto-generate a
`page_definitions` row from the corresponding preset.

### Phase 2: Block-Aware AI Pipeline (Sessions 6–8)

#### 2.1 Per-Block Prompt Templates
**New file:** `src/lib/ai/block-prompts.ts`

Each block type gets a prompt template that tells the AI exactly what to generate:

```ts
const BLOCK_PROMPTS: Record<BlockType, PromptTemplate> = {
  Hero: {
    system: "Generate a hero section for a {niche} website...",
    outputSchema: HeroContentSchema,  // { heading, subheading, ctaText, ctaUrl }
    maxTokens: 200,
  },
  ComparisonTable: {
    system: "Generate a comparison table for {topic}...",
    outputSchema: ComparisonTableContentSchema,
    maxTokens: 2000,
    requiresResearch: true,
  },
  FAQ: {
    system: "Generate FAQ items for {topic}...",
    outputSchema: FAQContentSchema,
    maxTokens: 1500,
    sources: ['people-also-ask', 'competitor-faqs'],
  },
};
```

**Key improvement:** Instead of "write a 2000-word article about insurance comparison"
→ blob of markdown → hope the template can parse it, we get:
"Generate 6 FAQ items about auto insurance comparison" → validated JSON array of
`{question, answer}` pairs → directly rendered by the FAQ block.

#### 2.2 Pipeline Integration
**Modified:** `src/lib/ai/pipeline.ts`, `src/lib/ai/worker.ts`

New job type: `generate_block_content`

```ts
// New pipeline stage: block-aware content generation
{
  jobType: 'generate_block_content',
  payload: {
    domainId: '...',
    pageRoute: '/',
    blockId: 'blk_003',
    blockType: 'ComparisonTable',
    contentSchema: ComparisonTableContentSchema,
    promptContext: { topic: 'auto insurance', keywords: [...] },
  }
}
```

The existing `generate_draft` / `humanize` / `seo_optimize` stages are preserved for
`ArticleBody` blocks (long-form content still benefits from the multi-stage pipeline).
Other block types use the simpler single-shot `generate_block_content` job since their
content is structured data, not prose.

#### 2.3 Review Queue Adaptation
**Modified:** `src/app/dashboard/review/page.tsx`

Extend the review UI to show block-level content alongside the rendered preview:
- Each block's generated content shown as editable JSON form fields
- Preview panel shows the assembled page with the block highlighted
- Approve/reject per block (rejected blocks get re-generated)

### Phase 3: Staging Deploys (Sessions 9–10)

#### 3.1 Branch Deploys on CF Pages
Cloudflare Pages supports branch deploys natively. Add a `staging` deploy path:

- **Production deploy:** uploads to `main` branch → `domain.com`
- **Staging deploy:** uploads to `staging` branch → `staging.domain.pages.dev`

Modified: `src/lib/deploy/processor.ts` — new step between Upload and Add Custom Domain
that optionally deploys to staging first.

#### 3.2 Deploy Preview in Dashboard
Modified: `src/app/dashboard/deploy/page.tsx`

Show staging URL after staging deploy. "Promote to production" button triggers the
production deploy. Rollback button available for last 5 production builds (CF Pages
keeps deployment history).

---

## Migration Strategy

### Zero-downtime, per-domain migration

1. **Phase 1 ships with backward compatibility.** Domains without `page_definitions`
   rows continue using the existing `generateSiteFiles()` path. No breaking changes.

2. **Auto-migration tool:** A script converts each domain's current `siteTemplate` →
   `page_definitions` row using the matching preset. Run domain-by-domain.

3. **Per-article migration:** Each article's `contentType` determines which block type
   it maps to. The article's content is preserved as-is in the `ArticleBody` block;
   structured data (comparison items, calculator config, FAQ items) is extracted into
   the appropriate block's content field.

4. **Theme migration map:**
   ```
   navy-serif           → Editorial + Slate
   green-modern         → Clean + Forest
   medical-clean        → Minimal + Slate
   professional-blue    → Editorial + Ocean
   health-clean         → Minimal + Forest
   consumer-friendly    → Bold + Coral
   tech-modern          → Bold + Midnight
   trust-minimal        → Minimal + Slate
   hobby-vibrant        → Bold + Coral
   minimal-blue         → Clean + Ocean
   earth-inviting       → Editorial + Forest
   high-contrast-accessible → Bold + Slate (+ accessibility overrides preserved)
   playful-modern       → Bold + Coral
   masculine-dark       → Bold + Midnight
   enthusiast-community → Clean + Ocean
   clean-general        → Clean + Slate
   ```

---

## File Impact Summary

### New files (~8)
- `src/lib/deploy/blocks/schemas.ts` — All block Zod schemas + types
- `src/lib/deploy/blocks/renderers/` — 1 file per block category (layout, content, comparison, conversion, data, trust, interactive)
- `src/lib/deploy/blocks/assembler.ts` — Page definition → HTML
- `src/lib/deploy/blocks/presets.ts` — Preset block sequences
- `src/lib/deploy/themes/skin-definitions.ts` — Skin color token definitions
- `src/lib/ai/block-prompts.ts` — Per-block AI prompt templates
- `drizzle/XXXX_page_definitions.sql` — DB migration
- `scripts/migrate-to-blocks.ts` — One-time migration script

### Modified files (~10)
- `src/lib/db/schema.ts` — Add `pageDefinitions` table + `skin` column on domains
- `src/lib/deploy/generator.ts` — Add block-aware path alongside existing
- `src/lib/deploy/themes/theme-definitions.ts` — Rewrite as CSS variable tokens
- `src/lib/deploy/themes/components.ts` — Reference CSS vars instead of hardcoded colors
- `src/lib/deploy/themes/index.ts` — Export new theme/skin system
- `src/lib/deploy/themes/policy.ts` — Map to theme+skin combos
- `src/lib/ai/pipeline.ts` — Add `generate_block_content` job type
- `src/lib/ai/worker.ts` — Handle new job type
- `src/app/dashboard/review/page.tsx` — Block-level review UI
- `src/app/dashboard/deploy/page.tsx` — Staging URL display

### Preserved files (all existing templates)
All 16 template files in `src/lib/deploy/templates/` are preserved unchanged. They
continue to work for domains that haven't migrated to block-based page definitions.
Block renderers are extracted as new code that shares utilities from `templates/shared.ts`.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Visual regression during theme migration | Medium | High | Theme mapping is manual + tested per domain before switchover |
| Block renderer output differs from v1 template | Medium | Medium | Side-by-side comparison tool: render same domain with v1 and v2, diff HTML |
| AI block content quality varies by block type | Medium | Medium | Start with simple blocks (FAQ, CTA), iterate prompts before tackling complex ones |
| Migration script misses edge cases | Low | Medium | Run migration in dry-run mode first, validate output |
| Performance regression (more DB queries for page_definitions) | Low | Low | Single query with join; page definitions are small JSON |

---

## Success Criteria

1. **Any two blocks can coexist on the same page** — comparison table + calculator + FAQ on one page
2. **Theme change = zero code changes** — swap theme+skin in DB, redeploy, completely different look
3. **AI generates valid block content on first try >90% of the time** — no regex parsing of markdown
4. **Existing domains render identically** until explicitly migrated
5. **New page types can be created by composing blocks** — no new template code required
