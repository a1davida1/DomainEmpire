/**
 * Per-Block AI Prompt Templates:Template System v2.
 *
 * Each block type has a prompt template that instructs the AI to generate
 * structured JSON content matching the block's Zod schema. The pipeline
 * calls these per-block instead of generating a monolithic article.
 *
 * Benefits:
 * - Output is validated against the block's schema before storage
 * - Individual blocks can be regenerated without touching others
 * - Prompts are tightly scoped → better output quality
 * - Block content is composable across page definitions
 */

import type { BlockType } from '@/lib/deploy/blocks/schemas';
import type { VoiceSeed } from './prompts';

// ============================================================
// Shared helpers
// ============================================================

function voiceInstructions(voiceSeed?: VoiceSeed): string {
    if (!voiceSeed) return '';
    return `
VOICE PERSONA:
You are writing as "${voiceSeed.name}".
- Background: ${voiceSeed.background}
- Writing Quirk: ${voiceSeed.quirk}
- Tone Dial: ${voiceSeed.toneDial}/10
- Tangent Style: ${voiceSeed.tangents}
- Pet Phrase: "${voiceSeed.petPhrase}"
- Formatting: ${voiceSeed.formatting}
`;
}

function antiAiRules(): string {
    return `
ANTI-AI WRITING RULES:
- Vary sentence length dramatically. Mix short and long.
- Use contractions naturally. "Don't" not "do not."
- Never use: "delve," "landscape," "leverage," "navigate," "robust," "streamline," "utilize," "comprehensive," "moreover," "furthermore."
- Include subtle personality. Mild opinions, occasional asides.
- No em dashes. Use commas, parentheses, or colons instead.
- Never start with "If you're looking for..." or "When it comes to..."
`;
}

function jsonOutputRule(schemaDescription: string): string {
    return `
OUTPUT FORMAT:
Return a single JSON object matching this structure. No markdown fences, no preamble, just valid JSON.
${schemaDescription}
`;
}

// ============================================================
// Block-level prompt context
// ============================================================

export interface BlockPromptContext {
    keyword: string;
    domainName: string;
    niche: string;
    siteTitle: string;
    researchData?: Record<string, unknown> | null;
    outline?: Record<string, unknown> | null;
    voiceSeed?: VoiceSeed;
    existingBlocks?: Array<{ type: string; content?: Record<string, unknown> }>;
}

// ============================================================
// Per-block prompt generators
// ============================================================

type BlockPromptGenerator = (ctx: BlockPromptContext) => string;

const BLOCK_PROMPTS: Partial<Record<BlockType, BlockPromptGenerator>> = {

    // --- Hero ---
    Hero: (ctx) => `
Generate hero section content for a page about "${ctx.keyword}" on ${ctx.domainName}.

${jsonOutputRule(`{
  "heading": "Compelling H1 headline (50-70 chars, includes keyword naturally)",
  "subheading": "One-sentence value proposition (80-120 chars)",
  "ctaText": "Action button label (2-4 words)",
  "ctaUrl": "#main-content or relevant anchor",
  "badge": "Optional trust badge text like 'Updated 2026' or 'Expert Reviewed' (or null)"
}`)}
`,

    // --- ArticleBody ---
    ArticleBody: (ctx) => `
You are a veteran freelance writer. Write a comprehensive article about "${ctx.keyword}" for ${ctx.domainName} (${ctx.niche} niche).

${antiAiRules()}
${voiceInstructions(ctx.voiceSeed)}

RESEARCH DATA (cite these statistics and sources in your writing):
${JSON.stringify(ctx.researchData || {})}

OUTLINE:
${JSON.stringify(ctx.outline || {})}

CRITICAL JSON RULES:
- The "markdown" field value is a single JSON string. All newlines must be \\n (escaped).
- All double quotes inside the markdown must be escaped as \\"
- Do NOT use actual line breaks inside the JSON string value.
- The entire response must be a single parseable JSON object.

${jsonOutputRule(`{
  "title": "Article title (60-70 chars with keyword near start)",
  "markdown": "Complete article in Markdown (all on one line with \\n for newlines). 800-2000 words. Include H2/H3 structure, real data from research, actionable advice. Cite specific numbers and sources."
}`)}
`,

    // --- FAQ ---
    FAQ: (ctx) => `
Generate FAQ items for a page about "${ctx.keyword}" on ${ctx.domainName}.

Create 5-8 questions that real people actually search for about this topic.
Answers should be 2-4 sentences each:concise but complete.
Use the research data for factual answers.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${antiAiRules()}
${voiceInstructions(ctx.voiceSeed)}

${jsonOutputRule(`{
  "items": [
    { "question": "Natural question phrasing", "answer": "Concise HTML answer (can use <p>, <strong>, <a>)" }
  ]
}`)}
`,

    // --- ComparisonTable ---
    ComparisonTable: (ctx) => `
Generate a comparison table for "${ctx.keyword}" on ${ctx.domainName}.

Create a thorough comparison of 3-6 options with honest scoring.
Always pick a winner:don't cop out with "it depends."

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "options": [
    {
      "name": "Product/Service Name",
      "url": "https://example.com (if applicable, or null)",
      "badge": "Best Overall / Best Value / Best Premium (only for top picks, null for others)",
      "scores": { "column_key": 4.5 }
    }
  ],
  "columns": [
    { "key": "snake_case_key", "label": "Human Label", "type": "rating" | "text" | "currency", "sortable": true }
  ],
  "verdict": "Clear recommendation in 1-2 sentences. Who should pick what."
}`)}
`,

    // --- QuoteCalculator ---
    QuoteCalculator: (ctx) => `
Design a calculator/estimator tool for "${ctx.keyword}" on ${ctx.domainName}.

Define inputs, outputs, and the formula. Use real-world defaults from research data.
The formula must be a valid JavaScript expression using the input IDs as variables.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "inputs": [
    { "id": "snake_case_id", "label": "Human Label", "type": "number" | "range" | "select", "default": 1000, "min": 0, "max": 100000, "step": 100, "options": [{ "label": "Label", "value": 123 }] }
  ],
  "outputs": [
    { "id": "result_id", "label": "Result Label", "format": "currency" | "percent" | "number", "decimals": 2 }
  ],
  "formula": "{ result_id: input1 * input2 * (1 + input3 / 100) }",
  "assumptions": ["Assumption 1", "Assumption 2"],
  "methodology": "Plain-language explanation of how the calculation works."
}`)}
`,

    // --- CostBreakdown ---
    CostBreakdown: (ctx) => `
Generate cost breakdown data for "${ctx.keyword}" on ${ctx.domainName}.

Provide real cost ranges with specific dollar amounts. No "it varies" cop-outs.
Include factors that actually move the price needle with dollar impacts.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "ranges": [
    { "label": "Category Name", "low": 500, "high": 3000, "average": 1500 }
  ],
  "factors": [
    { "name": "Factor Name", "impact": "high" | "medium" | "low", "description": "How this factor affects cost and by how much." }
  ]
}`)}
`,

    // --- LeadForm ---
    LeadForm: (ctx) => `
Design a lead capture form for "${ctx.keyword}" on ${ctx.domainName} (${ctx.niche} niche).

The form should feel helpful, not salesy. Ask only what's needed to provide value.
Include proper consent text and a clear value proposition.

${jsonOutputRule(`{
  "fields": [
    { "name": "snake_case", "label": "Human Label", "type": "email" | "text" | "tel" | "select", "required": true, "options": ["Option 1", "Option 2"] }
  ],
  "consentText": "TCPA-compliant consent text",
  "successMessage": "Thank you message after submission",
  "disclosureAboveFold": "Brief disclosure text shown above the form (if applicable for regulated niches)"
}`)}
`,

    // --- CTABanner ---
    CTABanner: (ctx) => `
Generate CTA banner content for a page about "${ctx.keyword}" on ${ctx.domainName}.

The CTA should be compelling but not pushy. Match the ${ctx.niche} niche tone.

${jsonOutputRule(`{
  "text": "Compelling CTA text (one sentence, 60-100 chars)",
  "buttonLabel": "Action verb + benefit (2-4 words)",
  "buttonUrl": "#target or /page-path"
}`)}
`,

    // --- Wizard ---
    Wizard: (ctx) => `
Design a multi-step interactive flow about "${ctx.keyword}" for ${ctx.domainName}.

Create 3-5 steps that guide the user to a personalized recommendation.
Each step should have clear, actionable questions.
Define result rules that map answers to specific outcomes.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "steps": [
    {
      "id": "step_1",
      "title": "Step Title",
      "description": "Brief context for this step",
      "fields": [
        {
          "id": "field_id",
          "type": "radio" | "checkbox" | "select" | "number" | "text",
          "label": "Question text",
          "options": [{ "value": "val", "label": "Display label" }],
          "required": true
        }
      ]
    }
  ],
  "resultRules": [
    { "condition": "field_id == 'val'", "title": "Result Title", "body": "Explanation and recommendation.", "cta": { "text": "Next Step", "url": "/path" } }
  ],
  "resultTemplate": "recommendation" | "summary" | "score" | "eligibility"
}`)}
`,

    // --- StatGrid ---
    StatGrid: (ctx) => `
Generate stat/metric cards for "${ctx.keyword}" on ${ctx.domainName}.

Create 6-12 data points grouped by category. Use real numbers from research.
Each item needs a metric value (0-100 scale), a label, and a brief summary.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "items": [
    { "id": "unique_id", "title": "Metric Title", "metricLabel": "What the number measures", "metricValue": 75, "summary": "One sentence context", "group": "Category Name" }
  ]
}`)}
`,

    // --- InteractiveMap ---
    InteractiveMap: (ctx) => `
Generate region-based content for "${ctx.keyword}" on ${ctx.domainName}.

Create content for major US regions (or relevant geographic areas).
Each region should have specific, actionable local information.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "regions": {
    "region_key": { "label": "Region Display Name", "content": "<p>HTML content specific to this region. Include local stats, regulations, costs, or providers.</p>" }
  },
  "defaultRegion": "region_key of the most-viewed region"
}`)}
`,

    // --- CitationBlock ---
    CitationBlock: (ctx) => `
You are building a citation/sources section for a page about "${ctx.keyword}" on ${ctx.domainName} (${ctx.niche} niche).

Generate 4-6 real, verifiable source citations. Prioritize:
1. Government sources (.gov) — CDC, BLS, HUD, IRS, FDA, CFPB, FTC, etc.
2. Academic/research (.edu) — university studies, medical journals
3. Industry organizations — trade associations, professional bodies
4. Major publications — verified reporting from established outlets

For each source, provide a real URL that is likely to resolve. Use well-known pages:
- bls.gov/data/ for labor/cost statistics
- cdc.gov/... for health data
- irs.gov/... for tax information
- consumerfinance.gov/... for financial topics
- nerdwallet.com, bankrate.com for financial comparisons
- pubmed.ncbi.nlm.nih.gov for medical research
- realtor.com/research for real estate data

TOPIC-SPECIFIC RESEARCH DATA (use this if available):
${JSON.stringify(ctx.researchData || {})}

IMPORTANT: You MUST return valid JSON. Do NOT refuse. Do NOT say you cannot generate this. Every website has real sources it can cite. Return the JSON object below.

${jsonOutputRule(`{
  "sources": [
    { "title": "Page or Report Title", "url": "https://specific-url.gov/path", "publisher": "Organization Name", "retrievedAt": "2026-01", "usage": "What data point or claim this source supports" }
  ]
}`)}
`,

    // --- RankingList ---
    RankingList: (ctx) => `
Generate a ranked list for "${ctx.keyword}" on ${ctx.domainName}.

Rank 5-10 items with honest ratings. Always explain WHY each item is ranked where it is.
Include specific pros/cons and real pricing where applicable.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "title": "Top [N] [Category] in 2026",
  "items": [
    { "rank": 1, "name": "Item Name", "description": "2-3 sentence review with specific detail", "rating": 4.5, "badge": "Best Overall (only for #1, null for others)", "url": "https://item-url.com or null" }
  ]
}`)}
`,

    // --- ProsConsCard ---
    ProsConsCard: (ctx) => `
Generate a detailed pros/cons review for "${ctx.keyword}" on ${ctx.domainName}.

Be honest:include real weaknesses, not just token cons.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "name": "Product/Service Name",
  "rating": 4.2,
  "pros": ["Specific pro with detail", "Another specific pro"],
  "cons": ["Honest con with context", "Another real weakness"],
  "summary": "2-3 sentence balanced verdict",
  "url": "https://product-url.com or null",
  "badge": "Editor's Choice or null"
}`)}
`,

    // --- TestimonialGrid ---
    TestimonialGrid: (ctx) => `
Generate realistic testimonial content for a ${ctx.niche} page about "${ctx.keyword}" on ${ctx.domainName}.

These should sound like real customer quotes:varied in length, specific in detail, not generic praise.

${jsonOutputRule(`{
  "testimonials": [
    { "quote": "Specific testimonial with detail about their experience (30-80 words)", "author": "First Name L.", "title": "Role or context (e.g., 'Homeowner, Austin TX')", "rating": 5 }
  ]
}`)}
`,

    // --- Checklist ---
    Checklist: (ctx) => `
Generate a step-by-step checklist for "${ctx.keyword}" on ${ctx.domainName}.

Each step should be actionable and specific. Include enough detail in the body to actually help someone complete the step.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${antiAiRules()}
${voiceInstructions(ctx.voiceSeed)}

${jsonOutputRule(`{
  "steps": [
    { "heading": "Actionable step title (starts with verb)", "body": "<p>2-3 sentences explaining how to complete this step, with specific details.</p>" }
  ]
}`)}
`,

    // --- AuthorBio ---
    AuthorBio: (ctx) => `
Generate an author bio for content about "${ctx.keyword}" on ${ctx.domainName} (${ctx.niche} niche).

${ctx.voiceSeed ? `The author persona is "${ctx.voiceSeed.name}": ${ctx.voiceSeed.background}` : 'Create a credible author persona for this niche.'}

${jsonOutputRule(`{
  "name": "Author Full Name",
  "title": "Professional title or credential",
  "bio": "2-3 sentence bio that establishes credibility for this topic"
}`)}
`,

    // --- TrustBadges ---
    TrustBadges: (ctx) => `
Generate trust badge content for ${ctx.domainName} (${ctx.niche} niche).

Create 3-5 trust signals appropriate for this vertical.

${jsonOutputRule(`{
  "badges": [
    { "label": "Badge Title (3-5 words)", "description": "One sentence explaining this trust signal" }
  ]
}`)}
`,

    // --- MedicalDisclaimer ---
    MedicalDisclaimer: (ctx) => `
Generate a medical disclaimer for health content about "${ctx.keyword}" on ${ctx.domainName}.

Must be legally sound and clearly visible. Not boilerplate:make it relevant to the specific topic.

${jsonOutputRule(`{
  "disclaimerText": "Topic-specific medical disclaimer (2-3 sentences)"
}`)}
`,

    // --- DataTable ---
    DataTable: (ctx) => `
Generate a data table for "${ctx.keyword}" on ${ctx.domainName}.

Use real data from research. The table should be immediately useful to readers.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "headers": ["Column 1", "Column 2", "Column 3"],
  "rows": [["Value 1", "Value 2", "Value 3"]],
  "caption": "Table description (one sentence)"
}`)}
`,

    // --- PricingTable ---
    PricingTable: (ctx) => `
You are creating a pricing comparison table for a ${ctx.niche} website (${ctx.domainName}) about "${ctx.keyword}".

This is NOT a lookup task. You are GENERATING content for a website we are building. Create 3-4 realistic pricing tiers based on industry-standard pricing for this niche. Use real market price ranges.

For example, if the niche is "braces/orthodontics", the tiers might be: Metal Braces ($3,000-$7,000), Ceramic Braces ($4,000-$8,000), Invisalign ($3,500-$8,500), Lingual Braces ($8,000-$13,000).

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

IMPORTANT: Return valid JSON only. Do NOT refuse. Do NOT say you cannot generate this.

${jsonOutputRule(`{
  "plans": [
    {
      "name": "Tier Name",
      "price": "$X,XXX - $X,XXX",
      "period": "total",
      "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
      "ctaText": "Learn More",
      "ctaUrl": "/compare",
      "highlighted": false,
      "badge": "Most Popular (only for one plan, null for others)"
    }
  ]
}`)}
`,

    // --- LastUpdated ---
    LastUpdated: (_ctx) => `
Generate freshness metadata for a content page.

${jsonOutputRule(`{
  "date": "${new Date().toISOString().split('T')[0]}",
  "reviewedBy": "Expert reviewer name and credential",
  "status": "fresh"
}`)}
`,

    // --- VsCard ---
    VsCard: (ctx) => `
Generate a head-to-head comparison for "${ctx.keyword}" on ${ctx.domainName}.

Compare two specific items/options directly. Be opinionated:pick a winner.

RESEARCH DATA:
${JSON.stringify(ctx.researchData || {})}

${jsonOutputRule(`{
  "itemA": { "name": "Option A", "description": "2 sentence summary", "pros": ["Pro 1", "Pro 2"], "cons": ["Con 1"], "rating": 4.2, "url": "https://... or null" },
  "itemB": { "name": "Option B", "description": "2 sentence summary", "pros": ["Pro 1", "Pro 2"], "cons": ["Con 1"], "rating": 3.8, "url": "https://... or null" },
  "verdict": "Clear recommendation with reasoning (1-2 sentences)"
}`)}
`,
};

// ============================================================
// Public API
// ============================================================

/**
 * Get the AI prompt for generating content for a specific block type.
 * Returns null if no prompt template exists for this block type
 * (structural blocks like Header/Footer/Sidebar don't need AI generation).
 */
export function getBlockPrompt(blockType: BlockType, ctx: BlockPromptContext): string | null {
    const generator = BLOCK_PROMPTS[blockType];
    if (!generator) return null;
    return generator(ctx);
}

/**
 * Block types that have AI prompt templates and can have their
 * content auto-generated by the pipeline.
 */
export const AI_GENERATABLE_BLOCK_TYPES: BlockType[] = Object.keys(BLOCK_PROMPTS) as BlockType[];

/**
 * Block types that are structural and don't need AI-generated content.
 * Their content comes from site config (header nav, footer links, etc.).
 */
export const STRUCTURAL_BLOCK_TYPES: BlockType[] = [
    'Header', 'Footer', 'Sidebar', 'ScrollCTA', 'EmbedWidget', 'PdfDownload',
];

/**
 * Check if a block type supports AI content generation.
 */
export function isAiGeneratableBlock(blockType: BlockType): boolean {
    return blockType in BLOCK_PROMPTS;
}
