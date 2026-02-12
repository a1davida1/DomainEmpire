/**
 * Comparison page template generator.
 * Renders sortable comparison tables with winner badges,
 * affiliate CTAs, and ItemList JSON-LD.
 */

import type { Article } from '@/lib/db/schema';
import {
    escapeHtml,
    escapeAttr,
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

type ComparisonOption = {
    name: string;
    url?: string;
    badge?: string;
    scores: Record<string, number | string>;
};

type ComparisonColumn = {
    key: string;
    label: string;
    type: 'number' | 'text' | 'rating';
    sortable?: boolean;
};

type ComparisonData = {
    options: ComparisonOption[];
    columns: ComparisonColumn[];
    defaultSort?: string;
    verdict?: string;
};

function buildComparisonTable(data: ComparisonData): string {
    // Header row
    const headerCells = [
        '<th scope="col">Name</th>',
        ...data.columns.map(col => {
            const isSortable = col.sortable ?? true;
            const sortAttr = isSortable
                ? ` data-sort-key="${escapeAttr(col.key)}" role="button" tabindex="0"`
                : '';
            return `<th scope="col"${sortAttr}>${escapeHtml(col.label)}${isSortable ? ' <span class="sort-indicator">↕</span>' : ''}</th>`;
        }),
        '<th scope="col"></th>', // CTA column
    ];

    // Data rows
    const rows = data.options.map(option => {
        const badge = option.badge
            ? `<span class="comparison-badge">${escapeHtml(option.badge)}</span> `
            : '';
        const nameCell = `<td>${badge}${escapeHtml(option.name)}</td>`;

        const dataCells = data.columns.map(col => {
            const val = option.scores[col.key];
            if (val == null) return '<td>—</td>';

            if (col.type === 'rating' && typeof val === 'number') {
                const stars = '★'.repeat(Math.min(val, 5)) + '☆'.repeat(Math.max(5 - val, 0));
                return `<td data-value="${val}">${stars} ${val}/5</td>`;
            }
            return `<td data-value="${escapeAttr(String(val))}">${escapeHtml(String(val))}</td>`;
        }).join('');

        const cta = option.url
            ? `<td><a href="${escapeAttr(option.url)}" class="cta-button" rel="nofollow noopener sponsored" target="_blank">Visit</a></td>`
            : '<td></td>';

        return `<tr>${nameCell}${dataCells}${cta}</tr>`;
    }).join('\n');

    return `<div class="comparison-table-wrapper">
<table class="comparison-table" id="comparison-table">
  <thead><tr>${headerCells.join('')}</tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

function buildSortScript(defaultSort?: string): string {
    return `<script>
(function() {
  var table = document.getElementById('comparison-table');
  if (!table) return;
  var headers = table.querySelectorAll('th[data-sort-key]');
  var currentSort = null;
  var ascending = true;

  headers.forEach(function(th) {
    th.addEventListener('click', function() { sortBy(th); });
    th.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(th); }
    });
  });

  function sortBy(th) {
    var key = th.getAttribute('data-sort-key');
    if (currentSort === key) { ascending = !ascending; }
    else { currentSort = key; ascending = true; }

    var colIndex = Array.from(th.parentNode.children).indexOf(th);
    var tbody = table.querySelector('tbody');
    var rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort(function(a, b) {
      var aCell = a.children[colIndex];
      var bCell = b.children[colIndex];
      var aVal = aCell ? (aCell.getAttribute('data-value') || aCell.textContent || '') : '';
      var bVal = bCell ? (bCell.getAttribute('data-value') || bCell.textContent || '') : '';

      var aNum = parseFloat(aVal);
      var bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return ascending ? aNum - bNum : bNum - aNum;
      }
      return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    rows.forEach(function(r) { tbody.appendChild(r); });

    // Update indicators
    headers.forEach(function(h) {
      var ind = h.querySelector('.sort-indicator');
      if (ind) ind.textContent = h === th ? (ascending ? '↑' : '↓') : '↕';
    });
  }

  // Auto-sort by defaultSort column on page load
  var defaultKey = ${JSON.stringify(defaultSort || '')};
  if (defaultKey) {
    headers.forEach(function(th) {
      if (th.getAttribute('data-sort-key') === defaultKey) sortBy(th);
    });
  }
})();
</script>`;
}

export async function generateComparisonPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
): Promise<string> {
    const data = article.comparisonData as ComparisonData | null;
    const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);

    // Build ItemList JSON-LD
    const itemListElements = data?.options.map((opt, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: opt.name,
        url: opt.url || undefined,
    })) || [];

    const schemaLd = buildSchemaJsonLd(article, domain, 'ItemList', {
        itemListElement: itemListElements,
        numberOfItems: itemListElements.length,
    });

    let tableHtml = '';
    if (data && data.options.length > 0) {
        tableHtml = buildComparisonTable(data);
    }

    let verdictHtml = '';
    if (data?.verdict) {
        verdictHtml = `<div class="comparison-verdict"><strong>Our Verdict:</strong> ${escapeHtml(data.verdict)}</div>`;
    }

    const titleHtml = escapeHtml(article.title);
    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const ogTags = buildOpenGraphTags(article, domain);
    const printBtn = buildPrintButton('comparison');

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  <article>
    <h1>${titleHtml}</h1>
    ${verdictHtml}
    ${tableHtml}
    <Fragment set:html={${JSON.stringify(contentHtml)}} />
  </article>
  ${dataSourcesHtml}
  ${trustHtml}
  ${data ? buildSortScript(data.defaultSort) : ''}`;

    return wrapInAstroLayout(article.title, article.metaDescription || '', body, ogTags);
}
