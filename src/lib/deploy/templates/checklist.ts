/**
 * Checklist page template generator.
 * Extracts H2 headings as checklist steps and renders them as
 * numbered items with CSS-only checkboxes, a progress indicator,
 * and a print button. Includes inline vanilla JS for interactivity.
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

interface ChecklistStep {
    heading: string;
    body: string;
}

/**
 * Extract checklist steps from markdown content.
 * Treats H2 headings (##) as step titles, and everything until the next H2 as the body.
 */
function extractChecklistSteps(markdown: string): ChecklistStep[] {
    const lines = markdown.split('\n');
    const steps: ChecklistStep[] = [];
    let currentHeading = '';
    let currentBody: string[] = [];

    for (const line of lines) {
        const h2Match = /^##\s+(.+)$/.exec(line);
        if (h2Match) {
            if (currentHeading) {
                steps.push({
                    heading: currentHeading,
                    body: currentBody.join('\n').trim(),
                });
            }
            currentHeading = h2Match[1];
            currentBody = [];
        } else if (currentHeading) {
            currentBody.push(line);
        }
    }

    // Push last step
    if (currentHeading) {
        steps.push({
            heading: currentHeading,
            body: currentBody.join('\n').trim(),
        });
    }

    return steps;
}

function buildProgressHtml(totalSteps: number): string {
    return `<div class="checklist-progress" id="checklist-progress">
  <span id="checklist-completed-count">0</span> of <span>${totalSteps}</span> completed
</div>`;
}

function buildChecklistPrintButton(): string {
    return `<button class="print-btn" type="button" onclick="window.print()">Print this checklist</button>`;
}

function buildChecklistScript(): string {
    return `<script>
(function() {
  var checkboxes = document.querySelectorAll('.checklist-item input[type="checkbox"]');
  var countEl = document.getElementById('checklist-completed-count');
  if (!checkboxes.length || !countEl) return;

  function updateCount() {
    var checked = 0;
    checkboxes.forEach(function(cb) { if (cb.checked) checked++; });
    countEl.textContent = String(checked);
  }

  checkboxes.forEach(function(cb) {
    cb.addEventListener('change', updateCount);
  });
})();
</script>`;
}

export async function generateChecklistPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
    pageShell: import('./shared').PageShell,
): Promise<string> {
    const markdown = article.contentMarkdown || '';
    const steps = extractChecklistSteps(markdown);
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);
    const schemaLd = buildSchemaJsonLd(article, domain, 'Article', {
        articleSection: 'Checklist',
    });

    const titleHtml = escapeHtml(article.title);
    let contentBlock: string;

    if (steps.length > 0) {
        const progressHtml = buildProgressHtml(steps.length);
        const printBtnHtml = buildChecklistPrintButton();

        const stepItems: string[] = [];
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const bodyHtml = step.body ? await renderMarkdownToHtml(step.body, { currentDomain: domain }) : '';
            const inputId = `checklist-step-${i}`;
            stepItems.push(`<div class="checklist-item">
  <label for="${inputId}">
    <input type="checkbox" id="${inputId}" />
    <span class="checklist-check"></span>
    <strong>${i + 1}. ${escapeHtml(step.heading)}</strong>
  </label>
  <div class="checklist-content">${bodyHtml}</div>
</div>`);
        }

        contentBlock = `${progressHtml}
    ${printBtnHtml}
    <div class="checklist-list">${stepItems.join('\n')}</div>`;
    } else {
        // No H2 headings found — fall back to full rendered markdown
        const fullHtml = await renderMarkdownToHtml(markdown, { currentDomain: domain });
        contentBlock = `${fullHtml}`;
    }

    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const ogTags = buildOpenGraphTags(article, domain);
    const printBtnGlobal = buildPrintButton('checklist');

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtnGlobal}
  <article>
    <h1>${titleHtml}</h1>
    ${contentBlock}
  </article>
  ${dataSourcesHtml}
  ${trustHtml}
  ${steps.length > 0 ? buildChecklistScript() : ''}`;

    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
