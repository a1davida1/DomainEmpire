/**
 * Interactive infographic template.
 * Uses structured data from comparisonData / costGuideData when available.
 */

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
    type Article,
} from './shared';

type InfographicItem = {
    id: string;
    title: string;
    metricLabel: string;
    metricValue: number;
    summary: string;
    group: string;
};

function clampMetric(value: number): number {
    if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function parseInfographicItems(article: Article): InfographicItem[] {
    const items: InfographicItem[] = [];

    if (article.comparisonData?.options?.length && article.comparisonData.columns?.length) {
        const seenComparisonIds = new Set<string>();
        for (const option of article.comparisonData.options) {
            let total = 0;
            let numericCount = 0;
            for (const col of article.comparisonData.columns) {
                const value = option.scores?.[col.key];
                if (typeof value === 'number' && Number.isFinite(value)) {
                    total += value;
                    numericCount += 1;
                }
            }
            const normalized = numericCount > 0
                ? clampMetric((total / numericCount) * 20) // 1-5 ratings -> 20-100
                : 0;
            const baseId = option.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') || 'option';
            let uniqueId = baseId;
            let suffix = 1;
            while (seenComparisonIds.has(uniqueId)) {
                uniqueId = `${baseId}-${suffix}`;
                suffix += 1;
            }
            seenComparisonIds.add(uniqueId);
            items.push({
                id: uniqueId,
                title: option.name,
                metricLabel: 'Composite Score',
                metricValue: normalized,
                summary: option.badge || article.comparisonData.verdict || 'Comparison data point',
                group: option.badge || 'General',
            });
        }
    }

    if (items.length === 0 && article.costGuideData?.ranges?.length) {
        const seenIds = new Set<string>();
        for (let i = 0; i < article.costGuideData.ranges.length; i++) {
            const range = article.costGuideData.ranges[i];
            const low = typeof range.low === 'number' && Number.isFinite(range.low) ? range.low : 0;
            const high = typeof range.high === 'number' && Number.isFinite(range.high) ? range.high : 0;
            const average = typeof range.average === 'number' && Number.isFinite(range.average)
                ? range.average
                : (high > 0 ? (low + high) / 2 : 0);
            const spread = high > 0 ? clampMetric((average / high) * 100) : 0;
            let baseId = (range.label || 'range').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
            if (seenIds.has(baseId)) {
                baseId = `${baseId}-${i}`;
            }
            seenIds.add(baseId);
            items.push({
                id: baseId,
                title: range.label || 'Cost Range',
                metricLabel: 'Relative Cost Position',
                metricValue: spread,
                summary: `$${low.toLocaleString()} - $${high.toLocaleString()}`,
                group: 'Cost',
            });
        }
    }

    return items;
}

function buildInfographicScript(): string {
    return `<script>
(function(){
  var shell=document.querySelector('.infographic-shell');
  if(!shell) return;
  var cards=Array.from(shell.querySelectorAll('.infographic-card'));
  var chips=Array.from(shell.querySelectorAll('[data-infographic-filter]'));
  var sort= shell.querySelector('#infographic-sort');

  function applyFilter(group){
    cards.forEach(function(card){
      var show = group==='all' || card.dataset.group===group;
      card.style.display = show ? '' : 'none';
    });
  }

  function applySort(mode){
    var sorted = cards.slice().sort(function(a,b){
      var av = Number(a.dataset.metric || 0);
      var bv = Number(b.dataset.metric || 0);
      return mode==='asc' ? av-bv : bv-av;
    });
    var grid = shell.querySelector('.infographic-grid');
    if(!grid) return;
    sorted.forEach(function(card){ grid.appendChild(card); });
  }

  chips.forEach(function(chip){
    chip.addEventListener('click', function(){
      chips.forEach(function(c){ c.classList.remove('active'); });
      chip.classList.add('active');
      applyFilter(chip.dataset.infographicFilter || 'all');
      applySort(String(sort && sort.value ? sort.value : 'desc'));
    });
  });

  if(sort){
    sort.addEventListener('change', function(){
      applySort(String(sort.value || 'desc'));
    });
  }
})();
</script>`;
}

export async function generateInteractiveInfographicPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
    pageShell: import('./shared').PageShell,
): Promise<string> {
    const items = parseInfographicItems(article);
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);
    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const printBtn = buildPrintButton('comparison');
    const ogTags = buildOpenGraphTags(article, domain);
    const titleHtml = escapeHtml(article.title);

    let contentHtml: string;
    if (items.length === 0) {
        const fallbackHtml = await renderMarkdownToHtml(article.contentMarkdown || '', { currentDomain: domain });
        contentHtml = `<article><h1>${titleHtml}</h1>${fallbackHtml}</article>`;
    } else {
        const groups = Array.from(new Set(items.map(i => i.group))).filter(Boolean);
        const chipsHtml = [
            '<button type="button" class="infographic-chip active" data-infographic-filter="all">All</button>',
            ...groups.map(g => `<button type="button" class="infographic-chip" data-infographic-filter="${escapeAttr(g)}">${escapeHtml(g)}</button>`),
        ].join('\n');

        const cardsHtml = items.map((item) => {
            const width = clampMetric(item.metricValue);
            return `<article class="infographic-card" data-group="${escapeAttr(item.group)}" data-metric="${item.metricValue}">
  <h3>${escapeHtml(item.title)}</h3>
  <p class="infographic-summary">${escapeHtml(item.summary)}</p>
  <div class="infographic-meter">
    <span class="infographic-meter-label">${escapeHtml(item.metricLabel)}</span>
    <strong>${item.metricValue}</strong>
  </div>
  <div class="infographic-bar"><span style="width:${width}%"></span></div>
</article>`;
        }).join('\n');

        contentHtml = `<article>
  <h1>${titleHtml}</h1>
  <section class="infographic-shell">
    <div class="infographic-toolbar">
      <div class="infographic-chips">${chipsHtml}</div>
      <label for="infographic-sort">Sort
        <select id="infographic-sort">
          <option value="desc">Highest score first</option>
          <option value="asc">Lowest score first</option>
        </select>
      </label>
    </div>
    <div class="infographic-grid">${cardsHtml}</div>
  </section>
</article>`;
    }

    const schemaLd = buildSchemaJsonLd(article, domain, 'ItemList', {
        numberOfItems: items.length || undefined,
        itemListElement: items.length > 0
            ? items.map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: item.title,
            }))
            : undefined,
    });

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  ${contentHtml}
  ${dataSourcesHtml}
  ${trustHtml}
  ${items.length > 0 ? buildInfographicScript() : ''}`;

    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
