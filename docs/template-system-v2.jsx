import { useState, useRef, useEffect } from "react";

const c = {
  bg: "#06080d",
  surface: "#0d1117",
  card: "#131921",
  cardHover: "#1a2332",
  border: "#1b2535",
  borderActive: "#3b82f6",
  text: "#d4dae4",
  textBright: "#f0f4f8",
  muted: "#4e5d73",
  blue: "#4d8efa",
  green: "#22c97a",
  orange: "#f5a623",
  purple: "#9b6dff",
  cyan: "#2dd4bf",
  red: "#f0506e",
  pink: "#e879a8",
  yellow: "#fbbf24",
};

const mono = "'IBM Plex Mono', monospace";
const sans = "'DM Sans', sans-serif";

const TABS = [
  { label: "System Design", icon: "◆" },
  { label: "Block System", icon: "▦" },
  { label: "Theme Engine", icon: "◐" },
  { label: "Visual Editor", icon: "✎" },
  { label: "Content Pipeline", icon: "⟳" },
  { label: "Deploy + Preview", icon: "▲" },
];

const Pill = ({ children, color = c.muted, filled = false }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, color: filled ? c.bg : color, fontFamily: mono,
    padding: "3px 10px", background: filled ? color : color + "12",
    borderRadius: 100, letterSpacing: "0.03em", display: "inline-block",
  }}>{children}</span>
);

const Section = ({ title, subtitle, color = c.blue, children }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 0 }}>
        <div style={{ width: 3, height: 18, background: color, borderRadius: 2 }} />
        <h3 style={{ color: c.textBright, fontSize: 17, fontWeight: 700, margin: 0, fontFamily: sans }}>{title}</h3>
      </div>
      {subtitle && <div style={{ color: c.muted, fontSize: 12, marginLeft: 13, lineHeight: 1.5, marginTop: 4 }}>{subtitle}</div>}
    </div>
    {children}
  </div>
);

const CodeBlock = ({ children, title }) => (
  <div style={{ marginBottom: 12 }}>
    {title && <div style={{ color: c.muted, fontSize: 10, fontFamily: mono, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 2 }}>{title}</div>}
    <pre style={{
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: 16, fontSize: 11.5, fontFamily: mono, color: c.cyan,
      overflowX: "auto", margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap",
    }}>{children}</pre>
  </div>
);

const Grid = ({ cols = 2, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${cols === 3 ? 200 : cols === 2 ? 280 : 180}px, 1fr))`, gap: 10 }}>
    {children}
  </div>
);

const InfoCard = ({ title, color, items, badge }) => (
  <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14, transition: "border-color 0.2s" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ color, fontWeight: 700, fontSize: 13, fontFamily: mono }}>{title}</div>
      {badge && <Pill color={color}>{badge}</Pill>}
    </div>
    {items.map((item, i) => (
      <div key={i} style={{ color: c.muted, fontSize: 11.5, lineHeight: 1.6, padding: "2px 0" }}>{item}</div>
    ))}
  </div>
);

// ─── TAB: SYSTEM DESIGN ──────────────────────────────────────────
const SystemDesignTab = () => (
  <div>
    <Section title="v1 → v2: What Changes" color={c.red} subtitle="v1 treated templates as monolithic projects. v2 treats them as assembled compositions of independent blocks.">
      <Grid cols={2}>
        <InfoCard title="v1: Rigid Templates" color={c.red} badge="OLD" items={[
          "5 fixed templates (comparison, calculator, etc.)",
          "Pick one template per domain — locked in",
          "Template owns the entire page structure",
          "Changing layout = switching templates entirely",
          "Style tightly coupled to template code",
          "Every template duplicates Header, Footer, CTA...",
        ]} />
        <InfoCard title="v2: Composable Blocks" color={c.green} badge="NEW" items={[
          "30+ independent blocks (Hero, Table, Form, etc.)",
          "Assemble any combination per page per domain",
          "Pages are block sequences with a theme applied",
          "Drag to reorder, add, remove blocks freely",
          "Theme layer separated: swap skin without touching structure",
          "Blocks shared across all sites — update once, propagate everywhere",
        ]} />
      </Grid>
    </Section>

    <Section title="Architecture Overview" color={c.blue}>
      <CodeBlock>{`┌─────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN MANAGER (Next.js)                         │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Visual       │  │ Content      │  │ Theme        │  │ Analytics  │  │
│  │ Editor       │  │ Pipeline     │  │ Engine       │  │ Feedback   │  │
│  │              │  │              │  │              │  │            │  │
│  │ Drag blocks  │  │ AI generate  │  │ Skins/tokens │  │ RPM, CTR   │  │
│  │ Configure    │  │ Review queue │  │ Font pairs   │  │ Heatmaps   │  │
│  │ Preview live │  │ Schedule     │  │ Color themes │  │ A/B winner │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                 │         │
│         └─────────────────┼─────────────────┘                 │         │
│                           ▼                                   │         │
│              ┌─────────────────────┐                          │         │
│              │   PAGE DEFINITION   │◄─────────────────────────┘         │
│              │   (per domain)      │   auto-optimize                    │
│              │                     │                                    │
│              │   blocks: [         │                                    │
│              │     { type, config, │                                    │
│              │       content,      │                                    │
│              │       variant }     │                                    │
│              │   ]                 │                                    │
│              │   theme: "clean"    │                                    │
│              │   skin: "ocean"     │                                    │
│              └──────────┬──────────┘                                    │
│                         │                                               │
└─────────────────────────┼───────────────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │     BUILD ENGINE      │
              │                       │
              │  1. Resolve blocks    │
              │  2. Apply theme/skin  │
              │  3. Inject content    │
              │  4. Astro build       │
              │  5. Optimize assets   │
              └───────────┬───────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │  Preview    │ │  Staging    │ │  Production │
   │  (instant)  │ │  (test URL) │ │  (live CDN) │
   │             │ │             │ │             │
   │  In-editor  │ │  Shareable  │ │  CF Pages   │
   │  iframe     │ │  link       │ │  + custom   │
   │             │ │             │ │  domain     │
   └─────────────┘ └─────────────┘ └─────────────┘`}</CodeBlock>
    </Section>

    <Section title="Core Principles" color={c.purple}>
      <Grid cols={3}>
        {[
          { title: "Blocks, not templates", detail: "Every section is independent. Hero doesn't know about Footer. Assemble freely.", color: c.blue },
          { title: "Theme ≠ Structure", detail: "A comparison page with 'Ocean' theme and 'Brutalist' theme uses identical blocks — only CSS variables change.", color: c.green },
          { title: "Content is typed", detail: "Each block declares a content schema. The AI pipeline knows exactly what to generate for each block type.", color: c.orange },
          { title: "Preview before deploy", detail: "Every change renders instantly in the editor. Staging URLs let you test before going live.", color: c.purple },
          { title: "Update once, propagate", detail: "Fix a bug in the ComparisonTable block → one build pushes it to every domain using it.", color: c.cyan },
          { title: "Analytics close the loop", detail: "Performance data flows back to suggest block swaps, theme changes, and content rewrites.", color: c.pink },
        ].map((p, i) => (
          <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ color: p.color, fontSize: 12, fontWeight: 700, fontFamily: mono, marginBottom: 6 }}>{p.title}</div>
            <div style={{ color: c.muted, fontSize: 11.5, lineHeight: 1.6 }}>{p.detail}</div>
          </div>
        ))}
      </Grid>
    </Section>
  </div>
);

// ─── TAB: BLOCK SYSTEM ──────────────────────────────────────────
const BlockSystemTab = () => {
  const categories = [
    {
      name: "Layout Blocks", color: c.blue, icon: "▦",
      blocks: [
        { name: "Hero", desc: "Headline, subhead, CTA, background image/gradient", slots: "heading, subheading, ctaText, ctaUrl, backgroundImage, layout: centered|split|minimal" },
        { name: "Header", desc: "Logo, nav links, CTA button, mobile menu", slots: "logo, navItems[], ctaButton, sticky: bool, transparent: bool" },
        { name: "Footer", desc: "Links, legal, social, newsletter signup", slots: "columns[{title, links[]}], legal, socialLinks[], newsletter: bool" },
        { name: "Sidebar", desc: "Sticky sidebar for TOC, ads, related content", slots: "widgets[]: toc|ad|related|cta|newsletter, sticky: bool" },
      ],
    },
    {
      name: "Content Blocks", color: c.green, icon: "¶",
      blocks: [
        { name: "ArticleBody", desc: "Long-form markdown content with auto-TOC", slots: "markdown, author, publishDate, readingTime, showTOC: bool" },
        { name: "FAQ", desc: "Accordion Q&A with schema.org markup", slots: "items[{question, answer}], schemaMarkup: auto" },
        { name: "StepByStep", desc: "Numbered process/how-to guide", slots: "steps[{title, content, image?}], showNumbers: bool" },
        { name: "AuthorBio", desc: "E-E-A-T credibility block", slots: "name, title, photo, credentials[], bio, socialLinks[]" },
      ],
    },
    {
      name: "Comparison Blocks", color: c.orange, icon: "⚖",
      blocks: [
        { name: "ComparisonTable", desc: "Side-by-side feature matrix, sortable columns", slots: "items[], features[], highlightWinner: bool, showRatings: bool" },
        { name: "VsCard", desc: "A vs B head-to-head with verdict", slots: "itemA, itemB, criteria[], verdict, verdictReason" },
        { name: "RankingList", desc: "Ordered ranking with scores and summaries", slots: "items[{rank, name, score, summary, ctaUrl}], criteria" },
        { name: "ProsConsCard", desc: "Pros/cons breakdown per product", slots: "productName, pros[], cons[], rating, verdict" },
      ],
    },
    {
      name: "Conversion Blocks", color: c.red, icon: "◎",
      blocks: [
        { name: "LeadForm", desc: "Multi-step or single-step capture form", slots: "fields[], steps[]?, submitText, destination: webhook|email|zapier" },
        { name: "CTABanner", desc: "Full-width conversion banner", slots: "headline, subtext, buttonText, buttonUrl, urgency?: string" },
        { name: "PricingTable", desc: "Tiered pricing with feature comparison", slots: "tiers[{name, price, features[], ctaText, highlighted}]" },
        { name: "QuoteCalculator", desc: "Interactive calculator with result CTA", slots: "inputs[{label, type, options?}], formula, resultTemplate, ctaOnResult" },
      ],
    },
    {
      name: "Data Blocks", color: c.purple, icon: "◧",
      blocks: [
        { name: "CostBreakdown", desc: "Itemized cost ranges with factors", slots: "items[{item, low, average, high}], factors[], disclaimer" },
        { name: "StatGrid", desc: "Key numbers/metrics in grid layout", slots: "stats[{label, value, change?, icon?}], columns: 2|3|4" },
        { name: "Chart", desc: "Bar, line, or pie chart from data", slots: "type: bar|line|pie, data[], labels, colors" },
        { name: "DataTable", desc: "Sortable, filterable data table", slots: "columns[], rows[], sortable: bool, filterable: bool, pagination: bool" },
      ],
    },
    {
      name: "Trust Blocks", color: c.cyan, icon: "✓",
      blocks: [
        { name: "TestimonialGrid", desc: "Social proof testimonials", slots: "items[{quote, author, role, photo?, rating?}], layout: grid|carousel" },
        { name: "TrustBadges", desc: "Partner logos, certifications", slots: "badges[{image, label, url?}], layout: row|grid" },
        { name: "CitationBlock", desc: "Source attribution for E-E-A-T", slots: "sources[{title, url, publisher, date}], style: footnote|inline" },
        { name: "LastUpdated", desc: "Freshness signal with edit history", slots: "publishedDate, lastUpdated, reviewedBy?, nextReview?" },
      ],
    },
  ];

  const [activeCat, setActiveCat] = useState(0);

  return (
    <div>
      <Section title="Block = Atomic Unit" color={c.blue} subtitle="Each block is a self-contained Astro component with a typed config schema, content slots, and variant support. Blocks know nothing about each other.">
        <CodeBlock title="Block anatomy">{`// blocks/ComparisonTable/index.astro
---
import type { ComparisonTableProps } from './schema';
const { items, features, highlightWinner, showRatings, variant = 'default' } = Astro.props;
---

<section class={\`comparison-table variant-\${variant}\`}>
  <!-- Pure HTML/CSS, zero JS unless interactive -->
  <!-- Reads CSS variables from theme layer -->
  <!-- variant controls layout: 'default' | 'compact' | 'cards' | 'minimal' -->
</section>

// blocks/ComparisonTable/schema.ts
export interface ComparisonTableProps {
  items: {
    name: string;
    image?: string;
    rating?: number;
    affiliateUrl?: string;
    features: Record<string, string | boolean | number>;
  }[];
  features: { key: string; label: string; type: 'text' | 'boolean' | 'number' }[];
  highlightWinner: boolean;
  showRatings: boolean;
  variant: 'default' | 'compact' | 'cards' | 'minimal';
}

// blocks/ComparisonTable/variants.css
.comparison-table.variant-default { /* full table layout */ }
.comparison-table.variant-compact { /* condensed, mobile-first */ }
.comparison-table.variant-cards   { /* card grid instead of table */ }
.comparison-table.variant-minimal { /* stripped down, text only */ }`}</CodeBlock>
      </Section>

      <Section title="Block Library" color={c.green}>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {categories.map((cat, i) => (
            <button key={i} onClick={() => setActiveCat(i)} style={{
              padding: "7px 14px", borderRadius: 8,
              border: `1px solid ${activeCat === i ? cat.color : c.border}`,
              background: activeCat === i ? cat.color + "12" : "transparent",
              color: activeCat === i ? cat.color : c.muted,
              cursor: "pointer", fontSize: 12, fontFamily: mono, transition: "all 0.15s",
            }}>
              <span style={{ marginRight: 6 }}>{cat.icon}</span>{cat.name}
              <span style={{ marginLeft: 6, opacity: 0.5 }}>({cat.blocks.length})</span>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {categories[activeCat].blocks.map((block, i) => (
            <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ color: categories[activeCat].color, fontWeight: 700, fontSize: 14, fontFamily: mono }}>{block.name}</div>
              </div>
              <div style={{ color: c.text, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{block.desc}</div>
              <div style={{ background: c.surface, borderRadius: 6, padding: 10 }}>
                <div style={{ color: c.muted, fontSize: 9, fontFamily: mono, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Config Slots</div>
                <div style={{ color: c.cyan, fontSize: 10.5, fontFamily: mono, lineHeight: 1.6 }}>{block.slots}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Page Assembly" color={c.purple} subtitle="A page is just an ordered list of blocks with a theme. This is what gets stored in your DB.">
        <CodeBlock title="Page definition stored in Postgres (jsonb)">{`{
  "domain": "insurancecompareusa.com",
  "page": "/",
  "theme": "clean",
  "skin": "ocean",
  "blocks": [
    {
      "id": "blk_001",
      "type": "Header",
      "config": { "sticky": true, "transparent": false },
      "content": { "logo": "/logo.svg", "navItems": ["Compare", "Reviews", "Guides", "About"] }
    },
    {
      "id": "blk_002",
      "type": "Hero",
      "variant": "split",
      "config": { "layout": "split" },
      "content": {
        "heading": "Compare Insurance Rates in Seconds",
        "subheading": "Side-by-side comparisons from top US providers",
        "ctaText": "Start Comparing →",
        "ctaUrl": "#compare"
      }
    },
    {
      "id": "blk_003",
      "type": "ComparisonTable",
      "variant": "cards",
      "config": { "highlightWinner": true, "showRatings": true },
      "content": {
        "items": [/* ...populated from content DB... */],
        "features": [/* ...comparison criteria... */]
      }
    },
    {
      "id": "blk_004",
      "type": "FAQ",
      "config": {},
      "content": { "items": [/* ...AI-generated Q&As... */] }
    },
    {
      "id": "blk_005",
      "type": "CTABanner",
      "variant": "urgent",
      "config": {},
      "content": {
        "headline": "Ready to save?",
        "buttonText": "Get My Free Quote",
        "buttonUrl": "/quote"
      }
    },
    {
      "id": "blk_006",
      "type": "Footer",
      "config": { "newsletter": true },
      "content": { "columns": [/*...*/], "legal": "© 2026 InsuranceCompareUSA" }
    }
  ]
}`}</CodeBlock>
      </Section>

      <Section title="Presets: Quick-Start Combos" color={c.orange} subtitle="Presets are saved block sequences — the v2 equivalent of v1's rigid templates. But now they're just starting points you can customize.">
        <Grid cols={3}>
          {[
            { name: "Comparison Site", blocks: "Header → Hero(split) → ComparisonTable(cards) → VsCard × N → FAQ → CTABanner → Footer", color: c.blue },
            { name: "Cost Guide", blocks: "Header → Hero(minimal) → CostBreakdown → QuoteCalculator → StepByStep → FAQ → CTABanner → Footer", color: c.green },
            { name: "Authority Blog", blocks: "Header → Hero(centered) → ArticleBody + Sidebar(toc,related) → AuthorBio → CitationBlock → Footer", color: c.orange },
            { name: "Lead Gen Landing", blocks: "Header(transparent) → Hero(split) + LeadForm → StatGrid → TestimonialGrid → TrustBadges → CTABanner → Footer", color: c.red },
            { name: "Affiliate Listicle", blocks: "Header → Hero(minimal) → RankingList → ProsConsCard × N → ComparisonTable(compact) → FAQ → Footer", color: c.purple },
            { name: "Data Tool", blocks: "Header → Hero(centered) → QuoteCalculator → DataTable → Chart → FAQ → CTABanner → Footer", color: c.cyan },
          ].map((preset, i) => (
            <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ color: preset.color, fontWeight: 700, fontSize: 13, fontFamily: mono, marginBottom: 8 }}>{preset.name}</div>
              <div style={{ color: c.muted, fontSize: 10.5, fontFamily: mono, lineHeight: 1.8 }}>
                {preset.blocks.split(" → ").map((b, j) => (
                  <span key={j}>
                    <span style={{ color: c.text, background: c.surface, padding: "2px 6px", borderRadius: 4, display: "inline-block", marginBottom: 3 }}>{b}</span>
                    {j < preset.blocks.split(" → ").length - 1 && <span style={{ color: c.muted, margin: "0 2px" }}> → </span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Grid>
      </Section>
    </div>
  );
};

// ─── TAB: THEME ENGINE ──────────────────────────────────────────
const ThemeEngineTab = () => {
  const [activeTheme, setActiveTheme] = useState(0);

  const themes = [
    {
      name: "Clean",
      desc: "Sharp, modern, professional. Max readability.",
      tokens: {
        fonts: { heading: "DM Sans 700", body: "DM Sans 400", mono: "IBM Plex Mono" },
        radius: "8px", spacing: "relaxed", shadows: "subtle",
        vibe: "Corporate trustworthy — insurance, finance, legal",
      },
    },
    {
      name: "Editorial",
      desc: "Magazine-quality typography. Content-first.",
      tokens: {
        fonts: { heading: "Playfair Display 700", body: "Source Serif 4 400", mono: "JetBrains Mono" },
        radius: "2px", spacing: "generous", shadows: "none",
        vibe: "Authority & depth — health analysis, research, education",
      },
    },
    {
      name: "Bold",
      desc: "High contrast, strong CTAs, conversion-focused.",
      tokens: {
        fonts: { heading: "Space Grotesk 700", body: "Inter 400", mono: "Fira Code" },
        radius: "12px", spacing: "tight", shadows: "heavy",
        vibe: "Action-oriented — lead gen, tools, calculators",
      },
    },
    {
      name: "Minimal",
      desc: "Stripped back, fast, content-only.",
      tokens: {
        fonts: { heading: "Instrument Sans 600", body: "Instrument Sans 400", mono: "IBM Plex Mono" },
        radius: "4px", spacing: "compact", shadows: "none",
        vibe: "Speed & simplicity — cost lookups, quick answers",
      },
    },
  ];

  const skins = [
    { name: "Ocean", primary: "#0066cc", secondary: "#00a3cc", bg: "#f7fafc", text: "#1a2b3c", accent: "#ff6b35" },
    { name: "Forest", primary: "#0d7c3f", secondary: "#2d9c5f", bg: "#f4f9f5", text: "#1a2b1f", accent: "#d97706" },
    { name: "Ember", primary: "#c0392b", secondary: "#e74c3c", bg: "#fdf6f5", text: "#2c1810", accent: "#2980b9" },
    { name: "Slate", primary: "#334155", secondary: "#475569", bg: "#f8fafc", text: "#0f172a", accent: "#6366f1" },
    { name: "Midnight", primary: "#818cf8", secondary: "#a78bfa", bg: "#0f1729", text: "#e2e8f0", accent: "#22d3ee" },
    { name: "Coral", primary: "#ec6f60", secondary: "#f0907e", bg: "#fffaf8", text: "#3a2218", accent: "#2563eb" },
  ];

  return (
    <div>
      <Section title="Theme ≠ Skin" color={c.purple} subtitle="Theme controls structure (typography scale, spacing, border radius, shadow depth). Skin controls color. Mix any theme with any skin.">
        <CodeBlock title="Separation of concerns">{`THEME (structural decisions)          SKIN (color decisions)
─────────────────────────             ─────────────────────
--font-heading: "DM Sans"            --color-primary: #0066cc
--font-body: "DM Sans"               --color-secondary: #00a3cc
--font-mono: "IBM Plex Mono"         --color-bg: #f7fafc
--font-size-base: 16px               --color-text: #1a2b3c
--font-size-scale: 1.25              --color-accent: #ff6b35
--radius-sm/md/lg: 4/8/12px          --color-surface: #ffffff
--spacing-unit: 8px                  --color-border: #e2e8f0
--spacing-density: relaxed           --color-success: #22c55e
--shadow-sm/md/lg: ...               --color-warning: #f59e0b
--container-max: 1200px              --color-error: #ef4444
--line-height: 1.65

Result: Theme "Clean" + Skin "Ocean" = one look
        Theme "Clean" + Skin "Midnight" = same structure, dark mode
        Theme "Editorial" + Skin "Ocean" = different typography, same colors

Total combinations: 4 themes × 6 skins = 24 distinct looks
                    + custom themes/skins = unlimited`}</CodeBlock>
      </Section>

      <Section title="Themes (Structure)" color={c.blue}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {themes.map((theme, i) => (
            <div key={i} onClick={() => setActiveTheme(i)} style={{
              background: activeTheme === i ? c.cardHover : c.card,
              border: `1px solid ${activeTheme === i ? c.blue : c.border}`,
              borderRadius: 10, padding: 14, cursor: "pointer", transition: "all 0.15s",
            }}>
              <div style={{ color: c.textBright, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{theme.name}</div>
              <div style={{ color: c.muted, fontSize: 11.5, marginBottom: 12, lineHeight: 1.5 }}>{theme.desc}</div>
              {Object.entries(theme.tokens).map(([key, val]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${c.surface}` }}>
                  <span style={{ color: c.muted, fontSize: 10, fontFamily: mono }}>{key}</span>
                  <span style={{ color: c.cyan, fontSize: 10, fontFamily: mono, textAlign: "right", maxWidth: "60%" }}>
                    {typeof val === 'object' ? Object.values(val).join(', ') : val}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Skins (Color)" color={c.green}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {skins.map((skin, i) => (
            <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", height: 40 }}>
                <div style={{ flex: 1, background: skin.primary }} />
                <div style={{ flex: 1, background: skin.secondary }} />
                <div style={{ flex: 1, background: skin.accent }} />
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ color: c.textBright, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{skin.name}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {Object.entries(skin).filter(([k]) => k !== 'name').map(([key, val]) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: val, border: `1px solid ${c.border}` }} />
                      <span style={{ color: c.muted, fontSize: 9, fontFamily: mono }}>{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Domain → Theme + Skin Mapping" color={c.orange} subtitle="Your manager auto-suggests based on niche, but you can override anything.">
        <Grid cols={2}>
          {[
            { domain: "insurancecompareusa.com", theme: "Clean", skin: "Ocean", reason: "Trust + professionalism for finance" },
            { domain: "costoftherapy.com", theme: "Minimal", skin: "Forest", reason: "Quick answers, calming health palette" },
            { domain: "diabetesanalysis.com", theme: "Editorial", skin: "Slate", reason: "Authority content needs serious typography" },
            { domain: "ozempicvsmounjaro.com", theme: "Bold", skin: "Coral", reason: "High-intent comparison needs strong CTAs" },
          ].map((m, i) => (
            <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: c.cyan, fontFamily: mono, fontSize: 12, fontWeight: 600 }}>{m.domain}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <Pill color={c.blue}>Theme: {m.theme}</Pill>
                <Pill color={c.green}>Skin: {m.skin}</Pill>
              </div>
              <div style={{ color: c.muted, fontSize: 11, lineHeight: 1.5 }}>{m.reason}</div>
            </div>
          ))}
        </Grid>
      </Section>
    </div>
  );
};

// ─── TAB: VISUAL EDITOR ──────────────────────────────────────────
const VisualEditorTab = () => (
  <div>
    <Section title="Editor Architecture" color={c.blue} subtitle="Not building Webflow. Building a block-level page composer with live preview. Think Notion's block system meets Framer's visual output.">
      <CodeBlock title="Editor layout (wireframe)">{`┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ Domain Manager    insurancecompareusa.com / (homepage)     [Preview ▸]│
├────────────┬─────────────────────────────────────────────┬──────────────┤
│            │                                             │              │
│  BLOCKS    │           LIVE PREVIEW (iframe)             │  INSPECTOR   │
│  PANEL     │                                             │              │
│            │  ┌─────────────────────────────────────┐    │  Block:      │
│ ┌────────┐ │  │         [HEADER BLOCK]               │    │  CompTable   │
│ │▦ Layout│ │  │  Logo    Compare  Reviews  About     │    │              │
│ ├────────┤ │  ├─────────────────────────────────────┤    │ ┌──────────┐ │
│ │ Header │ │  │         [HERO BLOCK]                 │    │ │ Config   │ │
│ │ Hero   │ │  │                                      │    │ │          │ │
│ │ Footer │ │  │  Compare Insurance                   │    │ │ Variant: │ │
│ │ Sidebar│ │  │  Rates in Seconds                    │    │ │ [cards ▾]│ │
│ ├────────┤ │  │          [Start Comparing →]          │    │ │          │ │
│ │¶ Content│ │  ├─────────────────────────────────────┤    │ │ Columns: │ │
│ ├────────┤ │  │         [COMPARISON TABLE]  ← selected│   │ │ [3 ▾]   │ │
│ │ Article│ │  │  ┌──────┐ ┌──────┐ ┌──────┐          │    │ │          │ │
│ │ FAQ    │ │  │  │ AAA  │ │ State│ │ Geico│          │    │ │ Ratings: │ │
│ │ Steps  │ │  │  │ ★★★★ │ │ ★★★★ │ │ ★★★☆ │          │    │ │ [on ▾]  │ │
│ │ Author │ │  │  │      │ │      │ │      │          │    │ ├──────────┤ │
│ ├────────┤ │  │  └──────┘ └──────┘ └──────┘          │    │ │ Content  │ │
│ │⚖ Compare│ │  ├─────────────────────────────────────┤    │ │          │ │
│ ├────────┤ │  │         [FAQ BLOCK]                   │    │ │ Items: 6 │ │
│ │ Table  │ │  │  ▸ How do I compare...?               │    │ │ [Edit ▸] │ │
│ │ VsCard │ │  │  ▸ What factors affect...?            │    │ │          │ │
│ │ Ranking│ │  ├─────────────────────────────────────┤    │ │ Source:  │ │
│ ├────────┤ │  │         [CTA BANNER]                  │    │ │ [DB ▾]  │ │
│ │◎ Convert│ │  │    Ready to save? [Get Quote]        │    │ ├──────────┤ │
│ ├────────┤ │  ├─────────────────────────────────────┤    │ │ Theme    │ │
│ │ Lead   │ │  │         [FOOTER BLOCK]                │    │ │          │ │
│ │ CTA    │ │  │  Links...          © 2026             │    │ │ Override │ │
│ │ Price  │ │  └─────────────────────────────────────┘    │ │ spacing: │ │
│ │ Calc   │ │                                             │ │ [—] [+]  │ │
│ └────────┘ │  Drag blocks from left panel ───────────▶   │ └──────────┘ │
│            │  Click block in preview to select ──────▶   │              │
│  [+ Custom]│  Drag to reorder in preview ────────────▶   │  [Delete]   │
│            │                                             │  [Duplicate] │
├────────────┴─────────────────────────────────────────────┴──────────────┤
│  Theme: [Clean ▾]   Skin: [Ocean ▾]   Page: [/ ▾]   [Save] [Deploy ▸] │
└──────────────────────────────────────────────────────────────────────────┘`}</CodeBlock>
    </Section>

    <Section title="Implementation Approach" color={c.green} subtitle="Build pragmatically — you don't need Figma. You need fast block composition.">
      <Grid cols={2}>
        <InfoCard title="Phase 1: Config Editor (Week 1-2)" color={c.green} badge="MVP" items={[
          "JSON form auto-generated from block schemas",
          "Preview iframe refreshes on every config change",
          "Block order via simple drag handle (react-dnd or dnd-kit)",
          "No inline editing — all changes through inspector panel",
          "This alone handles 90% of your workflow",
        ]} />
        <InfoCard title="Phase 2: Visual Polish (Week 3-4)" color={c.orange} badge="NICE" items={[
          "Click-to-select blocks in the preview iframe",
          "Inline text editing for headings and CTAs",
          "Block hover outlines with add/move/delete controls",
          "Theme/skin toggle with instant preview swap",
          "Responsive preview (desktop/tablet/mobile toggle)",
        ]} />
        <InfoCard title="Phase 3: Power Features (Month 2+)" color={c.purple} badge="LATER" items={[
          "Custom CSS overrides per block per domain",
          "Block-level A/B testing (show variant A to 50%)",
          "Undo/redo history (store block state stack)",
          "Keyboard shortcuts (⌘Z, ⌘D duplicate, ↑↓ reorder)",
          "Block marketplace for SaaS users to share custom blocks",
        ]} />
        <InfoCard title="Tech Stack for Editor" color={c.cyan} badge="STACK" items={[
          "React + dnd-kit for the composer UI",
          "iframe + postMessage for live preview communication",
          "JSON Schema → react-jsonschema-form for config panels",
          "Astro dev server as the preview renderer",
          "Debounced saves → Postgres (no accidental data loss)",
        ]} />
      </Grid>
    </Section>
  </div>
);

// ─── TAB: CONTENT PIPELINE ──────────────────────────────────────
const ContentPipelineTab = () => (
  <div>
    <Section title="v2 Content Pipeline" color={c.green} subtitle="v1 was 'generate article, review, publish.' v2 is block-aware — AI generates content typed to the exact block schema.">
      <CodeBlock>{`BLOCK-AWARE CONTENT GENERATION:

Traditional CMS:  "Write an article about insurance comparison"
                   → Blob of markdown → hope it fits the template

v2 approach:      "Generate content for these blocks on this page"
                   → Each block gets exactly the content it needs

Example: insurancecompareusa.com homepage needs content for:

Block: Hero
  AI generates → { heading, subheading, ctaText } — 3 short strings

Block: ComparisonTable
  AI generates → { items: [{name, rating, pros, cons, features}...] }
  Sources: scrape provider websites, pull from existing DB, enrich with AI

Block: FAQ
  AI generates → { items: [{question, answer}...] }
  Sources: People Also Ask for "compare insurance", competitor FAQs

Block: CTABanner
  AI generates → { headline, buttonText } — 2 strings, conversion-optimized

Each block type has its own generation prompt template.
Each prompt includes: niche context, target keywords, tone from theme, SEO rules.`}</CodeBlock>
    </Section>

    <Section title="Pipeline Stages" color={c.blue}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[
          {
            stage: "1", name: "Plan", color: c.purple, time: "~5 sec",
            detail: "Manager identifies which blocks on which pages need content. Creates a content job manifest.",
            inputs: "Domain config, page block list, target keywords, existing content (to avoid duplication)",
            outputs: "Content job manifest: [{blockId, blockType, contentSchema, promptContext}]",
          },
          {
            stage: "2", name: "Research", color: c.blue, time: "~30 sec",
            detail: "Pull competitive data, SERP analysis, People Also Ask, pricing data, product specs.",
            inputs: "Target keywords, niche, content type",
            outputs: "Research bundle: SERP data, competitor content gaps, real-world data points, citations",
          },
          {
            stage: "3", name: "Generate", color: c.green, time: "~60 sec",
            detail: "AI generates content for each block using block-specific prompt templates. Parallel generation for independent blocks.",
            inputs: "Block schema, research bundle, brand voice rules, SEO constraints",
            outputs: "Raw content per block, typed to schema (validated against JSON Schema)",
          },
          {
            stage: "4", name: "Enrich", color: c.orange, time: "~20 sec",
            detail: "Add schema.org markup, internal links, affiliate link insertion, image suggestions, meta tags.",
            inputs: "Raw content, domain affiliate config, internal link map, image library",
            outputs: "Enriched content with SEO metadata, affiliate placements, image URLs",
          },
          {
            stage: "5", name: "Review", color: c.yellow, time: "Human",
            detail: "Queue for human review. Side-by-side: generated content vs live preview. Inline editing. Approve/edit/reject per block.",
            inputs: "Enriched content, live preview URL",
            outputs: "Approved content (or rejection with notes for re-generation)",
          },
          {
            stage: "6", name: "Publish", color: c.cyan, time: "~30 sec",
            detail: "Approved content saved to DB, build triggered, deployed to staging → production.",
            inputs: "Approved content, deploy target",
            outputs: "Live page on CDN with verified content",
          },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12, background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 50, gap: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + "20", display: "flex", alignItems: "center", justifyContent: "center", color: s.color, fontWeight: 800, fontFamily: mono, fontSize: 14 }}>{s.stage}</div>
              <div style={{ color: c.muted, fontSize: 9, fontFamily: mono }}>{s.time}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: s.color, fontWeight: 700, fontSize: 14, fontFamily: mono, marginBottom: 4 }}>{s.name}</div>
              <div style={{ color: c.text, fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>{s.detail}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: c.surface, borderRadius: 6, padding: 8 }}>
                  <div style={{ color: c.muted, fontSize: 9, fontFamily: mono, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Inputs</div>
                  <div style={{ color: c.muted, fontSize: 10.5, lineHeight: 1.5 }}>{s.inputs}</div>
                </div>
                <div style={{ background: c.surface, borderRadius: 6, padding: 8 }}>
                  <div style={{ color: c.muted, fontSize: 9, fontFamily: mono, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Outputs</div>
                  <div style={{ color: c.cyan, fontSize: 10.5, lineHeight: 1.5 }}>{s.outputs}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>

    <Section title="Bulk Content Operations" color={c.pink} subtitle="This is where your P0 bulk ops priority pays off. Content generation at portfolio scale.">
      <Grid cols={2}>
        {[
          { title: "Seed Entire Domain", desc: "Select domain → auto-detect blocks on all pages → generate all content in parallel → queue for batch review. One click to populate a 20-page site.", color: c.pink },
          { title: "Refresh Stale Content", desc: "Analytics flags pages with declining traffic → AI re-researches topic → generates updated content → side-by-side diff review → deploy update.", color: c.orange },
          { title: "Cross-Domain Content Sync", desc: "FAQ about 'what affects insurance cost' works on 3 domains. Edit once, sync variants to all. AI adapts tone/keywords per domain.", color: c.purple },
          { title: "Seasonal Content Campaigns", desc: "Trigger: 'Open Enrollment' season → auto-generate timely content for all insurance domains → schedule publish dates → auto-expire after season.", color: c.green },
        ].map((op, i) => (
          <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ color: op.color, fontWeight: 700, fontSize: 13, fontFamily: mono, marginBottom: 6 }}>{op.title}</div>
            <div style={{ color: c.muted, fontSize: 11.5, lineHeight: 1.7 }}>{op.desc}</div>
          </div>
        ))}
      </Grid>
    </Section>
  </div>
);

// ─── TAB: DEPLOY + PREVIEW ──────────────────────────────────────
const DeployTab = () => (
  <div>
    <Section title="Three-Tier Deploy Pipeline" color={c.blue} subtitle="Every change goes through Preview → Staging → Production. No more yolo deploys to live domains.">
      <CodeBlock>{`DEPLOY PIPELINE:

  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   EDIT (in visual editor)                                        │
  │     │                                                            │
  │     ▼                                                            │
  │   ┌──────────────────────┐                                       │
  │   │  ① PREVIEW (instant) │  ← Runs inside editor iframe          │
  │   │                      │  ← Astro dev server, hot reload       │
  │   │  What you see as you │  ← No deploy needed                   │
  │   │  drag blocks & edit  │  ← Every config change = instant      │
  │   └──────────┬───────────┘                                       │
  │              │ Click "Stage"                                      │
  │              ▼                                                    │
  │   ┌──────────────────────┐                                       │
  │   │  ② STAGING (build)   │  ← Full Astro production build        │
  │   │                      │  ← Deployed to: preview.domain.com    │
  │   │  Shareable test URL  │  ← or: domain.com/__staging           │
  │   │  Lighthouse scores   │  ← Run perf/SEO/accessibility audit   │
  │   │  Mobile check        │  ← Responsive screenshots auto-gen    │
  │   │  Diff from current   │  ← Visual diff: staging vs live       │
  │   └──────────┬───────────┘                                       │
  │              │ Click "Deploy" (or auto-deploy after approval)     │
  │              ▼                                                    │
  │   ┌──────────────────────┐                                       │
  │   │  ③ PRODUCTION        │  ← Atomic swap on Cloudflare Pages    │
  │   │                      │  ← Zero downtime                      │
  │   │  Live on domain.com  │  ← CDN cache purge automatic          │
  │   │  Rollback available  │  ← Keep last 5 builds, one-click back │
  │   │  Health check        │  ← Verify 200 OK on key pages         │
  │   └──────────────────────┘                                       │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘`}</CodeBlock>
    </Section>

    <Section title="Build Engine" color={c.green} subtitle="The brain that turns page definitions into static sites.">
      <CodeBlock title="Build process (per domain)">{`async function buildDomain(domainId: string) {
  // 1. RESOLVE — Gather everything needed for this domain
  const domain = await db.domains.get(domainId);
  const pages = await db.pages.where({ domainId });       // all pages for domain
  const themeConfig = await db.themes.get(domain.themeId); // structural tokens
  const skinConfig = await db.skins.get(domain.skinId);    // color tokens
  const content = await db.content.where({ domainId, status: 'published' });

  // 2. SCAFFOLD — Create temp Astro project from base template
  const buildDir = \`/tmp/builds/\${domain.slug}\`;
  await scaffoldAstroProject(buildDir, {
    baseTemplate: '/templates/base',
    theme: themeConfig,    // writes to src/styles/theme.css as CSS variables
    skin: skinConfig,      // writes to src/styles/skin.css as CSS variables
  });

  // 3. ASSEMBLE — For each page, resolve its block sequence
  for (const page of pages) {
    const astroPage = assemblePageFromBlocks({
      route: page.route,         // e.g. '/' or '/best-auto-insurance'
      blocks: page.blocks,       // ordered block definitions
      content: content,          // content keyed by block ID
      blockRegistry: BLOCKS,     // available block components
    });
    await writeFile(\`\${buildDir}/src/pages/\${page.route}.astro\`, astroPage);
  }

  // 4. CONTENT — Write content collections for article-based pages
  for (const item of content.filter(c => c.type === 'article')) {
    await writeFile(\`\${buildDir}/src/content/articles/\${item.slug}.md\`, {
      frontmatter: item.frontmatter,
      body: item.body,
    });
  }

  // 5. BUILD — Run Astro build
  await exec(\`cd \${buildDir} && astro build\`);

  // 6. DEPLOY — Push to Cloudflare Pages
  const deployment = await wrangler.deploy({
    project: domain.cfProject,
    directory: \`\${buildDir}/dist\`,
    branch: isStaging ? 'staging' : 'main',
  });

  // 7. VERIFY — Health check key pages
  for (const page of pages) {
    const url = isStaging
      ? \`\${deployment.url}\${page.route}\`
      : \`https://\${domain.name}\${page.route}\`;
    await healthCheck(url); // verify 200 + content renders
  }

  // 8. LOG — Record deployment
  await db.deployments.create({
    domainId, status: 'success', url: deployment.url,
    buildTime: deployment.buildTime, pages: pages.length,
  });
}`}</CodeBlock>
    </Section>

    <Section title="Incremental Builds" color={c.orange} subtitle="Don't rebuild the entire site when one block changes.">
      <Grid cols={2}>
        <InfoCard title="Smart Rebuild Triggers" color={c.orange} items={[
          "Block content changed → rebuild only pages using that block",
          "Theme/skin changed → rebuild all pages (CSS vars cascade)",
          "New article published → rebuild index + new article page only",
          "Global component updated (Header) → rebuild all pages",
          "Affiliate link updated → rebuild pages containing that link",
        ]} />
        <InfoCard title="Build Queue System" color={c.cyan} items={[
          "BullMQ job queue (same as your ThottoPilot background jobs)",
          "Priority: manual deploys > content updates > bulk operations",
          "Parallel builds: up to 5 domains building simultaneously",
          "Build deduplication: multiple changes → single build (debounce 30s)",
          "Estimated: 78 domains × full rebuild = ~45 min parallel, ~8 min targeted",
        ]} />
      </Grid>
    </Section>

    <Section title="Rollback + Safety" color={c.red}>
      <Grid cols={3}>
        {[
          { title: "Instant Rollback", detail: "Cloudflare Pages keeps deployment history. One API call reverts to any previous build. No rebuild needed.", color: c.red },
          { title: "Deploy Lock", detail: "Lock a domain from deploys during high-traffic periods (e.g., open enrollment season). Queue builds for after.", color: c.orange },
          { title: "Canary Deploys", detail: "For SaaS: deploy to 10% of traffic first. Monitor error rates. Auto-promote or auto-rollback.", color: c.yellow },
          { title: "Pre-Deploy Checks", detail: "Lighthouse audit, broken link scan, affiliate link validation, schema.org testing — all automated before promotion.", color: c.green },
          { title: "Deploy Notifications", detail: "Slack/email on every deploy: which domain, what changed, current Lighthouse scores, build time.", color: c.blue },
          { title: "Audit Trail", detail: "Every deploy logged: who triggered it, what blocks changed, diff from previous, rollback available.", color: c.purple },
        ].map((item, i) => (
          <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ color: item.color, fontWeight: 700, fontSize: 12, fontFamily: mono, marginBottom: 6 }}>{item.title}</div>
            <div style={{ color: c.muted, fontSize: 11, lineHeight: 1.6 }}>{item.detail}</div>
          </div>
        ))}
      </Grid>
    </Section>

    <Section title="Updated Cost Model (v2)" color={c.green}>
      <Grid cols={3}>
        {[
          { item: "Cloudflare Pages", cost: "$0-20/mo", note: "Free: 500 builds/mo. Pro ($20): 5,000 builds. Unlimited bandwidth either way." },
          { item: "Build compute", cost: "$0", note: "CF Pages builds are free. GitHub Actions if you need more: 2,000 min free." },
          { item: "AI content gen", cost: "$80-250/mo", note: "Block-aware gen is more efficient (targeted prompts). Claude API + fallback to cheaper models for bulk." },
          { item: "Staging previews", cost: "$0", note: "CF Pages branch deploys are free. Every staging URL is a branch deploy." },
          { item: "Manager hosting", cost: "$25/mo", note: "Render (existing). Editor adds no extra infra — it's just React components." },
          { item: "Total monthly", cost: "$105-295/mo", note: "Scale: cost grows linearly with content volume, NOT with domain count." },
        ].map((item, i) => (
          <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ color: c.text, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{item.item}</div>
            <div style={{ color: c.green, fontSize: 18, fontWeight: 800, fontFamily: mono }}>{item.cost}</div>
            <div style={{ color: c.muted, fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>{item.note}</div>
          </div>
        ))}
      </Grid>
    </Section>
  </div>
);


// ─── MAIN APP ────────────────────────────────────────────────────
export default function TemplateSystemV2() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div style={{ background: c.bg, minHeight: "100vh", color: c.text, fontFamily: sans, padding: "24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Pill color={c.green} filled>v2.0</Pill>
            <Pill color={c.red}>REARCHITECTED</Pill>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.025em", color: c.textBright }}>
            Site Template System
          </h1>
          <div style={{ color: c.muted, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
            Composable blocks · Theme/skin separation · Visual editor · Block-aware AI content · Preview → Stage → Deploy
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 1, marginBottom: 28, background: c.surface,
          borderRadius: 10, padding: 3, overflowX: "auto",
        }}>
          {TABS.map((tab, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{
              padding: "9px 16px", border: "none", borderRadius: 8,
              background: activeTab === i ? c.card : "transparent",
              color: activeTab === i ? c.textBright : c.muted,
              cursor: "pointer", fontSize: 13, fontWeight: activeTab === i ? 700 : 400,
              transition: "all 0.15s", whiteSpace: "nowrap", fontFamily: sans,
              boxShadow: activeTab === i ? `0 1px 3px ${c.bg}` : "none",
            }}>
              <span style={{ marginRight: 6, opacity: 0.6 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 0 && <SystemDesignTab />}
        {activeTab === 1 && <BlockSystemTab />}
        {activeTab === 2 && <ThemeEngineTab />}
        {activeTab === 3 && <VisualEditorTab />}
        {activeTab === 4 && <ContentPipelineTab />}
        {activeTab === 5 && <DeployTab />}
      </div>
    </div>
  );
}
