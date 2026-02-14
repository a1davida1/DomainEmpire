/**
 * Review page template generator.
 * Renders product/service reviews with star ratings, pros/cons,
 * verdict badges, and affiliate CTAs.
 * Reuses the same comparisonData shape (options with scores)
 * but presents it in a review-card layout rather than a table.
 */

import type { Article } from '@/lib/db/schema';
import {
    escapeHtml,
    escapeAttr,
    renderMarkdownToHtml,
    buildTrustElements,
    buildSchemaJsonLd,
    wrapInHtmlPage,
    generateDataSourcesSection,
    buildOpenGraphTags,
    buildFreshnessBadge,
    buildPrintButton,
    type DisclosureInfo,
    type ArticleDatasetInfo,
} from './shared';

type ReviewOption = {
    name: string;
    url?: string;
    badge?: string;
    scores: Record<string, number | string | string[]>;
};

type ReviewData = {
    options: ReviewOption[];
    columns?: Array<{ key: string; label: string }>;
    verdict?: string;
};

/** Render a star rating as HTML (filled + empty stars with numeric display). */
function buildStarRatingHtml(rating: number): string {
    const clamped = Math.max(0, Math.min(5, rating));
    const fullStars = Math.floor(clamped);
    const emptyStars = 5 - fullStars;
    const stars = '\u2605'.repeat(fullStars) + '\u2606'.repeat(emptyStars);
    return `<span class="review-stars" aria-label="${clamped} out of 5 stars">${stars} ${clamped}/5</span>`;
}

/** Parse a list value from scores — accepts string[] or comma-separated string. */
function parseListValue(val: unknown): string[] | null {
    if (Array.isArray(val)) {
        return val.filter(item => typeof item === 'string' && item.trim().length > 0);
    }
    if (typeof val === 'string' && val.trim().length > 0) {
        return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    return null;
}

function buildReviewCardHtml(option: ReviewOption): string {
    const nameHtml = escapeHtml(option.name);

    // Badge
    const badgeHtml = option.badge
        ? `<span class="review-badge">${escapeHtml(option.badge)}</span>`
        : '';

    // Star rating: prefer scores.rating, fall back to scores.overall
    let ratingHtml = '';
    const ratingVal = option.scores.rating ?? option.scores.overall;
    if (typeof ratingVal === 'number') {
        ratingHtml = buildStarRatingHtml(ratingVal);
    } else if (typeof ratingVal === 'string') {
        const parsed = parseFloat(ratingVal);
        if (!isNaN(parsed)) {
            ratingHtml = buildStarRatingHtml(parsed);
        }
    }

    // Pros list
    let prosHtml = '';
    const prosItems = parseListValue(option.scores.pros);
    if (prosItems && prosItems.length > 0) {
        const items = prosItems.map(p => `<li>${escapeHtml(p)}</li>`).join('\n');
        prosHtml = `<div class="review-pros"><h3>Pros</h3><ul>${items}</ul></div>`;
    }

    // Cons list
    let consHtml = '';
    const consItems = parseListValue(option.scores.cons);
    if (consItems && consItems.length > 0) {
        const items = consItems.map(c => `<li>${escapeHtml(c)}</li>`).join('\n');
        consHtml = `<div class="review-cons"><h3>Cons</h3><ul>${items}</ul></div>`;
    }

    // Affiliate CTA
    const ctaHtml = option.url
        ? `<a href="${escapeAttr(option.url)}" class="cta-button review-cta" rel="nofollow noopener sponsored" target="_blank">Learn More</a>`
        : '';

    return `<div class="review-card">
  <div class="review-card-header">
    <h2>${badgeHtml}${nameHtml}</h2>
    ${ratingHtml}
  </div>
  <div class="review-card-body">
    ${prosHtml}
    ${consHtml}
  </div>
  <div class="review-card-footer">
    ${ctaHtml}
  </div>
</div>`;
}

function buildVerdictBoxHtml(verdict: string): string {
    return `<div class="review-verdict">
  <strong>Verdict:</strong> ${escapeHtml(verdict)}
</div>`;
}

export async function generateReviewPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
    pageShell: import('./shared').PageShell,
): Promise<string> {
    const data = article.comparisonData as ReviewData | null;
    const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);
    const schemaLd = buildSchemaJsonLd(article, domain, 'Article');

    const titleHtml = escapeHtml(article.title);

    // Build review cards
    let reviewCardsHtml = '';
    if (data && data.options && data.options.length > 0) {
        const cards = data.options.map(option => buildReviewCardHtml(option));
        reviewCardsHtml = `<section class="review-cards">${cards.join('\n')}</section>`;
    }

    // Verdict box
    let verdictHtml = '';
    if (data?.verdict) {
        verdictHtml = buildVerdictBoxHtml(data.verdict);
    }

    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const ogTags = buildOpenGraphTags(article, domain);
    const printBtn = buildPrintButton('review');

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  <article>
    <h1>${titleHtml}</h1>
    ${reviewCardsHtml}
    ${verdictHtml}
    ${contentHtml}
  </article>
  ${dataSourcesHtml}
  ${trustHtml}`;

    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
