/**
 * FAQ page template generator.
 * Parses FAQ content into details/summary accordion elements
 * and emits FAQPage JSON-LD with mainEntity array.
 * No JavaScript required — uses native HTML disclosure elements.
 */

import type { Article } from '@/lib/db/schema';
import {
    escapeHtml,
    renderMarkdownToHtml,
    buildTrustElements,
    buildSchemaJsonLd,
    wrapInAstroLayout,
    generateDataSourcesSection,
    buildOpenGraphTags,
    buildFreshnessBadge,
    buildPrintButton,
    type DisclosureInfo,
    type ArticleDatasetInfo,
} from './shared';

interface FaqItem {
    question: string;
    answer: string;
}

/** Truncate text at the last sentence boundary before maxLen, adding ellipsis if needed. */
function truncateAtSentence(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const truncated = text.substring(0, maxLen);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > maxLen * 0.3) {
        return truncated.substring(0, lastPeriod + 1) + '...';
    }
    // No good sentence boundary — truncate at last space
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
}

/**
 * Extract FAQ items from markdown content.
 * Treats H2 headings (##) as questions, and everything until the next H2 as the answer.
 */
function extractFaqItems(markdown: string): FaqItem[] {
    const lines = markdown.split('\n');
    const items: FaqItem[] = [];
    let currentQuestion = '';
    let currentAnswer: string[] = [];

    for (const line of lines) {
        const h2Match = /^##\s+(.+)$/.exec(line);
        if (h2Match) {
            if (currentQuestion) {
                items.push({
                    question: currentQuestion,
                    answer: currentAnswer.join('\n').trim(),
                });
            }
            currentQuestion = h2Match[1];
            currentAnswer = [];
        } else if (currentQuestion) {
            currentAnswer.push(line);
        }
    }

    // Push last item
    if (currentQuestion) {
        items.push({
            question: currentQuestion,
            answer: currentAnswer.join('\n').trim(),
        });
    }

    return items;
}

export async function generateFaqPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
): Promise<string> {
    const markdown = article.contentMarkdown || '';
    const faqItems = extractFaqItems(markdown);
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);

    // Build FAQPage JSON-LD
    const mainEntity = faqItems.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
            '@type': 'Answer',
            text: truncateAtSentence(item.answer.replaceAll('\n', ' '), 500),
        },
    }));

    const schemaLd = buildSchemaJsonLd(article, domain, 'FAQPage', {
        mainEntity,
    });

    // Render FAQ items as native details/summary
    const faqHtmlParts: string[] = [];
    for (const item of faqItems) {
        const answerHtml = await renderMarkdownToHtml(item.answer);
        faqHtmlParts.push(`<details class="faq-item">
  <summary class="faq-question">${escapeHtml(item.question)}</summary>
  <div class="faq-answer">${answerHtml}</div>
</details>`);
    }

    // If no FAQ items were extracted, fall back to standard rendered content
    let contentBlock: string;
    if (faqHtmlParts.length > 0) {
        contentBlock = `<div class="faq-list">${faqHtmlParts.join('\n')}</div>`;
    } else {
        const fullHtml = await renderMarkdownToHtml(markdown);
        contentBlock = `<Fragment set:html={${JSON.stringify(fullHtml)}} />`;
    }

    const titleHtml = escapeHtml(article.title);
    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const ogTags = buildOpenGraphTags(article, domain);
    const printBtn = buildPrintButton('faq');

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  <article>
    <h1>${titleHtml}</h1>
    ${contentBlock}
  </article>
  ${dataSourcesHtml}
  ${trustHtml}`;

    return wrapInAstroLayout(article.title, article.metaDescription || '', body, ogTags);
}
