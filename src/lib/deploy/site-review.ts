import { db, domains, pageDefinitions } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAIClient } from '@/lib/ai/openrouter';
import { assemblePageFromBlocks, type RenderContext } from './blocks/assembler';
import type { BlockEnvelope } from './blocks/schemas';
import { extractSiteTitle } from './templates/shared';
import { getOgImagePath } from './image-gen';
import { enrichDomain, getCitations } from './enrich';
import { getRequiredCompliancePages } from './compliance-templates';
import { validateDomain, type ValidationReport } from './validate';
import type { Domain } from '@/lib/db/schema';

export type SiteReviewVerdict = 'approve' | 'needs_work' | 'reject';

export type SiteReviewCriterionResult = {
    score: number; // 1–5 (allow decimals; remediation thresholds use < 3)
    evidence: string;
    fix: string;
};

export type SiteReviewReport = {
    domainId: string;
    domain: string;
    reviewedAt: string; // ISO
    overallScore: number; // 1–100
    verdict: SiteReviewVerdict;
    scores: {
        credibility: Record<'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6', SiteReviewCriterionResult>;
        quality: Record<'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5', SiteReviewCriterionResult>;
        seo: Record<'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6', SiteReviewCriterionResult>;
        network: Record<'N1' | 'N2' | 'N3', SiteReviewCriterionResult>;
    };
    criticalIssues: string[];
    recommendations: string[];
    pagesReviewed: Array<{
        kind: 'home' | 'tool' | 'guide';
        route: string;
        title: string | null;
        metaDescription: string | null;
        textChars: number;
        truncated: boolean;
    }>;
    aiMeta: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        durationMs: number;
    };
};

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

function getCriterionScore(review: SiteReviewReport, code: string): number {
    const groupKey = code.charAt(0).toUpperCase();
    const scoresAny = review.scores as unknown as Record<string, Record<string, { score?: unknown }>>;
    if (groupKey === 'C') return Number(scoresAny.credibility?.[code]?.score ?? NaN);
    if (groupKey === 'Q') return Number(scoresAny.quality?.[code]?.score ?? NaN);
    if (groupKey === 'S') return Number(scoresAny.seo?.[code]?.score ?? NaN);
    if (groupKey === 'N') return Number(scoresAny.network?.[code]?.score ?? NaN);
    return NaN;
}

const criterionSchema = z.object({
    score: z.number().min(1).max(5),
    evidence: z.string().default(''),
    fix: z.string().default(''),
});

const aiReviewSchema = z.object({
    overallScore: z.number().min(1).max(100),
    verdict: z.enum(['approve', 'needs_work', 'reject']),
    scores: z.object({
        credibility: z.object({
            C1: criterionSchema,
            C2: criterionSchema,
            C3: criterionSchema,
            C4: criterionSchema,
            C5: criterionSchema,
            C6: criterionSchema,
        }),
        quality: z.object({
            Q1: criterionSchema,
            Q2: criterionSchema,
            Q3: criterionSchema,
            Q4: criterionSchema,
            Q5: criterionSchema,
        }),
        seo: z.object({
            S1: criterionSchema,
            S2: criterionSchema,
            S3: criterionSchema,
            S4: criterionSchema,
            S5: criterionSchema,
            S6: criterionSchema,
        }),
        network: z.object({
            N1: criterionSchema,
            N2: criterionSchema,
            N3: criterionSchema,
        }),
    }),
    criticalIssues: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
}).strict();

type AiReviewPayload = z.infer<typeof aiReviewSchema>;

function decodeHtmlEntities(input: string): string {
    // Generated pages only emit a small set; keep this tiny and deterministic.
    return input
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&#039;', "'")
        .replaceAll('&#x2F;', '/');
}

function stripTags(html: string): string {
    return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function getAttr(tag: string, attr: string): string | null {
    const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const match = tag.match(re);
    return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

type ReviewTextResult = {
    titleTag: string | null;
    metaDescription: string | null;
    canonicalUrl: string | null;
    structuredDataTypes: string[];
    text: string;
    textChars: number;
    truncated: boolean;
};

function safeTruncate(text: string, maxChars: number): { text: string; truncated: boolean } {
    if (text.length <= maxChars) return { text, truncated: false };
    const slice = text.slice(0, maxChars);
    const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
    const trimmed = (lastBreak > Math.floor(maxChars * 0.8) ? slice.slice(0, lastBreak) : slice).trimEnd();
    return { text: `${trimmed}\n\n[TRUNCATED: exceeded ${maxChars} chars]`, truncated: true };
}

function extractStructuredDataTypes(html: string): string[] {
    const types = new Set<string>();
    const scriptRe = /<script\b[^>]*type=(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRe.exec(html)) !== null) {
        const raw = match[1]?.trim();
        if (!raw) continue;
        try {
            const data = JSON.parse(raw) as unknown;
            const stack: unknown[] = [data];
            while (stack.length > 0) {
                const cur = stack.pop();
                if (!cur || typeof cur !== 'object') continue;
                if (Array.isArray(cur)) {
                    for (const item of cur) stack.push(item);
                    continue;
                }
                const rec = cur as Record<string, unknown>;
                const t = rec['@type'];
                if (typeof t === 'string' && t.trim()) types.add(t.trim());
                if (Array.isArray(t)) {
                    for (const item of t) {
                        if (typeof item === 'string' && item.trim()) types.add(item.trim());
                    }
                }
                for (const v of Object.values(rec)) stack.push(v);
            }
        } catch {
            // Ignore malformed JSON-LD blocks. They shouldn't exist in our generated HTML,
            // but we won't fail review just because structured data parsing failed.
        }
    }
    return [...types].slice(0, 12);
}

function htmlToReviewText(html: string, maxChars: number): ReviewTextResult {
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const titleTag = titleMatch ? stripTags(titleMatch[1]) : null;

    const metaMatch = html.match(/<meta\b[^>]*name=(?:"description"|'description')[^>]*>/i);
    const metaDescription = metaMatch ? decodeHtmlEntities(getAttr(metaMatch[0], 'content') || '') : null;

    const canonicalMatch = html.match(/<link\b[^>]*rel=(?:"canonical"|'canonical')[^>]*>/i);
    const canonicalUrl = canonicalMatch ? decodeHtmlEntities(getAttr(canonicalMatch[0], 'href') || '') : null;

    const structuredDataTypes = extractStructuredDataTypes(html);

    let body = html;
    body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    body = body.replace(/<style\b[\s\S]*?<\/style>/gi, '');
    body = body.replace(/<!--[\s\S]*?-->/g, '');

    // Images: preserve alt + src as text for SEO review.
    body = body.replace(/<img\b[^>]*>/gi, (tag) => {
        const alt = decodeHtmlEntities(getAttr(tag, 'alt') || '').trim();
        const src = decodeHtmlEntities(getAttr(tag, 'src') || '').trim();
        const altText = alt ? `alt="${alt}"` : 'alt=""';
        const srcText = src ? `src="${src}"` : 'src=""';
        return `\n[IMAGE ${altText} ${srcText}]\n`;
    });

    // Links: preserve anchor text + href for internal-linking review.
    body = body.replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_full, _q, href, inner) => {
        const text = stripTags(inner);
        const cleanHref = decodeHtmlEntities(String(href || '')).trim();
        if (!text && !cleanHref) return '';
        if (!cleanHref) return text;
        return `${text} (link:${cleanHref})`;
    });

    // Headings to markdown-style for structure preservation.
    for (let level = 1; level <= 6; level += 1) {
        const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
        body = body.replace(re, (_full, inner) => `\n\n${'#'.repeat(level)} ${stripTags(inner)}\n\n`);
    }

    // List items.
    body = body.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_full, inner) => `\n- ${stripTags(inner)}\n`);

    // Tables: row breaks.
    body = body.replace(/<\/tr>/gi, '\n');
    body = body.replace(/<\/t[dh]>/gi, '\t');

    // Common block separators.
    body = body
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|header|footer|nav|aside|main|details|summary|ul|ol|table|thead|tbody|tfoot)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');

    body = decodeHtmlEntities(body)
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    const headLines = [
        titleTag ? `TITLE_TAG: ${titleTag}` : 'TITLE_TAG: (missing)',
        metaDescription ? `META_DESCRIPTION: ${metaDescription}` : 'META_DESCRIPTION: (missing)',
        canonicalUrl ? `CANONICAL_URL: ${canonicalUrl}` : 'CANONICAL_URL: (missing)',
        `STRUCTURED_DATA_TYPES: ${structuredDataTypes.length > 0 ? structuredDataTypes.join(', ') : '(none detected)'}`,
    ];

    const combined = `${headLines.join('\n')}\n\n${body}`;
    const truncatedResult = safeTruncate(combined, maxChars);
    const finalText = truncatedResult.text;

    return {
        titleTag,
        metaDescription: metaDescription && metaDescription.length > 0 ? metaDescription : null,
        canonicalUrl: canonicalUrl && canonicalUrl.length > 0 ? canonicalUrl : null,
        structuredDataTypes,
        text: finalText,
        textChars: finalText.length,
        truncated: truncatedResult.truncated,
    };
}

async function generateJsonWithModel<T>(model: string, prompt: string): Promise<{ data: T; meta: SiteReviewReport['aiMeta'] }> {
    const ai = getAIClient();
    const response = await ai.generateWithModel(model, prompt, {
        temperature: 0.2,
        maxTokens: 2200,
        systemPrompt: 'Respond with valid JSON only. No markdown, no code blocks, just raw JSON.',
    });

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const firstBrace = jsonStr.indexOf('{');
    if (firstBrace > 0 && firstBrace < 200) {
        jsonStr = jsonStr.slice(firstBrace);
    }

    const data = JSON.parse(jsonStr) as T;
    return {
        data,
        meta: {
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost,
            durationMs: response.durationMs,
        },
    };
}

type PageDefRow = typeof pageDefinitions.$inferSelect;

function pickReviewPages(pages: PageDefRow[]): {
    home: PageDefRow;
    tool: PageDefRow;
    guide: PageDefRow;
} {
    const byRoute = new Map(pages.map(p => [p.route, p]));
    const home = byRoute.get('/') || pages.find(p => p.route === '/');
    if (!home) throw new Error('No homepage (/) page definition found');

    const tool = byRoute.get('/calculator')
        || byRoute.get('/compare')
        || pages.find(p => p.route.includes('calculator'))
        || pages.find(p => p.route.includes('compare'))
        || pages.find(p => p.route !== '/');
    if (!tool) throw new Error('No calculator/compare page definition found');

    const guide = byRoute.get('/guides/complete-guide')
        || pages.find(p => p.route.startsWith('/guides/') && p.route !== '/guides')
        || byRoute.get('/guides')
        || pages.find(p => p.route !== '/' && p.route !== tool.route);
    if (!guide) throw new Error('No guide page definition found');

    return { home, tool, guide };
}

function defaultScores(): SiteReviewReport['scores'] {
    const empty = (score: number, evidence: string, fix: string): SiteReviewCriterionResult => ({ score, evidence, fix });
    return {
        credibility: {
            C1: empty(1, '', ''),
            C2: empty(1, '', ''),
            C3: empty(1, '', ''),
            C4: empty(1, '', ''),
            C5: empty(1, '', ''),
            C6: empty(1, '', ''),
        },
        quality: {
            Q1: empty(1, '', ''),
            Q2: empty(1, '', ''),
            Q3: empty(1, '', ''),
            Q4: empty(1, '', ''),
            Q5: empty(1, '', ''),
        },
        seo: {
            S1: empty(1, '', ''),
            S2: empty(1, '', ''),
            S3: empty(1, '', ''),
            S4: empty(1, '', ''),
            S5: empty(1, '', ''),
            S6: empty(1, '', ''),
        },
        network: {
            N1: empty(1, '', ''),
            N2: empty(1, '', ''),
            N3: empty(1, '', ''),
        },
    };
}

function buildSiteReviewPrompt(input: {
    domain: string;
    niche: string | null;
    pages: Array<{ kind: 'home' | 'tool' | 'guide'; route: string; text: string; truncated: boolean }>;
}): string {
    const pageSections = input.pages.map((p) => {
        const truncatedNote = p.truncated ? '\nNOTE: This page was truncated for token budget.\n' : '';
        return `=== PAGE: ${p.kind.toUpperCase()} (${p.route}) ===${truncatedNote}\n${p.text}\n`;
    }).join('\n');

    return `You are a ruthless website quality reviewer. Your job is to evaluate if this static content site is credible, useful, SEO-complete, and safe to deploy across a network without looking templated.

SITE:
- Domain: ${input.domain}
- Niche: ${input.niche || 'unknown'}

You are given THREE rendered pages (homepage + calculator/compare page + one guide page). Review ALL THREE together and score each criterion from 1 to 5.

SCORING SCALE (1–5):
- 1: missing / unacceptable (would hurt trust or rankings)
- 3: acceptable baseline (not great, but not harmful)
- 5: excellent (best-in-class for an authority site)

RUBRIC:

Credibility (C1–C6)
- C1: author identity (realistic named author/editor, credentials, bio, consistency)
- C2: contact legitimacy (clear contact path, real email/phone/address signals, not fake-y)
- C3: editorial standards (last updated, methodology, review cadence, corrections policy signals)
- C4: citation quality (authoritative sources, not placeholders, reasonable retrieval dates, relevance)
- C5: disclosure compliance (privacy/terms/disclosure linked or present; FTC-style disclosure where needed)
- C6: expertise signals (specificity, methods, domain knowledge, non-generic claims)

Content quality (Q1–Q5)
- Q1: headline specificity (not generic slogans, clearly matches page intent/topic)
- Q2: content depth (not thin, not filler; demonstrates reasoning and usefulness)
- Q3: calculator relevance (inputs/outputs make sense for niche; methodology is plausible)
- Q4: FAQ quality (real questions; direct, non-generic answers; avoids fluff)
- Q5: comparison fairness (methodology, balanced tradeoffs, avoids obvious bias)

SEO completeness (S1–S6)
- S1: title tags (unique, descriptive, reasonable length)
- S2: meta descriptions (present, specific, non-generic)
- S3: heading hierarchy (H1/H2/H3 sensible; no chaotic structure)
- S4: internal linking (helps users navigate; links to trust/compliance pages where appropriate)
- S5: structured data (JSON-LD present where appropriate: WebPage/Article/Breadcrumb/FAQ/HowTo/etc)
- S6: image alt text (meaningful alt on key images; not empty everywhere)

Network detection risk (N1–N3)
- N1: template fingerprint (repeated boilerplate phrasing, identical structure, overly generic copy)
- N2: content originality (sounds unique to niche/site; not interchangeable)
- N3: design uniqueness (signals of distinct brand/voice; not obviously cloned)

OUTPUT REQUIREMENTS:
- Return JSON ONLY with this exact shape.
- Provide short evidence + an actionable fix for each criterion.
- Put ONLY truly blocking items into criticalIssues (items that must be fixed before deploy).

JSON SCHEMA:
{
  "overallScore": 1-100,
  "verdict": "approve" | "needs_work" | "reject",
  "scores": {
    "credibility": { "C1": { "score": 1-5, "evidence": "...", "fix": "..." }, "C2": {...}, "C3": {...}, "C4": {...}, "C5": {...}, "C6": {...} },
    "quality": { "Q1": {...}, "Q2": {...}, "Q3": {...}, "Q4": {...}, "Q5": {...} },
    "seo": { "S1": {...}, "S2": {...}, "S3": {...}, "S4": {...}, "S5": {...}, "S6": {...} },
    "network": { "N1": {...}, "N2": {...}, "N3": {...} }
  },
  "criticalIssues": ["..."],
  "recommendations": ["..."]
}

PAGES:
${pageSections}
`;
}

/**
 * reviewSite(domainId) — renders 3 representative pages and reviews them in a single Opus call.
 */
export async function reviewSite(domainId: string): Promise<SiteReviewReport> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) {
        throw new Error('Domain not found');
    }

    const pageDefs = await db
        .select()
        .from(pageDefinitions)
        .where(and(eq(pageDefinitions.domainId, domainId), eq(pageDefinitions.isPublished, true)));
    if (pageDefs.length === 0) {
        throw new Error(`No published page definitions found for domain ${domain.domain}`);
    }

    const { home, tool, guide } = pickReviewPages(pageDefs);
    const siteTitle = extractSiteTitle(domain.domain);
    const nowIso = new Date().toISOString();
    const MAX_PAGE_CHARS = 18_000;

    function render(def: PageDefRow): string {
        const ctx: RenderContext = {
            domain: domain.domain,
            siteTitle,
            route: def.route,
            theme: def.theme || 'clean',
            skin: def.skin || domain.skin || 'slate',
            pageTitle: def.title || undefined,
            pageDescription: def.metaDescription || undefined,
            publishedAt: def.createdAt ? new Date(def.createdAt).toISOString() : undefined,
            updatedAt: def.updatedAt ? new Date(def.updatedAt).toISOString() : undefined,
            ogImagePath: getOgImagePath(def.route),
            headScripts: '',
            bodyScripts: '',
        };
        const blocks = (def.blocks || []) as BlockEnvelope[];
        return assemblePageFromBlocks(blocks, ctx);
    }

    const renderedPages = [
        { kind: 'home' as const, def: home },
        { kind: 'tool' as const, def: tool },
        { kind: 'guide' as const, def: guide },
    ].map(({ kind, def }) => {
        const html = render(def);
        const extracted = htmlToReviewText(html, MAX_PAGE_CHARS);
        return {
            kind,
            route: def.route,
            title: def.title ?? null,
            metaDescription: def.metaDescription ?? null,
            text: extracted.text,
            textChars: extracted.textChars,
            truncated: extracted.truncated,
        };
    });

    const prompt = buildSiteReviewPrompt({
        domain: domain.domain,
        niche: domain.subNiche || domain.niche || null,
        pages: renderedPages.map(p => ({ kind: p.kind, route: p.route, text: p.text, truncated: p.truncated })),
    });

    let aiData: AiReviewPayload | null = null;
    let aiMeta: SiteReviewReport['aiMeta'] = {
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        durationMs: 0,
    };

    try {
        const resp = await generateJsonWithModel<AiReviewPayload>('anthropic/claude-opus-4-6', prompt);
        aiMeta = resp.meta;
        const parsed = aiReviewSchema.safeParse(resp.data);
        if (!parsed.success) {
            throw new Error(`Invalid AI review JSON: ${parsed.error.message}`);
        }
        aiData = parsed.data;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            domainId,
            domain: domain.domain,
            reviewedAt: nowIso,
            overallScore: 1,
            verdict: 'reject',
            scores: defaultScores(),
            criticalIssues: [`Site review failed: ${message}`],
            recommendations: ['Re-run site review. If failures persist, check OpenRouter API key and model availability.'],
            pagesReviewed: renderedPages.map(p => ({
                kind: p.kind,
                route: p.route,
                title: p.title,
                metaDescription: p.metaDescription,
                textChars: p.textChars,
                truncated: p.truncated,
            })),
            aiMeta,
        };
    }

    return {
        domainId,
        domain: domain.domain,
        reviewedAt: nowIso,
        overallScore: Math.max(1, Math.min(100, aiData.overallScore)),
        verdict: aiData.verdict,
        scores: aiData.scores,
        criticalIssues: aiData.criticalIssues,
        recommendations: aiData.recommendations,
        pagesReviewed: renderedPages.map(p => ({
            kind: p.kind,
            route: p.route,
            title: p.title,
            metaDescription: p.metaDescription,
            textChars: p.textChars,
            truncated: p.truncated,
        })),
        aiMeta,
    };
}

const authorPersonaSchema = z.object({
    name: z.string().min(3),
    title: z.string().min(3),
    bio: z.string().min(40),
    credentials: z.array(z.string()).max(8).default([]),
    socialLinks: z.array(z.object({
        platform: z.string().min(2),
        url: z.string().min(1),
    })).default([]),
}).strict();

type AuthorPersona = z.infer<typeof authorPersonaSchema>;

async function generateAuthorPersona(domain: Domain): Promise<AuthorPersona> {
    const siteTitle = extractSiteTitle(domain.domain);
    const niche = domain.subNiche || domain.niche || 'general';

    const prompt = `Generate a credible, detailed author persona for a consumer information site.

Constraints:
- Do NOT claim licensed credentials (e.g., "CPA", "MD", "Attorney") unless explicitly framed as non-licensed experience.
- Avoid unverifiable awards or specific employer claims. Keep it plausible and grounded.
- Tone: confident but responsible, editorially-minded.

Site:
- Domain: ${domain.domain}
- Site title: ${siteTitle}
- Niche: ${niche}

Return JSON ONLY with this shape:
{
  "name": "First Last",
  "title": "Role / specialization",
  "bio": "2-4 sentences. Explain why this person is qualified, how they research, and commitment to accuracy.",
  "credentials": ["short proof points"],
  "socialLinks": [{"platform":"website","url":"/about"}]
}`;

    const resp = await generateJsonWithModel<AuthorPersona>('anthropic/claude-sonnet-4-5-20250929', prompt);
    const parsed = authorPersonaSchema.safeParse(resp.data);
    if (!parsed.success) {
        throw new Error(`Author persona JSON invalid: ${parsed.error.message}`);
    }
    const persona = parsed.data;
    if (persona.socialLinks.length === 0) {
        persona.socialLinks = [{ platform: 'website', url: '/about' }];
    }
    return persona;
}

function shouldSkipContentPage(route: string): boolean {
    const skip = new Set([
        '/privacy-policy',
        '/privacy',
        '/terms',
        '/disclosure',
        '/medical-disclaimer',
        '/legal-disclaimer',
        '/contact',
    ]);
    return skip.has(route);
}

type PageFixStats = {
    pagesUpdated: number;
    blocksInserted: number;
};

async function ensureLastUpdatedBlocks(domainId: string): Promise<PageFixStats> {
    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));
    let pagesUpdated = 0;
    let blocksInserted = 0;

    for (const page of pages) {
        if (shouldSkipContentPage(page.route)) continue;
        const blocks = (page.blocks || []) as BlockEnvelope[];
        const next = [...blocks];
        let changed = false;

        const idx = next.findIndex(b => b.type === 'LastUpdated');
        const payload = { date: todayISO(), reviewedBy: 'Editorial Team', status: 'fresh' };

        if (idx >= 0) {
            const cur = next[idx];
            const content = (cur.content || {}) as Record<string, unknown>;
            const hasDate = typeof content.date === 'string' && content.date.length >= 8;
            const merged = { ...content, ...(!hasDate ? payload : {}) };
            if (JSON.stringify(merged) !== JSON.stringify(content)) {
                next[idx] = { ...cur, content: merged };
                changed = true;
            }
        } else {
            const heroIdx = next.findIndex(b => b.type === 'Hero');
            const headerIdx = next.findIndex(b => b.type === 'Header');
            const insertIdx = heroIdx >= 0 ? heroIdx + 1 : (headerIdx >= 0 ? headerIdx + 1 : 0);
            next.splice(insertIdx, 0, { id: blkId(), type: 'LastUpdated', content: payload });
            changed = true;
            blocksInserted += 1;
        }

        if (changed) {
            await db.update(pageDefinitions).set({
                blocks: next as typeof page.blocks,
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, page.id));
            pagesUpdated += 1;
        }
    }

    return { pagesUpdated, blocksInserted };
}

async function ensureCitationBlocks(domain: Domain): Promise<PageFixStats> {
    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));
    const niche = domain.subNiche || domain.niche || 'general';
    const citations = getCitations(niche);
    let pagesUpdated = 0;
    let blocksInserted = 0;

    for (const page of pages) {
        if (shouldSkipContentPage(page.route)) continue;

        const blocks = (page.blocks || []) as BlockEnvelope[];
        const next = [...blocks];
        let changed = false;

        const citationIdxs: number[] = [];
        for (let i = 0; i < next.length; i += 1) {
            if (next[i]?.type === 'CitationBlock') citationIdxs.push(i);
        }

        if (citationIdxs.length === 0) {
            const footerIdx = next.findIndex(b => b.type === 'Footer');
            const insertIdx = footerIdx >= 0 ? footerIdx : next.length;
            next.splice(insertIdx, 0, {
                id: blkId(),
                type: 'CitationBlock',
                content: { sources: citations },
            });
            changed = true;
            blocksInserted += 1;
        } else {
            for (const idx of citationIdxs) {
                const cur = next[idx];
                const content = (cur.content || {}) as Record<string, unknown>;
                const sources = content.sources as unknown[] | undefined;
                const hasPlaceholder = Array.isArray(sources) && JSON.stringify(sources).includes('"url":"#"');
                const needs = !sources || (Array.isArray(sources) && sources.length === 0) || hasPlaceholder;
                if (needs) {
                    next[idx] = { ...cur, content: { ...content, sources: citations } };
                    changed = true;
                }
            }
        }

        if (changed) {
            await db.update(pageDefinitions).set({
                blocks: next as typeof page.blocks,
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, page.id));
            pagesUpdated += 1;
        }
    }

    return { pagesUpdated, blocksInserted };
}

async function ensureAuthorBioBlocks(domain: Domain, persona: AuthorPersona): Promise<PageFixStats> {
    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));
    let pagesUpdated = 0;
    let blocksInserted = 0;

    for (const page of pages) {
        if (shouldSkipContentPage(page.route)) continue;
        const blocks = (page.blocks || []) as BlockEnvelope[];
        const next = [...blocks];
        let changed = false;

        const authorIdxs: number[] = [];
        for (let i = 0; i < next.length; i += 1) {
            if (next[i]?.type === 'AuthorBio') authorIdxs.push(i);
        }

        if (authorIdxs.length === 0) {
            const footerIdx = next.findIndex(b => b.type === 'Footer');
            const insertIdx = footerIdx >= 0 ? footerIdx : next.length;
            next.splice(insertIdx, 0, {
                id: blkId(),
                type: 'AuthorBio',
                content: {
                    name: persona.name,
                    title: persona.title,
                    bio: persona.bio,
                    credentials: persona.credentials,
                    socialLinks: persona.socialLinks,
                },
            });
            changed = true;
            blocksInserted += 1;
        } else {
            for (const idx of authorIdxs) {
                const cur = next[idx];
                const content = (cur.content || {}) as Record<string, unknown>;
                const merged = {
                    ...content,
                    name: persona.name,
                    title: persona.title,
                    bio: persona.bio,
                    credentials: persona.credentials,
                    socialLinks: persona.socialLinks,
                };
                if (JSON.stringify(merged) !== JSON.stringify(content)) {
                    next[idx] = { ...cur, content: merged };
                    changed = true;
                }
            }
        }

        if (changed) {
            await db.update(pageDefinitions).set({
                blocks: next as typeof page.blocks,
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, page.id));
            pagesUpdated += 1;
        }
    }

    return { pagesUpdated, blocksInserted };
}

async function ensureCompliancePages(domain: Domain): Promise<{ inserted: number; published: number }> {
    const existing = await db.select({ id: pageDefinitions.id, route: pageDefinitions.route, isPublished: pageDefinitions.isPublished, status: pageDefinitions.status })
        .from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, domain.id));
    const byRoute = new Map(existing.map(p => [p.route, p]));

    const required = getRequiredCompliancePages(domain);
    let inserted = 0;
    let published = 0;

    for (const page of required) {
        const route = page.route;
        if (!route) {
            console.error('[SiteReview] Required compliance page missing route. Skipping insert.', {
                domainId: domain.id,
                title: page.title,
            });
            continue;
        }
        const cur = byRoute.get(route);
        if (!cur) {
            await db.insert(pageDefinitions).values(page);
            inserted += 1;
            continue;
        }

        if (!cur.isPublished || cur.status !== 'published') {
            await db.update(pageDefinitions).set({
                isPublished: true,
                status: 'published',
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, cur.id));
            published += 1;
        }
    }

    return { inserted, published };
}

/**
 * remediateSite(domainId, review) — best-effort programmatic fixes for critical issues.
 * After remediation, re-runs validateDomain() and returns the updated report.
 */
export async function remediateSite(domainId: string, review: SiteReviewReport): Promise<ValidationReport> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) throw new Error('Domain not found');

    const c1 = getCriterionScore(review, 'C1');
    const c3 = getCriterionScore(review, 'C3');
    const c4 = getCriterionScore(review, 'C4');
    const c5 = getCriterionScore(review, 'C5');
    const q1 = getCriterionScore(review, 'Q1');
    const q3 = getCriterionScore(review, 'Q3');
    const q4 = getCriterionScore(review, 'Q4');
    const s2 = getCriterionScore(review, 'S2');

    // C5: Compliance pages exist + are published
    if (Number.isFinite(c5) && c5 < 3) {
        await ensureCompliancePages(domain as Domain);
    }

    // C3: LastUpdated visible on content pages
    if (Number.isFinite(c3) && c3 < 3) {
        await ensureLastUpdatedBlocks(domainId);
    }

    // C4: Citations present + non-placeholder
    if (Number.isFinite(c4) && c4 < 3) {
        await ensureCitationBlocks(domain as Domain);
    }

    // C1: Author identity persona
    if (Number.isFinite(c1) && c1 < 3) {
        const persona = await generateAuthorPersona(domain as Domain);
        await ensureAuthorBioBlocks(domain as Domain, persona);
    }

    // Q3: Calculator relevance cannot be safely auto-fixed; surface as a warning via logs.
    if (Number.isFinite(q3) && q3 < 3) {
        console.warn(`[site-review] Calculator relevance flagged for manual review: domain=${domain.domain} (${domainId})`);
    }

    const needHero = Number.isFinite(q1) && q1 < 3;
    const needFaq = Number.isFinite(q4) && q4 < 3;
    const needMeta = Number.isFinite(s2) && s2 < 3;
    const routes = Array.isArray(review.pagesReviewed) ? review.pagesReviewed.map(p => p.route).filter(Boolean) : [];

    if (needHero || needFaq || needMeta) {
        await enrichDomain(domainId, {
            routes: routes.length > 0 ? routes : undefined,
            forceHeroes: needHero,
            forceFaqs: needFaq,
            forceMeta: needMeta,
        });
    }

    return validateDomain(domainId);
}

