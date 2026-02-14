/**
 * Cost guide page template generator.
 * Renders cost range displays, factor breakdowns,
 * and standard article content below.
 */

import type { Article } from '@/lib/db/schema';
import {
    escapeHtml,
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

interface CostRange {
    low: number;
    average: number;
    high: number;
    label?: string;
}

interface CostFactor {
    name: string;
    impact: 'low' | 'medium' | 'high';
    description: string;
}

/**
 * Structured cost guide data that can be attached to an article.
 * If present, takes priority over regex extraction.
 */
interface CostGuideData {
    ranges?: Array<{
        label?: string;
        low: number;
        high: number;
        average?: number;
        dataPoints?: number[];
    }>;
    factors?: CostFactor[];
}

/** Compute a proper average from data points, or midpoint fallback. */
function computeAverage(dataPoints: number[], low: number, high: number): number {
    if (dataPoints.length > 0) {
        return Math.round(dataPoints.reduce((s, v) => s + v, 0) / dataPoints.length);
    }
    return Math.round((low + high) / 2);
}

/** Try to extract a cost range from a statistic string containing dollar amounts. */
function parseCostRangeFromStat(text: string): CostRange | null {
    const match = text.match(/\$[\d,]+/g);
    if (!match || match.length < 2) return null;

    const nums = match.map(m => Number.parseFloat(m.replaceAll(/[$,]/g, ''))).filter(n => !Number.isNaN(n));
    if (nums.length < 2) return null;

    nums.sort((a, b) => a - b);
    return {
        low: nums[0],
        average: computeAverage(nums.length > 2 ? nums : [], nums[0], nums.at(-1)!),
        high: nums.at(-1)!,
    };
}

/**
 * Extract cost data from article.
 * Priority: structured costGuideData > researchData regex extraction.
 */
function extractCostData(article: Article): { ranges: CostRange[]; factors: CostFactor[] } {
    // Check for structured cost data (set via API or pipeline)
    const structured = (article as Record<string, unknown>).costGuideData as CostGuideData | null;
    if (structured) {
        const ranges: CostRange[] = (structured.ranges || []).map(r => ({
            low: r.low,
            high: r.high,
            average: r.average ?? computeAverage(r.dataPoints || [], r.low, r.high),
            label: r.label,
        }));
        return { ranges, factors: structured.factors || [] };
    }

    // Fallback: regex extraction from research data
    const research = article.researchData as Record<string, unknown> | null;
    const ranges: CostRange[] = [];
    const factors: CostFactor[] = [];

    if (research?.statistics && Array.isArray(research.statistics)) {
        for (const stat of research.statistics) {
            const s = stat as { stat?: string };
            if (!s.stat) continue;
            const range = parseCostRangeFromStat(s.stat);
            if (range) ranges.push(range);
        }
    }

    if (research?.factors && Array.isArray(research.factors)) {
        for (const f of research.factors) {
            const factor = f as { name?: string; impact?: 'low' | 'medium' | 'high'; description?: string };
            if (factor.name) {
                factors.push({
                    name: factor.name,
                    impact: factor.impact || 'medium',
                    description: factor.description || '',
                });
            }
        }
    }

    return { ranges, factors };
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function buildCostRangeHtml(ranges: CostRange[]): string {
    if (ranges.length === 0) return '';

    const rangeCards = ranges.map(r => {
        const label = r.label ? `<h3>${escapeHtml(r.label)}</h3>` : '';
        return `<div class="cost-range">
  ${label}
  <div class="cost-range-bar">
    <div class="cost-low"><span class="cost-label">Low</span><span class="cost-value">${formatCurrency(r.low)}</span></div>
    <div class="cost-avg"><span class="cost-label">Average</span><span class="cost-value">${formatCurrency(r.average)}</span></div>
    <div class="cost-high"><span class="cost-label">High</span><span class="cost-value">${formatCurrency(r.high)}</span></div>
  </div>
</div>`;
    }).join('\n');

    return `<section class="cost-ranges">${rangeCards}</section>`;
}

function buildFactorsGrid(factors: CostFactor[]): string {
    if (factors.length === 0) return '';

    const cards = factors.map(f => {
        const impactClass = `impact-${f.impact}`;
        return `<div class="factor-card ${impactClass}">
  <h4>${escapeHtml(f.name)}</h4>
  <span class="factor-impact">${f.impact} impact</span>
  <p>${escapeHtml(f.description)}</p>
</div>`;
    }).join('\n');

    return `<section class="factors-grid"><h2>Cost Factors</h2><div class="factors-cards">${cards}</div></section>`;
}

export async function generateCostGuidePage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
    pageShell: import('./shared').PageShell,
): Promise<string> {
    const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);
    const schemaLd = buildSchemaJsonLd(article, domain, 'Article');

    const { ranges, factors } = extractCostData(article);
    const costRangeHtml = buildCostRangeHtml(ranges);
    const factorsHtml = buildFactorsGrid(factors);

    const titleHtml = escapeHtml(article.title);
    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const ogTags = buildOpenGraphTags(article, domain);
    const printBtn = buildPrintButton('cost_guide');

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  <article>
    <h1>${titleHtml}</h1>
    ${costRangeHtml}
    ${factorsHtml}
    ${contentHtml}
  </article>
  ${dataSourcesHtml}
  ${trustHtml}`;

    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
