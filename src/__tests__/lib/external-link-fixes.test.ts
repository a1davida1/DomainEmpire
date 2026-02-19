import { describe, expect, it, vi } from 'vitest';

// Mock heavy deps so module-level imports don't crash
vi.mock('@/lib/db', () => ({
    db: {},
    articles: { id: 'id' },
    contentQueue: { id: 'id' },
    apiCallLogs: { id: 'id' },
    keywords: { id: 'id' },
    domains: { id: 'id' },
    citations: { id: 'id', articleId: 'article_id', notes: 'notes' },
}));
vi.mock('@/lib/ai/openrouter', () => ({ getAIClient: vi.fn() }));
vi.mock('@/lib/ai/prompts', () => ({ PROMPTS: {} }));
vi.mock('@/lib/ai/voice-seed', () => ({ getOrCreateVoiceSeed: vi.fn() }));
vi.mock('@/lib/audit/revisions', () => ({ createRevision: vi.fn() }));
vi.mock('@/lib/review/ymyl', () => ({ classifyYmylLevel: vi.fn() }));
vi.mock('@/lib/validation/articles', () => ({
    calculatorConfigSchema: { safeParse: vi.fn() },
    comparisonDataSchema: { safeParse: vi.fn() },
    wizardConfigSchema: { safeParse: vi.fn() },
    geoDataSchema: { safeParse: vi.fn() },
    isAllowedLeadEndpoint: vi.fn(),
}));
vi.mock('@/lib/queue/content-queue', () => ({ enqueueContentJob: vi.fn() }));
vi.mock('@/lib/ai/research-cache', () => ({ generateResearchWithCache: vi.fn() }));
vi.mock('drizzle-orm', () => ({
    eq: vi.fn(), and: vi.fn(), sql: vi.fn(), ilike: vi.fn(),
    relations: vi.fn(() => ({})),
}));
vi.mock('marked', () => ({ marked: { parse: vi.fn() } }));
vi.mock('sanitize-html', () => {
    const fn = (html: string) => html;
    fn.defaults = { allowedTags: [], allowedAttributes: {} };
    return { default: fn };
});

const { addExternalLinkAttributes } = await import('@/lib/deploy/templates/shared');
const { parseExternalLinkPlaceholders, replaceExternalLinks } = await import('@/lib/ai/pipeline');

describe('addExternalLinkAttributes', () => {
    it('adds rel and target to external links', () => {
        const html = '<a href="https://example.com">Link</a>';
        const result = addExternalLinkAttributes(html);
        expect(result).toContain('rel="nofollow noopener noreferrer"');
        expect(result).toContain('target="_blank"');
    });

    it('leaves relative links unchanged', () => {
        const html = '<a href="/about">About</a>';
        const result = addExternalLinkAttributes(html);
        expect(result).toBe(html);
    });

    it('matches href when it is NOT the first attribute (Bug 5 regression)', () => {
        const html = '<a class="link" href="https://example.com">Link</a>';
        const result = addExternalLinkAttributes(html);
        expect(result).toContain('rel="nofollow noopener noreferrer"');
        expect(result).toContain('target="_blank"');
        expect(result).toContain('class="link"');
    });

    it('does not double-add rel when already present', () => {
        const html = '<a rel="nofollow" href="https://example.com">Link</a>';
        const result = addExternalLinkAttributes(html);
        const relCount = (result.match(/rel=/g) || []).length;
        expect(relCount).toBe(1);
        expect(result).toContain('target="_blank"');
    });

    it('does not double-add target when already present', () => {
        const html = '<a href="https://example.com" target="_blank">Link</a>';
        const result = addExternalLinkAttributes(html);
        const targetCount = (result.match(/target=/g) || []).length;
        expect(targetCount).toBe(1);
        expect(result).toContain('rel="nofollow noopener noreferrer"');
    });

    it('handles multiple links in one string', () => {
        const html = '<a href="https://a.com">A</a> <a class="x" href="https://b.com">B</a>';
        const result = addExternalLinkAttributes(html);
        expect(result).toContain('href="https://a.com"');
        expect(result).toContain('href="https://b.com"');
        const relCount = (result.match(/rel="nofollow noopener noreferrer"/g) || []).length;
        expect(relCount).toBe(2);
    });
});

describe('replaceExternalLinks', () => {
    it('replaces a single placeholder', () => {
        const md = 'Check [EXTERNAL_LINK: CDC guidelines | government report] for info.';
        const placeholders = parseExternalLinkPlaceholders(md);
        const resolved = [{
            anchorText: 'CDC guidelines',
            url: 'https://cdc.gov/guidelines',
            sourceTitle: 'CDC',
            sourceType: 'government report',
            confidence: 'high' as const,
        }];

        const result = replaceExternalLinks(md, placeholders, resolved);
        expect(result).toBe('Check [CDC guidelines](https://cdc.gov/guidelines) for info.');
    });

    it('replaces ALL occurrences of the same placeholder (Bug 7 regression)', () => {
        const md = 'See [EXTERNAL_LINK: CDC | gov] here and also [EXTERNAL_LINK: CDC | gov] there.';
        const placeholders = parseExternalLinkPlaceholders(md);
        const resolved = [{
            anchorText: 'CDC',
            url: 'https://cdc.gov',
            sourceTitle: 'CDC',
            sourceType: 'gov',
            confidence: 'high' as const,
        }];

        const result = replaceExternalLinks(md, placeholders, resolved);
        expect(result).not.toContain('[EXTERNAL_LINK:');
        const linkCount = (result.match(/\[CDC\]\(https:\/\/cdc\.gov\)/g) || []).length;
        expect(linkCount).toBe(2);
    });

    it('falls back to anchor text when URL is not resolved', () => {
        const md = 'Visit [EXTERNAL_LINK: some site | blog] for more.';
        const placeholders = parseExternalLinkPlaceholders(md);
        const resolved: Array<{ anchorText: string; url: string; sourceTitle: string; sourceType: string; confidence: 'high' | 'medium' | 'low' }> = [];

        const result = replaceExternalLinks(md, placeholders, resolved);
        expect(result).toBe('Visit some site for more.');
    });
});
