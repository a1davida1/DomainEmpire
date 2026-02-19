import { db, domains, pageDefinitions } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAIClient } from '@/lib/ai/openrouter';
import { assemblePageFromBlocks, type RenderContext } from './blocks/assembler';
import type { BlockEnvelope } from './blocks/schemas';
import { applyInternalLinking } from './internal-linker';
import { extractSiteTitle } from './templates/shared';
import { getOgImagePath } from './image-gen';
import { enrichDomain, getCitations } from './enrich';
import { getRequiredCompliancePages } from './compliance-templates';
import { generateSubPages } from './blocks/sub-page-presets';
import { validateDomain, type ValidationReport } from './validate';
import type { Domain } from '@/lib/db/schema';
import { measureBurstiness, scanForBannedPatterns } from '@/lib/ai/content-scanner';
import {
    aiReviewPayloadSchema,
    type AiReviewPayload,
    type SiteReviewCriterionCode,
    type SiteReviewCriterionResult,
    type SiteReviewReport,
    type SiteReviewScores,
    type SiteReviewVerdict,
} from '@/lib/types/site-review';

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

type CredibilityCode = keyof SiteReviewScores['credibility'];
type QualityCode = keyof SiteReviewScores['quality'];
type SeoCode = keyof SiteReviewScores['seo'];
type NetworkCode = keyof SiteReviewScores['network'];

function isCredibilityCode(code: SiteReviewCriterionCode): code is CredibilityCode {
    return code.startsWith('C');
}
function isQualityCode(code: SiteReviewCriterionCode): code is QualityCode {
    return code.startsWith('Q');
}
function isSeoCode(code: SiteReviewCriterionCode): code is SeoCode {
    return code.startsWith('S');
}
function isNetworkCode(code: SiteReviewCriterionCode): code is NetworkCode {
    return code.startsWith('N');
}

function getCriterionScore(review: SiteReviewReport, code: SiteReviewCriterionCode): number {
    if (isCredibilityCode(code)) return review.scores.credibility[code].score;
    if (isQualityCode(code)) return review.scores.quality[code].score;
    if (isSeoCode(code)) return review.scores.seo[code].score;
    if (isNetworkCode(code)) return review.scores.network[code].score;
    return NaN;
}

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

    function parseSections(text: string): Array<{ heading: { level: number; text: string } | null; content: string }> {
        const lines = text.split('\n');
        const sections: Array<{ heading: { level: number; text: string } | null; contentLines: string[] }> = [];
        let cur: { heading: { level: number; text: string } | null; contentLines: string[] } = { heading: null, contentLines: [] };

        function flush() {
            const content = cur.contentLines.join('\n').trim();
            const hasContent = content.length > 0;
            if (cur.heading || hasContent) {
                sections.push({ heading: cur.heading, contentLines: cur.contentLines });
            }
        }

        for (const line of lines) {
            const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
            if (match) {
                flush();
                cur = {
                    heading: { level: match[1].length, text: match[2].trim() },
                    contentLines: [],
                };
                continue;
            }
            cur.contentLines.push(line);
        }
        flush();

        return sections.map((s) => ({ heading: s.heading, content: s.contentLines.join('\n').trim() }));
    }

    function sampleText(text: string, budgetChars: number): { text: string; truncated: boolean } {
        const clean = text.trim();
        if (budgetChars <= 0) return { text: '', truncated: clean.length > 0 };
        if (clean.length <= budgetChars) return { text: clean, truncated: false };
        const headLen = Math.max(80, Math.floor(budgetChars * 0.6));
        const tailLen = Math.max(40, budgetChars - headLen - 16);
        const head = clean.slice(0, headLen).trimEnd();
        const tail = clean.slice(Math.max(0, clean.length - tailLen)).trimStart();
        return { text: `${head}\n…\n${tail}`, truncated: true };
    }

    function pickSectionIndexes(sectionCount: number, maxSections: number): number[] {
        if (sectionCount <= 0) return [];
        if (sectionCount <= maxSections) return [...Array(sectionCount)].map((_, i) => i);

        const keep = new Set<number>();
        const firstCount = Math.min(6, sectionCount);
        const lastCount = Math.min(4, sectionCount);
        for (let i = 0; i < firstCount; i++) keep.add(i);
        for (let i = sectionCount - lastCount; i < sectionCount; i++) keep.add(i);

        const slots = Math.max(0, maxSections - keep.size);
        if (slots === 0) return [...keep].sort((a, b) => a - b);

        const middle: number[] = [];
        for (let i = firstCount; i < sectionCount - lastCount; i++) {
            if (!keep.has(i)) middle.push(i);
        }
        if (middle.length <= slots) {
            for (const idx of middle) keep.add(idx);
            return [...keep].sort((a, b) => a - b);
        }

        for (let k = 0; k < slots; k++) {
            const pos = Math.floor(((k + 1) * (middle.length + 1)) / (slots + 1)) - 1;
            const idx = middle[Math.max(0, Math.min(middle.length - 1, pos))];
            keep.add(idx);
        }

        return [...keep].sort((a, b) => a - b);
    }

    const metaLines = [
        titleTag ? `TITLE_TAG: ${titleTag}` : 'TITLE_TAG: (missing)',
        metaDescription ? `META_DESCRIPTION: ${metaDescription}` : 'META_DESCRIPTION: (missing)',
        canonicalUrl ? `CANONICAL_URL: ${canonicalUrl}` : 'CANONICAL_URL: (missing)',
        `STRUCTURED_DATA_TYPES: ${structuredDataTypes.length > 0 ? structuredDataTypes.join(', ') : '(none detected)'}`,
    ].join('\n');

    const sections = parseSections(body);
    const outlineHeadings = sections
        .filter(s => s.heading)
        .map(s => `${'#'.repeat(s.heading!.level)} ${s.heading!.text}`);

    const MAX_OUTLINE = 60;
    const outlineLines = outlineHeadings.length === 0
        ? 'HEADING_OUTLINE: (none detected)'
        : `HEADING_OUTLINE:\n${outlineHeadings.slice(0, MAX_OUTLINE).join('\n')}${outlineHeadings.length > MAX_OUTLINE ? `\n… (${outlineHeadings.length - MAX_OUTLINE} more headings)` : ''}`;

    // Sample content per section to avoid "front-only" truncation bias.
    const MAX_SAMPLED_SECTIONS = 16;
    const sampledIdxs = pickSectionIndexes(sections.length, MAX_SAMPLED_SECTIONS);

    const base = `${metaLines}\n\n${outlineLines}\n\nSECTION_SAMPLES:\n`;
    const remaining = Math.max(0, maxChars - base.length);
    const perSectionBudget = sampledIdxs.length > 0
        ? Math.max(220, Math.min(1400, Math.floor(remaining / sampledIdxs.length)))
        : 0;

    let samplesText = '';
    let anySampleTruncated = false;
    for (const idx of sampledIdxs) {
        const sec = sections[idx];
        const headingLine = sec.heading ? `${'#'.repeat(sec.heading.level)} ${sec.heading.text}` : 'INTRO (no heading)';
        const sampled = sampleText(sec.content, perSectionBudget);
        if (sampled.truncated) anySampleTruncated = true;
        if (!sampled.text) continue;
        samplesText += `\n---\n${headingLine}\n${sampled.text}\n`;
    }

    const combined = `${base}${samplesText.trim()}`;
    const truncatedResult = safeTruncate(combined, maxChars);
    const finalText = truncatedResult.text;

    return {
        titleTag,
        metaDescription: metaDescription && metaDescription.length > 0 ? metaDescription : null,
        canonicalUrl: canonicalUrl && canonicalUrl.length > 0 ? canonicalUrl : null,
        structuredDataTypes,
        text: finalText,
        textChars: finalText.length,
        truncated: truncatedResult.truncated || anySampleTruncated,
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
    function norm(route: string): string {
        let r = route.trim();
        if (!r.startsWith('/')) r = `/${r}`;
        if (r.length > 1) r = r.replace(/\/+$/g, '');
        return r || '/';
    }

    const normalized = pages.map(p => ({ page: p, route: norm(p.route || '/') }));
    const home = normalized.find(p => p.route === '/')?.page;
    if (!home) throw new Error('No homepage (/) page definition found');

    const TOOL_BLOCKS = new Set(['QuoteCalculator', 'CostBreakdown', 'Wizard']);
    const COMPARE_BLOCKS = new Set(['ComparisonTable', 'VsCard', 'RankingList', 'ProsConsCard']);

    function blocksFor(p: PageDefRow): BlockEnvelope[] {
        return (p.blocks || []) as BlockEnvelope[];
    }

    function toolScore(p: PageDefRow, route: string): number {
        if (route === '/' || shouldSkipContentPage(route)) return -1_000_000;
        const blocks = blocksFor(p);
        const hasTool = blocks.some(b => TOOL_BLOCKS.has(b.type));
        const hasCompare = blocks.some(b => COMPARE_BLOCKS.has(b.type));
        const hasArticle = blocks.some(b => b.type === 'ArticleBody');
        const hasFaq = blocks.some(b => b.type === 'FAQ');

        let score = 0;
        if (hasTool) score += 1000;
        if (hasCompare) score += 900;
        if (route.includes('calculator') || route.includes('compare') || route.includes('quote') || route.includes('cost')) score += 120;
        if (hasArticle) score += 30;
        if (hasFaq) score += 15;
        // Prefer shorter, top-level routes for "tool" if otherwise equal.
        score -= Math.max(0, route.split('/').filter(Boolean).length - 1) * 5;
        return score;
    }

    function guideScore(p: PageDefRow, route: string, toolRoute: string): number {
        if (route === '/' || route === toolRoute || shouldSkipContentPage(route)) return -1_000_000;
        const blocks = blocksFor(p);
        const hasTool = blocks.some(b => TOOL_BLOCKS.has(b.type)) || blocks.some(b => COMPARE_BLOCKS.has(b.type));
        const hasArticle = blocks.some(b => b.type === 'ArticleBody');
        const hasLastUpdated = blocks.some(b => b.type === 'LastUpdated');
        const hasFaq = blocks.some(b => b.type === 'FAQ');

        let score = 0;
        if (route.startsWith('/guides/')) score += 250;
        if (route.startsWith('/guides')) score += 150;
        if (hasArticle) score += 600;
        if (hasLastUpdated) score += 40;
        if (hasFaq) score += 20;
        if (hasTool) score -= 400;
        if (route.includes('calculator') || route.includes('compare')) score -= 200;
        return score;
    }

    const candidates = normalized
        .map(({ page, route }) => ({ page, route }))
        .filter(({ route }) => route !== '/');

    const toolPick = candidates
        .map(({ page, route }) => ({ page, route, score: toolScore(page, route) }))
        .sort((a, b) => b.score - a.score)[0];
    if (!toolPick || toolPick.score < 0) {
        throw new Error('No calculator/compare/tool-like page definition found');
    }
    const tool = toolPick.page;
    const toolRoute = toolPick.route;

    const guidePick = candidates
        .map(({ page, route }) => ({ page, route, score: guideScore(page, route, toolRoute) }))
        .sort((a, b) => b.score - a.score)[0];
    if (!guidePick || guidePick.score < 0) {
        throw new Error('No guide/article-like page definition found');
    }
    const guide = guidePick.page;

    return { home, tool, guide };
}

function defaultScores(baseScore = 1): SiteReviewScores {
    const empty = (score: number, evidence: string, fix: string): SiteReviewCriterionResult => ({ score, evidence, fix });
    return {
        credibility: {
            C1: empty(baseScore, '', ''),
            C2: empty(baseScore, '', ''),
            C3: empty(baseScore, '', ''),
            C4: empty(baseScore, '', ''),
            C5: empty(baseScore, '', ''),
            C6: empty(baseScore, '', ''),
        },
        quality: {
            Q1: empty(baseScore, '', ''),
            Q2: empty(baseScore, '', ''),
            Q3: empty(baseScore, '', ''),
            Q4: empty(baseScore, '', ''),
            Q5: empty(baseScore, '', ''),
        },
        seo: {
            S1: empty(baseScore, '', ''),
            S2: empty(baseScore, '', ''),
            S3: empty(baseScore, '', ''),
            S4: empty(baseScore, '', ''),
            S5: empty(baseScore, '', ''),
            S6: empty(baseScore, '', ''),
        },
        network: {
            N1: empty(baseScore, '', ''),
            N2: empty(baseScore, '', ''),
            N3: empty(baseScore, '', ''),
        },
    };
}

type HtmlSeoSignals = {
    headingCounts: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', number>;
    internalLinkCount: number;
    linksToTrustRoutes: { privacy: boolean; terms: boolean; disclosure: boolean; contact: boolean; about: boolean; editorial: boolean };
    imageCount: number;
    imagesMissingAlt: number;
    imagesWithAlt: number;
    altCoverage: number; // 0–1
};

function analyzeHtmlSeoSignals(html: string, domainHost: string): HtmlSeoSignals {
    function countTag(tag: string): number {
        const re = new RegExp(`<${tag}\\b`, 'gi');
        return (html.match(re) || []).length;
    }

    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    let imagesWithAlt = 0;
    let imagesMissingAlt = 0;
    for (const tag of imgTags) {
        const alt = decodeHtmlEntities(getAttr(tag, 'alt') || '').trim();
        if (alt.length > 0) imagesWithAlt += 1;
        else imagesMissingAlt += 1;
    }
    const imageCount = imgTags.length;
    const altCoverage = imageCount > 0 ? imagesWithAlt / imageCount : 1;

    const linkMatches = html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>/gi);
    let internalLinkCount = 0;
    const trust = { privacy: false, terms: false, disclosure: false, contact: false, about: false, editorial: false };

    for (const m of linkMatches) {
        const hrefRaw = (m[2] || '').trim();
        if (!hrefRaw || hrefRaw === '#' || hrefRaw.startsWith('mailto:') || hrefRaw.startsWith('tel:') || hrefRaw.startsWith('javascript:')) {
            continue;
        }

        let href = hrefRaw;
        if (href.startsWith(`https://${domainHost}`)) href = href.slice(`https://${domainHost}`.length);
        if (href.startsWith(`http://${domainHost}`)) href = href.slice(`http://${domainHost}`.length);

        if (href.startsWith('/') && !href.startsWith('//')) {
            internalLinkCount += 1;
            if (href.startsWith('/privacy-policy')) trust.privacy = true;
            if (href === '/terms' || href.startsWith('/terms')) trust.terms = true;
            if (href === '/disclosure' || href.startsWith('/disclosure')) trust.disclosure = true;
            if (href === '/contact' || href.startsWith('/contact')) trust.contact = true;
            if (href === '/about' || href.startsWith('/about')) trust.about = true;
            if (href === '/editorial-policy' || href.startsWith('/editorial-policy')) trust.editorial = true;
        }
    }

    return {
        headingCounts: {
            h1: countTag('h1'),
            h2: countTag('h2'),
            h3: countTag('h3'),
            h4: countTag('h4'),
            h5: countTag('h5'),
            h6: countTag('h6'),
        },
        internalLinkCount,
        linksToTrustRoutes: trust,
        imageCount,
        imagesMissingAlt,
        imagesWithAlt,
        altCoverage,
    };
}

type DeterministicReview = {
    overallScore: number;
    verdict: SiteReviewVerdict;
    scores: SiteReviewScores;
    criticalIssues: string[];
    recommendations: string[];
};

function clamp1to5(score: number): number {
    if (!Number.isFinite(score)) return 1;
    return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

function clampScores(scores: SiteReviewScores): SiteReviewScores {
    return {
        credibility: {
            C1: { ...scores.credibility.C1, score: clamp1to5(scores.credibility.C1.score) },
            C2: { ...scores.credibility.C2, score: clamp1to5(scores.credibility.C2.score) },
            C3: { ...scores.credibility.C3, score: clamp1to5(scores.credibility.C3.score) },
            C4: { ...scores.credibility.C4, score: clamp1to5(scores.credibility.C4.score) },
            C5: { ...scores.credibility.C5, score: clamp1to5(scores.credibility.C5.score) },
            C6: { ...scores.credibility.C6, score: clamp1to5(scores.credibility.C6.score) },
        },
        quality: {
            Q1: { ...scores.quality.Q1, score: clamp1to5(scores.quality.Q1.score) },
            Q2: { ...scores.quality.Q2, score: clamp1to5(scores.quality.Q2.score) },
            Q3: { ...scores.quality.Q3, score: clamp1to5(scores.quality.Q3.score) },
            Q4: { ...scores.quality.Q4, score: clamp1to5(scores.quality.Q4.score) },
            Q5: { ...scores.quality.Q5, score: clamp1to5(scores.quality.Q5.score) },
        },
        seo: {
            S1: { ...scores.seo.S1, score: clamp1to5(scores.seo.S1.score) },
            S2: { ...scores.seo.S2, score: clamp1to5(scores.seo.S2.score) },
            S3: { ...scores.seo.S3, score: clamp1to5(scores.seo.S3.score) },
            S4: { ...scores.seo.S4, score: clamp1to5(scores.seo.S4.score) },
            S5: { ...scores.seo.S5, score: clamp1to5(scores.seo.S5.score) },
            S6: { ...scores.seo.S6, score: clamp1to5(scores.seo.S6.score) },
        },
        network: {
            N1: { ...scores.network.N1, score: clamp1to5(scores.network.N1.score) },
            N2: { ...scores.network.N2, score: clamp1to5(scores.network.N2.score) },
            N3: { ...scores.network.N3, score: clamp1to5(scores.network.N3.score) },
        },
    };
}

function computeOverallScore(scores: SiteReviewScores): number {
    const all: number[] = [
        ...Object.values(scores.credibility).map(v => v.score),
        ...Object.values(scores.quality).map(v => v.score),
        ...Object.values(scores.seo).map(v => v.score),
        ...Object.values(scores.network).map(v => v.score),
    ];
    const avg = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : 1;
    const normalized = (avg - 1) / 4; // 0..1
    const score100 = 1 + normalized * 99;
    return Math.max(1, Math.min(100, Math.round(score100)));
}

function computeDeterministicVerdict(scores: SiteReviewScores, criticalIssues: string[]): SiteReviewVerdict {
    const allScores = [
        ...Object.values(scores.credibility).map(v => v.score),
        ...Object.values(scores.quality).map(v => v.score),
        ...Object.values(scores.seo).map(v => v.score),
        ...Object.values(scores.network).map(v => v.score),
    ];
    const minScore = allScores.length > 0 ? Math.min(...allScores) : 1;
    const overall = computeOverallScore(scores);

    // Hard blockers: missing compliance/author/citations or broken tools.
    const hardReject = (
        scores.credibility.C5.score < 3
        || scores.credibility.C1.score < 3
        || scores.credibility.C4.score < 3
        || scores.quality.Q3.score < 3
        || criticalIssues.length > 0
        || minScore <= 1
    );
    if (hardReject) return 'reject';

    const approve = overall >= 80
        && minScore >= 3
        && scores.seo.S1.score >= 3
        && scores.seo.S2.score >= 3;
    if (approve) return 'approve';

    return 'needs_work';
}

function normalizeRoute(route: string): string {
    let r = route.trim();
    if (!r.startsWith('/')) r = `/${r}`;
    if (r.length > 1) r = r.replace(/\/+$/g, '');
    return r || '/';
}

function wordCount(markdown: string): number {
    return markdown.split(/\s+/).filter(Boolean).length;
}

function getArticleMarkdown(page: PageDefRow): string {
    const blocks = (page.blocks || []) as BlockEnvelope[];
    const bodies = blocks.filter(b => b.type === 'ArticleBody');
    const parts: string[] = [];
    for (const b of bodies) {
        const c = (b.content || {}) as Record<string, unknown>;
        const md = typeof c.markdown === 'string' ? c.markdown : '';
        if (md.trim()) parts.push(md.trim());
    }
    return parts.join('\n\n');
}

function deterministicReviewSite(input: {
    domain: Domain;
    pageDefs: PageDefRow[];
    selected: { home: PageDefRow; tool: PageDefRow; guide: PageDefRow };
    rendered: Array<{
        kind: 'home' | 'tool' | 'guide';
        def: PageDefRow;
        extracted: ReviewTextResult;
        htmlSignals: HtmlSeoSignals;
    }>;
}): DeterministicReview {
    const scores = defaultScores(3);
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    const normRoutes = new Set(input.pageDefs.map(p => normalizeRoute(p.route)));
    const contentPages = input.pageDefs
        .filter(p => !shouldSkipContentPage(normalizeRoute(p.route)))
        .filter(p => normalizeRoute(p.route) !== '/');

    const byRoute = new Map(input.pageDefs.map(p => [normalizeRoute(p.route), p]));

    const requiredCompliance = getRequiredCompliancePages(input.domain)
        .map(p => (typeof p.route === 'string' ? normalizeRoute(p.route) : null))
        .filter((r): r is string => Boolean(r));
    const missingCompliance = requiredCompliance.filter(r => !normRoutes.has(r));

    if (missingCompliance.length === 0) {
        scores.credibility.C5 = { score: 5, evidence: `All required compliance pages present: ${requiredCompliance.join(', ') || '(none)'}`, fix: 'No action needed.' };
    } else {
        scores.credibility.C5 = {
            score: 1,
            evidence: `Missing required compliance pages: ${missingCompliance.join(', ')}`,
            fix: 'Insert missing compliance pages and ensure they are published.',
        };
        criticalIssues.push(`C5: Missing required compliance pages: ${missingCompliance.join(', ')}`);
    }

    const contact = byRoute.get('/contact');
    if (!contact) {
        scores.credibility.C2 = {
            score: 1,
            evidence: 'No /contact page found in published page_definitions.',
            fix: 'Create and publish a /contact page with a legitimate contact path (email capture or contact form) and links to privacy/terms.',
        };
        criticalIssues.push('C2: Missing /contact page.');
    } else {
        const blocks = (contact.blocks || []) as BlockEnvelope[];
        const hasLeadForm = blocks.some(b => b.type === 'LeadForm');
        const hasBody = blocks.some(b => b.type === 'ArticleBody');
        const score = hasLeadForm ? 4 : (hasBody ? 3 : 2);
        scores.credibility.C2 = {
            score,
            evidence: hasLeadForm ? 'Contact page includes a LeadForm.' : (hasBody ? 'Contact page includes an ArticleBody block.' : 'Contact page exists but lacks LeadForm/ArticleBody.'),
            fix: 'Ensure /contact has a LeadForm (email + optional question) and privacy policy link/consent copy.',
        };
        if (score < 3) {
            criticalIssues.push('C2: Contact page exists but lacks a clear, legitimate contact method.');
        }
    }

    // Per-page block presence checks across all non-compliance content pages.
    const pagesMissingAuthor = contentPages.filter(p => !((p.blocks || []) as BlockEnvelope[]).some(b => b.type === 'AuthorBio'));
    const pagesMissingUpdated = contentPages.filter(p => !((p.blocks || []) as BlockEnvelope[]).some(b => b.type === 'LastUpdated'));
    const pagesMissingCitations = contentPages.filter(p => !((p.blocks || []) as BlockEnvelope[]).some(b => b.type === 'CitationBlock'));

    const totalContent = contentPages.length;
    const authorPresent = totalContent - pagesMissingAuthor.length;
    const updatedPresent = totalContent - pagesMissingUpdated.length;
    const citationsPresent = totalContent - pagesMissingCitations.length;

    scores.credibility.C1 = authorPresent === totalContent && totalContent > 0
        ? { score: 5, evidence: `AuthorBio present on ${authorPresent}/${totalContent} content pages.`, fix: 'No action needed.' }
        : {
            score: authorPresent === 0 ? 1 : (authorPresent / Math.max(totalContent, 1) >= 0.75 ? 3 : 2),
            evidence: `AuthorBio present on ${authorPresent}/${totalContent} content pages. Missing: ${pagesMissingAuthor.slice(0, 5).map(p => p.route).join(', ') || '(none)'}`,
            fix: 'Insert/refresh AuthorBio blocks with a credible persona across all content pages.',
        };
    if (scores.credibility.C1.score < 3) {
        criticalIssues.push('C1: Author identity missing or inconsistent (AuthorBio blocks missing on content pages).');
    }

    scores.credibility.C3 = updatedPresent === totalContent && totalContent > 0
        ? { score: 5, evidence: `LastUpdated present on ${updatedPresent}/${totalContent} content pages.`, fix: 'No action needed.' }
        : {
            score: updatedPresent === 0 ? 1 : (updatedPresent / Math.max(totalContent, 1) >= 0.75 ? 3 : 2),
            evidence: `LastUpdated present on ${updatedPresent}/${totalContent} content pages. Missing: ${pagesMissingUpdated.slice(0, 5).map(p => p.route).join(', ') || '(none)'}`,
            fix: 'Ensure every content page includes a visible LastUpdated block with a real date.',
        };
    if (scores.credibility.C3.score < 3) {
        criticalIssues.push('C3: Editorial freshness signals missing (LastUpdated blocks missing).');
    }

    // Citation quality: check block presence + obvious placeholder URLs.
    const pagesWithPlaceholderCitations: string[] = [];
    for (const p of contentPages) {
        const blocks = (p.blocks || []) as BlockEnvelope[];
        const citationBlocks = blocks.filter(b => b.type === 'CitationBlock');
        for (const cb of citationBlocks) {
            const c = (cb.content || {}) as Record<string, unknown>;
            const sources = Array.isArray(c.sources) ? c.sources : [];
            let hasPlaceholder = sources.length === 0;
            for (const src of sources) {
                if (!src || typeof src !== 'object') {
                    hasPlaceholder = true;
                    break;
                }
                const url = (src as Record<string, unknown>).url;
                if (typeof url !== 'string' || url.trim() === '' || url.trim() === '#') {
                    hasPlaceholder = true;
                    break;
                }
            }

            if (hasPlaceholder) {
                pagesWithPlaceholderCitations.push(p.route);
                break;
            }
        }
    }

    const citationsOk = citationsPresent === totalContent && pagesWithPlaceholderCitations.length === 0 && totalContent > 0;
    scores.credibility.C4 = citationsOk
        ? { score: 5, evidence: `CitationBlock present on ${citationsPresent}/${totalContent} content pages (no obvious placeholders).`, fix: 'No action needed.' }
        : {
            score: citationsPresent === 0 ? 1 : (pagesWithPlaceholderCitations.length > 0 ? 2 : 3),
            evidence: `CitationBlock present on ${citationsPresent}/${totalContent} content pages. Placeholder/empty sources on: ${pagesWithPlaceholderCitations.slice(0, 5).join(', ') || '(none)'}`,
            fix: 'Inject authoritative niche citations and remove placeholders.',
        };
    if (scores.credibility.C4.score < 3) {
        criticalIssues.push('C4: Citation quality insufficient (missing or placeholder citations).');
    }

    // Expertise signals: heuristic based on depth + methodology + citations.
    const guideMd = getArticleMarkdown(input.selected.guide);
    const toolMd = getArticleMarkdown(input.selected.tool);
    const guideWords = wordCount(guideMd);
    const toolWords = wordCount(toolMd);
    const toolBlocks = ((input.selected.tool.blocks || []) as BlockEnvelope[]);
    const hasToolMethodology = toolBlocks.some(b => (b.type === 'QuoteCalculator' || b.type === 'CostBreakdown') && typeof (b.content as Record<string, unknown> | undefined)?.methodology === 'string');
    const expertiseScore = guideWords >= 900 && hasToolMethodology && scores.credibility.C4.score >= 3 ? 5
        : guideWords >= 650 && scores.credibility.C4.score >= 3 ? 4
            : guideWords >= 450 ? 3
                : 2;
    scores.credibility.C6 = {
        score: expertiseScore,
        evidence: `Guide depth: ${guideWords} words. Tool methodology present: ${hasToolMethodology ? 'yes' : 'no'}. Citations score: ${scores.credibility.C4.score}.`,
        fix: 'Expand guide content with niche-specific methods/examples and ensure calculator methodology + citations are present.',
    };

    // Headline specificity (Hero headings).
    function heroHeading(page: PageDefRow): string {
        const blocks = (page.blocks || []) as BlockEnvelope[];
        const hero = blocks.find(b => b.type === 'Hero');
        const c = (hero?.content || {}) as Record<string, unknown>;
        return typeof c.heading === 'string' ? c.heading : '';
    }
    const heroHome = heroHeading(input.selected.home);
    const heroTool = heroHeading(input.selected.tool);
    const heroGuide = heroHeading(input.selected.guide);
    const heroList = [
        { route: input.selected.home.route, heading: heroHome },
        { route: input.selected.tool.route, heading: heroTool },
        { route: input.selected.guide.route, heading: heroGuide },
    ];
    const genericHeroes = heroList.filter(h => {
        const t = h.heading.trim();
        return !t || t.startsWith('Your Trusted ') || t.endsWith(' Resource') || t.includes('Home Services') || t.length < 10;
    });
    scores.quality.Q1 = genericHeroes.length === 0
        ? { score: 5, evidence: 'Hero headlines look specific and non-generic across reviewed pages.', fix: 'No action needed.' }
        : {
            score: genericHeroes.length >= 2 ? 2 : 3,
            evidence: `Generic or weak hero headings on: ${genericHeroes.map(h => `${h.route}="${h.heading || '(missing)'}"`).join('; ')}`,
            fix: 'Regenerate hero headings to be specific to niche + page intent.',
        };
    if (scores.quality.Q1.score < 3) {
        recommendations.push('Q1: Hero headline(s) too generic for niche/page intent — regenerate for specificity.');
    }

    // Content depth (Q2)
    const depthScore = guideWords >= 900 && toolWords >= 450 ? 5
        : guideWords >= 650 ? 4
            : guideWords >= 450 ? 3
                : guideWords >= 300 ? 2
                    : 1;
    scores.quality.Q2 = {
        score: depthScore,
        evidence: `Guide words: ${guideWords}. Tool page words: ${toolWords}.`,
        fix: 'Expand ArticleBody sections with concrete examples, constraints, and action steps; avoid filler.',
    };
    if (scores.quality.Q2.score < 2) {
        criticalIssues.push('Q2: Guide content appears thin.');
    } else if (scores.quality.Q2.score < 3) {
        recommendations.push('Q2: Expand guide/tool content depth to reduce thin-content risk.');
    }

    // Calculator relevance / completeness (Q3)
    const calc = toolBlocks.find(b => b.type === 'QuoteCalculator');
    const breakdown = toolBlocks.find(b => b.type === 'CostBreakdown');
    let q3Score = 1;
    let q3Evidence = '';
    if (calc) {
        const c = (calc.content || {}) as Record<string, unknown>;
        const inputs = Array.isArray(c.inputs) ? c.inputs : [];
        const formula = typeof c.formula === 'string' ? c.formula.trim() : '';
        const methodology = typeof c.methodology === 'string' ? c.methodology.trim() : '';
        q3Score = inputs.length >= 2 && formula && methodology ? 5
            : inputs.length >= 1 && (formula || methodology) ? 3
                : 2;
        q3Evidence = `QuoteCalculator inputs=${inputs.length}, formula=${formula ? 'yes' : 'no'}, methodology=${methodology ? 'yes' : 'no'}.`;
    } else if (breakdown) {
        const c = (breakdown.content || {}) as Record<string, unknown>;
        const ranges = Array.isArray(c.ranges) ? c.ranges : [];
        q3Score = ranges.length >= 3 ? 4 : (ranges.length >= 1 ? 3 : 2);
        q3Evidence = `CostBreakdown ranges=${ranges.length}.`;
    } else {
        q3Score = 1;
        q3Evidence = 'No calculator/tool block found on the selected tool page.';
    }
    scores.quality.Q3 = { score: q3Score, evidence: q3Evidence, fix: 'Ensure the tool page has niche-appropriate calculator inputs/ranges plus a clear methodology.' };
    if (scores.quality.Q3.score < 3) {
        criticalIssues.push('Q3: Tool/calculator appears missing or incomplete; requires manual verification for niche relevance.');
    }

    // FAQ quality (Q4)
    const faqBlocks = toolBlocks.filter(b => b.type === 'FAQ')
        .concat(((input.selected.guide.blocks || []) as BlockEnvelope[]).filter(b => b.type === 'FAQ'));
    let faqItems = 0;
    let faqShortAnswers = 0;
    let faqShortQuestions = 0;
    const faqCombinedText: string[] = [];
    for (const fb of faqBlocks) {
        const c = (fb.content || {}) as Record<string, unknown>;
        const items = Array.isArray(c.items) ? c.items as Array<{ question?: unknown; answer?: unknown }> : [];
        for (const item of items) {
            const q = typeof item.question === 'string' ? item.question.trim() : '';
            const a = typeof item.answer === 'string' ? item.answer.trim() : '';
            if (!q || !a) continue;
            faqItems += 1;
            if (q.length < 15) faqShortQuestions += 1;
            if (a.length < 60) faqShortAnswers += 1;
            faqCombinedText.push(`${q}\n${a}`);
        }
    }
    const faqViolations = scanForBannedPatterns(faqCombinedText.join('\n\n'));
    const faqScore = faqItems >= 5 && faqShortAnswers === 0 && faqViolations.length === 0 ? 5
        : faqItems >= 4 ? 4
            : faqItems >= 2 ? 3
                : faqItems >= 1 ? 2
                    : 1;
    scores.quality.Q4 = {
        score: faqScore,
        evidence: `FAQ items=${faqItems}. Short questions=${faqShortQuestions}. Short answers=${faqShortAnswers}. Banned-pattern hits=${faqViolations.length}.`,
        fix: 'Ensure 5–7 niche-specific FAQs with direct, non-generic answers and no AI-fingerprint transitions.',
    };
    if (scores.quality.Q4.score < 3) {
        criticalIssues.push('Q4: FAQ content missing or low-quality (thin/short/generic).');
    }

    // Comparison fairness (Q5)
    const compBlocks = toolBlocks.filter(b => b.type === 'ComparisonTable' || b.type === 'VsCard' || b.type === 'RankingList' || b.type === 'ProsConsCard');
    if (compBlocks.length === 0) {
        scores.quality.Q5 = { score: 3, evidence: 'No explicit comparison blocks detected on the reviewed tool page.', fix: 'If this is intended to be a comparison page, add a ComparisonTable/VsCard and a methodology/verdict.' };
    } else {
        let hasBalanced = false;
        for (const b of compBlocks) {
            const c = (b.content || {}) as Record<string, unknown>;
            if (b.type === 'VsCard') {
                const a = c.itemA as { pros?: unknown; cons?: unknown } | undefined;
                const d = c.itemB as { pros?: unknown; cons?: unknown } | undefined;
                const aPros = Array.isArray(a?.pros) ? a?.pros.length : 0;
                const aCons = Array.isArray(a?.cons) ? a?.cons.length : 0;
                const bPros = Array.isArray(d?.pros) ? d?.pros.length : 0;
                const bCons = Array.isArray(d?.cons) ? d?.cons.length : 0;
                if (aPros >= 2 && aCons >= 1 && bPros >= 2 && bCons >= 1) hasBalanced = true;
            }
            if (b.type === 'ProsConsCard') {
                const pros = Array.isArray(c.pros) ? c.pros.length : 0;
                const cons = Array.isArray(c.cons) ? c.cons.length : 0;
                if (pros >= 2 && cons >= 1) hasBalanced = true;
            }
            if (b.type === 'ComparisonTable') {
                const options = Array.isArray(c.options) ? c.options.length : 0;
                const columns = Array.isArray(c.columns) ? c.columns.length : 0;
                if (options >= 3 && columns >= 3) hasBalanced = true;
            }
        }
        scores.quality.Q5 = {
            score: hasBalanced ? 4 : 2,
            evidence: `Comparison blocks detected: ${compBlocks.map(b => b.type).join(', ')}. Balanced pros/cons/table structure: ${hasBalanced ? 'yes' : 'no'}.`,
            fix: 'Ensure comparisons include balanced tradeoffs (pros AND cons) and a clear verdict/methodology.',
        };
        if (scores.quality.Q5.score < 3) {
            recommendations.push('Q5: Comparison content exists but may be unbalanced; add tradeoffs + methodology.');
        }
    }

    // SEO checks across reviewed pages.
    const rendered = input.rendered;
    const missingTitles = rendered.filter(p => !p.extracted.titleTag || p.extracted.titleTag.trim().length < 4);
    const titleStrings = rendered.map(p => (p.extracted.titleTag || '').trim()).filter(Boolean);
    const uniqueTitleCount = new Set(titleStrings).size;
    scores.seo.S1 = missingTitles.length === 0 && uniqueTitleCount === titleStrings.length && titleStrings.length === rendered.length
        ? { score: 5, evidence: 'All reviewed pages have non-empty, unique <title> tags.', fix: 'No action needed.' }
        : {
            score: missingTitles.length > 0 ? 1 : 3,
            evidence: `Missing/weak titles: ${missingTitles.map(p => p.def.route).join(', ') || '(none)'}; unique titles=${uniqueTitleCount}/${rendered.length}.`,
            fix: 'Ensure every page has a unique, descriptive <title> (roughly 30–60 chars).',
        };
    if (scores.seo.S1.score < 3) {
        criticalIssues.push('S1: Missing or duplicate title tags.');
    }

    const missingMeta = rendered.filter(p => !p.extracted.metaDescription || p.extracted.metaDescription.trim().length < 20);
    const genericMeta = rendered.filter(p => (p.extracted.metaDescription || '').toLowerCase().includes('expert guides about'));
    scores.seo.S2 = missingMeta.length === 0 && genericMeta.length === 0
        ? { score: 5, evidence: 'All reviewed pages have specific meta descriptions.', fix: 'No action needed.' }
        : {
            score: missingMeta.length > 0 ? 2 : 3,
            evidence: `Missing/weak meta descriptions: ${missingMeta.map(p => p.def.route).join(', ') || '(none)'}; generic meta: ${genericMeta.map(p => p.def.route).join(', ') || '(none)'}.`,
            fix: 'Regenerate meta descriptions to be page-specific (50–160 chars) and non-generic.',
        };
    if (scores.seo.S2.score < 3) {
        recommendations.push('S2: Improve meta descriptions for specificity.');
    }

    const badH1 = rendered.filter(p => p.htmlSignals.headingCounts.h1 !== 1);
    scores.seo.S3 = badH1.length === 0
        ? { score: 5, evidence: 'All reviewed pages have exactly one H1.', fix: 'No action needed.' }
        : {
            score: 2,
            evidence: `Pages with non-1 H1 count: ${badH1.map(p => `${p.def.route}(h1=${p.htmlSignals.headingCounts.h1})`).join(', ')}`,
            fix: 'Ensure each page renders exactly one H1 and uses H2/H3 for section structure.',
        };
    if (scores.seo.S3.score < 3) {
        recommendations.push('S3: Fix heading hierarchy (H1 count).');
    }

    const linkCounts = rendered.map(p => p.htmlSignals.internalLinkCount);
    const avgLinks = linkCounts.length > 0 ? linkCounts.reduce((a, b) => a + b, 0) / linkCounts.length : 0;
    const trustLinkCoverage = rendered.some(p => p.htmlSignals.linksToTrustRoutes.privacy) && rendered.some(p => p.htmlSignals.linksToTrustRoutes.terms);
    scores.seo.S4 = avgLinks >= 8 && trustLinkCoverage
        ? { score: 5, evidence: `Average internal links per reviewed page: ${avgLinks.toFixed(1)}. Trust links present: yes.`, fix: 'No action needed.' }
        : {
            score: avgLinks >= 4 ? 3 : 2,
            evidence: `Average internal links per reviewed page: ${avgLinks.toFixed(1)}. Trust links present: ${trustLinkCoverage ? 'yes' : 'no'}.`,
            fix: 'Add contextual internal links between guides/tools and ensure privacy/terms/disclosure are discoverable in nav/footer.',
        };

    const hasFaqOnReviewed = faqItems > 0;
    const structuredOk = rendered.every(p => p.extracted.structuredDataTypes.includes('BreadcrumbList') && (p.extracted.structuredDataTypes.includes('WebPage') || p.extracted.structuredDataTypes.includes('Article')));
    const faqSchemaOk = !hasFaqOnReviewed || rendered.some(p => p.extracted.structuredDataTypes.includes('FAQPage'));
    scores.seo.S5 = structuredOk && faqSchemaOk
        ? { score: 5, evidence: `Structured data types detected: ${[...new Set(rendered.flatMap(p => p.extracted.structuredDataTypes))].join(', ')}`, fix: 'No action needed.' }
        : {
            score: structuredOk ? 3 : 2,
            evidence: `Structured data coverage ok=${structuredOk}. FAQPage schema ok=${faqSchemaOk}. Detected types: ${[...new Set(rendered.flatMap(p => p.extracted.structuredDataTypes))].join(', ')}`,
            fix: 'Emit JSON-LD deterministically for WebPage/Article + BreadcrumbList and include FAQPage/HowTo/SoftwareApplication/Product schemas when relevant.',
        };

    const altCoverageAvg = rendered.length > 0 ? rendered.reduce((sum, p) => sum + p.htmlSignals.altCoverage, 0) / rendered.length : 1;
    scores.seo.S6 = altCoverageAvg >= 0.9
        ? { score: 5, evidence: `Average image alt coverage: ${(altCoverageAvg * 100).toFixed(0)}%.`, fix: 'No action needed.' }
        : {
            score: altCoverageAvg >= 0.6 ? 3 : 2,
            evidence: `Average image alt coverage: ${(altCoverageAvg * 100).toFixed(0)}%.`,
            fix: 'Ensure key images (especially featured/hero images) have meaningful alt text.',
        };

    // Network detection risk — deterministic heuristics using banned-pattern and burstiness scans.
    const combinedMd = [guideMd, toolMd].filter(Boolean).join('\n\n');
    const violations = scanForBannedPatterns(combinedMd);
    const burst = measureBurstiness(combinedMd);
    const aiFingerprintHits = violations.length;
    const genericMetaCount = genericMeta.length;

    const n1Score = aiFingerprintHits === 0 && genericMetaCount === 0 && genericHeroes.length === 0 ? 5
        : aiFingerprintHits <= 2 ? 4
            : aiFingerprintHits <= 6 ? 3
                : 2;
    scores.network.N1 = {
        score: n1Score,
        evidence: `Banned-pattern hits=${aiFingerprintHits}. Generic meta=${genericMetaCount}. Generic heroes=${genericHeroes.length}.`,
        fix: 'Rewrite/remove AI-fingerprint phrases and ensure page structures/copy are niche-specific (not boilerplate).',
    };

    const n2Score = burst.pass && guideWords >= 650 && aiFingerprintHits <= 2 ? 5
        : burst.pass && guideWords >= 450 ? 4
            : guideWords >= 300 ? 3
                : 2;
    scores.network.N2 = {
        score: n2Score,
        evidence: `Burstiness score=${burst.score.toFixed(2)} (pass=${burst.pass}). Guide words=${guideWords}.`,
        fix: 'Increase originality by adding niche-specific constraints, examples, and varied sentence cadence; remove AI-fingerprint transitions.',
    };

    const hasBranding = Boolean(input.domain.contentConfig?.branding);
    const hasVoiceSeed = Boolean(input.domain.contentConfig?.voiceSeed);
    const n3Score = (hasBranding || hasVoiceSeed) && genericHeroes.length === 0 ? 4 : 3;
    scores.network.N3 = {
        score: n3Score,
        evidence: `Branding overrides present=${hasBranding}. Voice seed present=${hasVoiceSeed}.`,
        fix: 'Add distinctive brand tokens (colors/typography) and voice traits; avoid generic hero/subhead copy.',
    };

    const clamped = clampScores(scores);
    const overallScore = computeOverallScore(clamped);
    const verdict = computeDeterministicVerdict(clamped, criticalIssues);

    return { overallScore, verdict, scores: clamped, criticalIssues, recommendations };
}

const SUBJECTIVE_CRITERIA = new Set<SiteReviewCriterionCode>([
    // These are judgment-heavy; prefer AI when available.
    'C6',
    'Q2',
    'Q5',
    'N1',
    'N2',
    'N3',
]);

function mergeCriterion(
    code: SiteReviewCriterionCode,
    det: SiteReviewCriterionResult,
    ai: SiteReviewCriterionResult | undefined,
): SiteReviewCriterionResult {
    if (!ai) return det;

    if (SUBJECTIVE_CRITERIA.has(code)) {
        return {
            score: clamp1to5(ai.score),
            evidence: ai.evidence || det.evidence,
            fix: ai.fix || det.fix,
        };
    }

    // For objective criteria, treat deterministic checks as authoritative floors.
    const detScore = clamp1to5(det.score);
    const aiScore = clamp1to5(ai.score);
    const mergedScore = clamp1to5(Math.min(detScore, aiScore));
    const useDet = detScore <= aiScore;

    return {
        score: mergedScore,
        evidence: useDet ? det.evidence : ai.evidence,
        fix: useDet ? det.fix : ai.fix,
    };
}

function mergeScores(det: SiteReviewScores, ai?: SiteReviewScores): SiteReviewScores {
    return {
        credibility: {
            C1: mergeCriterion('C1', det.credibility.C1, ai?.credibility.C1),
            C2: mergeCriterion('C2', det.credibility.C2, ai?.credibility.C2),
            C3: mergeCriterion('C3', det.credibility.C3, ai?.credibility.C3),
            C4: mergeCriterion('C4', det.credibility.C4, ai?.credibility.C4),
            C5: mergeCriterion('C5', det.credibility.C5, ai?.credibility.C5),
            C6: mergeCriterion('C6', det.credibility.C6, ai?.credibility.C6),
        },
        quality: {
            Q1: mergeCriterion('Q1', det.quality.Q1, ai?.quality.Q1),
            Q2: mergeCriterion('Q2', det.quality.Q2, ai?.quality.Q2),
            Q3: mergeCriterion('Q3', det.quality.Q3, ai?.quality.Q3),
            Q4: mergeCriterion('Q4', det.quality.Q4, ai?.quality.Q4),
            Q5: mergeCriterion('Q5', det.quality.Q5, ai?.quality.Q5),
        },
        seo: {
            S1: mergeCriterion('S1', det.seo.S1, ai?.seo.S1),
            S2: mergeCriterion('S2', det.seo.S2, ai?.seo.S2),
            S3: mergeCriterion('S3', det.seo.S3, ai?.seo.S3),
            S4: mergeCriterion('S4', det.seo.S4, ai?.seo.S4),
            S5: mergeCriterion('S5', det.seo.S5, ai?.seo.S5),
            S6: mergeCriterion('S6', det.seo.S6, ai?.seo.S6),
        },
        network: {
            N1: mergeCriterion('N1', det.network.N1, ai?.network.N1),
            N2: mergeCriterion('N2', det.network.N2, ai?.network.N2),
            N3: mergeCriterion('N3', det.network.N3, ai?.network.N3),
        },
    };
}

function dedupePreserveOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const key = v.trim();
        if (!key) continue;
        const norm = key.toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        out.push(key);
    }
    return out;
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

    function routeToFilePath(route: string): string {
        if (route === '/') return 'index.html';
        return `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
    }

    // Apply the same internal-linking pass used in deploy generation so review reflects the actual output.
    const pageList = pageDefs.map(pd => ({
        route: pd.route,
        title: pd.title || siteTitle,
    }));

    const reviewFiles = [
        { kind: 'home' as const, def: home },
        { kind: 'tool' as const, def: tool },
        { kind: 'guide' as const, def: guide },
    ].map(({ kind, def }) => ({
        kind,
        def,
        file: {
            path: routeToFilePath(def.route),
            content: render(def),
        },
    }));

    applyInternalLinking(reviewFiles.map(r => r.file), pageList, domain.domain);

    const rendered = reviewFiles.map(({ kind, def, file }) => {
        const htmlSignals = analyzeHtmlSeoSignals(file.content, domain.domain);
        const extracted = htmlToReviewText(file.content, MAX_PAGE_CHARS);
        return { kind, def, extracted, htmlSignals };
    });

    const prompt = buildSiteReviewPrompt({
        domain: domain.domain,
        niche: domain.subNiche || domain.niche || null,
        pages: rendered.map(p => ({ kind: p.kind, route: p.def.route, text: p.extracted.text, truncated: p.extracted.truncated })),
    });

    const det = deterministicReviewSite({
        domain,
        pageDefs,
        selected: { home, tool, guide },
        rendered,
    });

    let aiData: AiReviewPayload | null = null;
    let aiMeta: SiteReviewReport['aiMeta'] = {
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        durationMs: 0,
    };
    let aiError: string | null = null;

    try {
        const resp = await generateJsonWithModel<AiReviewPayload>('anthropic/claude-opus-4.6', prompt);
        aiMeta = resp.meta;
        const parsed = aiReviewPayloadSchema.safeParse(resp.data);
        if (!parsed.success) {
            throw new Error(`Invalid AI review JSON: ${parsed.error.message}`);
        }
        aiData = parsed.data;
    } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
    }

    const mergedScores = mergeScores(det.scores, aiData?.scores);
    const finalOverall = computeOverallScore(mergedScores);
    let finalVerdict = computeDeterministicVerdict(mergedScores, det.criticalIssues);

    // AI can downgrade an "approve" to "needs_work", but should not hard-block deploy by itself.
    if (finalVerdict === 'approve' && aiData && aiData.verdict !== 'approve') {
        finalVerdict = 'needs_work';
    }
    if (finalVerdict === 'approve' && aiError) {
        finalVerdict = 'needs_work';
    }

    const finalCriticalIssues = dedupePreserveOrder([
        ...det.criticalIssues.map(i => `[D] ${i}`),
        ...(aiData?.criticalIssues || []).map(i => `[AI] ${i}`),
    ]);
    const finalRecommendations = dedupePreserveOrder([
        ...det.recommendations,
        ...(aiError ? [`AI review failed: ${aiError}`] : []),
        ...(aiData?.recommendations || []),
    ]);

    return {
        domainId,
        domain: domain.domain,
        reviewedAt: nowIso,
        overallScore: Math.max(1, Math.min(100, finalOverall)),
        verdict: finalVerdict,
        scores: mergedScores,
        criticalIssues: finalCriticalIssues,
        recommendations: finalRecommendations,
        deterministic: det,
        ai: aiData,
        pagesReviewed: rendered.map(p => ({
            kind: p.kind,
            route: p.def.route,
            title: p.def.title ?? null,
            metaDescription: p.def.metaDescription ?? null,
            textChars: p.extracted.textChars,
            truncated: p.extracted.truncated,
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

    const resp = await generateJsonWithModel<AuthorPersona>('anthropic/claude-sonnet-4.5', prompt);
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

async function ensureContactPage(domain: Domain): Promise<{ inserted: number; updated: number; published: number }> {
    const pages = await db.select({
        id: pageDefinitions.id,
        route: pageDefinitions.route,
        title: pageDefinitions.title,
        metaDescription: pageDefinitions.metaDescription,
        theme: pageDefinitions.theme,
        skin: pageDefinitions.skin,
        blocks: pageDefinitions.blocks,
        isPublished: pageDefinitions.isPublished,
        status: pageDefinitions.status,
    })
        .from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, domain.id));

    const byRoute = new Map(pages.map(p => [normalizeRoute(p.route), p]));
    const contact = byRoute.get('/contact') || null;
    const home = byRoute.get('/') || pages[0] || null;

    const niche = domain.subNiche || domain.niche || 'general';
    const preset = generateSubPages(domain.domain, niche).find(p => p.route === '/contact');
    if (!preset) {
        throw new Error('Contact page preset not found');
    }

    const theme = home?.theme || 'clean';
    const skin = home?.skin || domain.skin || 'slate';

    if (!contact) {
        await db.insert(pageDefinitions).values({
            domainId: domain.id,
            route: preset.route,
            title: preset.title,
            metaDescription: preset.metaDescription,
            theme,
            skin,
            blocks: preset.blocks.map(b => ({
                id: b.id,
                type: b.type,
                ...(b.variant ? { variant: b.variant } : {}),
                ...(b.content ? { content: b.content } : {}),
                ...(b.config ? { config: b.config } : {}),
            })),
            isPublished: true,
            status: 'published' as const,
            updatedAt: new Date(),
        });
        return { inserted: 1, updated: 0, published: 1 };
    }

    let updated = 0;
    let published = 0;
    let changed = false;

    const blocks = (contact.blocks || []) as BlockEnvelope[];
    const next = [...blocks];

    // Ensure LeadForm exists and is configured for email capture + privacy policy link
    const leadIdx = next.findIndex(b => b.type === 'LeadForm');
    const leadTemplate: BlockEnvelope = {
        id: blkId(),
        type: 'LeadForm',
        content: {
            heading: `Get Personalized ${niche} Advice`,
            subheading: `Enter your email and we'll send you tailored recommendations based on your needs.`,
            fields: [
                { name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'you@email.com' },
                { name: 'question', label: 'What can we help with?', type: 'text', required: false, placeholder: 'Brief description (optional)' },
            ],
            consentText: 'I agree to receive email communications. You can unsubscribe at any time. Privacy Policy.',
            privacyUrl: '/privacy-policy',
            successMessage: 'Thanks! Check your inbox for our recommendations.',
        },
        config: {
            endpoint: '',
            submitLabel: 'SEND ME RECOMMENDATIONS',
        },
    };

    if (leadIdx < 0) {
        const heroIdx = next.findIndex(b => b.type === 'Hero');
        const insertIdx = heroIdx >= 0 ? heroIdx + 1 : 0;
        next.splice(insertIdx, 0, leadTemplate);
        changed = true;
    } else {
        const cur = next[leadIdx];
        const content = (cur.content || {}) as Record<string, unknown>;
        const cfg = (cur.config || {}) as Record<string, unknown>;
        const mergedContent = {
            ...content,
            ...leadTemplate.content,
        };
        const mergedCfg = {
            ...cfg,
            ...leadTemplate.config,
        };
        if (JSON.stringify(mergedContent) !== JSON.stringify(content) || JSON.stringify(mergedCfg) !== JSON.stringify(cfg)) {
            next[leadIdx] = { ...cur, content: mergedContent, config: mergedCfg };
            changed = true;
        }
    }

    if (!contact.isPublished || contact.status !== 'published') {
        published = 1;
    }

    if (changed) {
        await db.update(pageDefinitions).set({
            title: contact.title || preset.title,
            metaDescription: contact.metaDescription || preset.metaDescription,
            theme: contact.theme || theme,
            skin: contact.skin || skin,
            blocks: next,
            isPublished: true,
            status: 'published',
            updatedAt: new Date(),
        }).where(eq(pageDefinitions.id, contact.id));
        updated = 1;
    } else if (published) {
        await db.update(pageDefinitions).set({
            isPublished: true,
            status: 'published',
            updatedAt: new Date(),
        }).where(eq(pageDefinitions.id, contact.id));
    }

    return { inserted: 0, updated, published };
}

/**
 * remediateSite(domainId, review) — best-effort programmatic fixes for critical issues.
 * After remediation, re-runs validateDomain() and returns the updated report.
 */
export async function remediateSite(domainId: string, review: SiteReviewReport): Promise<ValidationReport> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) throw new Error('Domain not found');

    const c1 = getCriterionScore(review, 'C1');
    const c2 = getCriterionScore(review, 'C2');
    const c3 = getCriterionScore(review, 'C3');
    const c4 = getCriterionScore(review, 'C4');
    const c5 = getCriterionScore(review, 'C5');
    const q1 = getCriterionScore(review, 'Q1');
    const q2 = getCriterionScore(review, 'Q2');
    const q3 = getCriterionScore(review, 'Q3');
    const q4 = getCriterionScore(review, 'Q4');
    const s2 = getCriterionScore(review, 'S2');

    // C5: Compliance pages exist + are published
    if (Number.isFinite(c5) && c5 < 3) {
        await ensureCompliancePages(domain);
    }

    // C2: Contact legitimacy
    if (Number.isFinite(c2) && c2 < 3) {
        await ensureContactPage(domain);
    }

    // C3: LastUpdated visible on content pages
    if (Number.isFinite(c3) && c3 < 3) {
        await ensureLastUpdatedBlocks(domainId);
    }

    // C4: Citations present + non-placeholder
    if (Number.isFinite(c4) && c4 < 3) {
        await ensureCitationBlocks(domain);
    }

    // C1: Author identity persona
    if (Number.isFinite(c1) && c1 < 3) {
        const persona = await generateAuthorPersona(domain);
        await ensureAuthorBioBlocks(domain, persona);
    }

    // Q3: Calculator relevance cannot be safely auto-fixed; surface as a warning via logs.
    if (Number.isFinite(q3) && q3 < 3) {
        console.warn(`[site-review] Calculator relevance flagged for manual review: domain=${domain.domain} (${domainId})`);
    }

    const needHero = Number.isFinite(q1) && q1 < 3;
    const needDepth = Number.isFinite(q2) && q2 < 3;
    const needFaq = Number.isFinite(q4) && q4 < 3;
    const needMeta = Number.isFinite(s2) && s2 < 3;
    const routes = Array.isArray(review.pagesReviewed) ? review.pagesReviewed.map(p => p.route).filter(Boolean) : [];

    if (needHero || needFaq || needMeta || needDepth) {
        await enrichDomain(domainId, {
            routes: routes.length > 0 ? routes : undefined,
            forceHeroes: needHero,
            forceArticleBodies: needDepth,
            minArticleBodyWords: needDepth ? 650 : undefined,
            forceFaqs: needFaq,
            forceMeta: needMeta,
        });
    }

    return validateDomain(domainId);
}

