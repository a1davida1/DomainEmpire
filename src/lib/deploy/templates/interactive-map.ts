/**
 * Interactive map template.
 * Renders region/state selectors from geoData with client-side filtering.
 */

import {
    escapeHtml,
    escapeAttr,
    renderMarkdownToHtml,
    sanitizeArticleHtml,
    buildTrustElements,
    buildSchemaJsonLd,
    wrapInHtmlPage,
    generateDataSourcesSection,
    buildOpenGraphTags,
    buildFreshnessBadge,
    type DisclosureInfo,
    type ArticleDatasetInfo,
    type Article,
} from './shared';

type GeoEntry = {
    key: string;
    label: string;
    content: string;
};

function parseGeoEntries(article: Article): GeoEntry[] {
    if (!article.geoData?.regions) return [];
    return Object.entries(article.geoData.regions).map(([key, value]) => ({
        key,
        label: value.label || key.toUpperCase(),
        content: sanitizeArticleHtml(value.content),
    }));
}

function buildMapTiles(entries: GeoEntry[]): string {
    if (entries.length < 8) return '';
    const tiles = entries.map((entry) => (
        `<button type="button" class="imap-state-tile" data-region-key="${escapeAttr(entry.key)}" aria-label="${escapeAttr(entry.label)}">${escapeHtml(entry.key.toUpperCase())}</button>`
    )).join('\n');
    return `<div class="imap-map-grid" aria-label="Interactive region map">
  ${tiles}
</div>`;
}

function buildMapScript(defaultKey: string): string {
    return `<script>
(function(){
  var root=document.querySelector('.imap-shell');
  if(!root) return;
  var select=root.querySelector('#imap-select');
  var buttons=Array.from(root.querySelectorAll('[data-region-key]'));
  var panels=Array.from(root.querySelectorAll('.imap-panel'));
  var fallback=root.querySelector('.imap-fallback');

  function setActive(key){
    var matched=false;
    buttons.forEach(function(btn){
      var active = btn.dataset.regionKey === key;
      btn.classList.toggle('active', active);
    });
    panels.forEach(function(panel){
      var show = panel.dataset.regionKey === key;
      panel.style.display = show ? '' : 'none';
      if(show) matched=true;
    });
    if(fallback) fallback.style.display = matched ? 'none' : '';
    if(select && select.value !== key) select.value = key;
  }

  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      setActive(btn.dataset.regionKey || ${JSON.stringify(defaultKey)});
    });
  });

  if(select){
    select.addEventListener('change', function(){
      setActive(String(select.value || ${JSON.stringify(defaultKey)}));
    });
  }

  setActive(${JSON.stringify(defaultKey)});
})();
</script>`;
}

export async function generateInteractiveMapPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
    pageShell: import('./shared').PageShell,
): Promise<string> {
    const entries = parseGeoEntries(article);
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);
    const freshnessBadge = buildFreshnessBadge(article, datasets);
    const ogTags = buildOpenGraphTags(article, domain);
    const titleHtml = escapeHtml(article.title);
    const defaultKey = entries[0]?.key || '';

    let bodyContent: string;
    if (entries.length === 0) {
        const fallback = await renderMarkdownToHtml(article.contentMarkdown || '', { currentDomain: domain });
        bodyContent = `<article><h1>${titleHtml}</h1>${fallback}</article>`;
    } else {
        const navButtons = entries.map((entry) => (
            `<button type="button" data-region-key="${escapeAttr(entry.key)}">${escapeHtml(entry.label)}</button>`
        )).join('\n');
        const mapTiles = buildMapTiles(entries);
        const options = entries.map((entry) => (
            `<option value="${escapeAttr(entry.key)}">${escapeHtml(entry.label)}</option>`
        )).join('\n');
        const panels = entries.map((entry) => (
            `<article class="imap-panel" data-region-key="${escapeAttr(entry.key)}" style="display:none">
  <h3>${escapeHtml(entry.label)}</h3>
  <div class="imap-panel-content">${entry.content}</div>
</article>`
        )).join('\n');

        bodyContent = `<article>
  <h1>${titleHtml}</h1>
  <section class="imap-shell">
    <div class="imap-controls">
      <div class="imap-region-buttons">${navButtons}</div>
      <label for="imap-select">Region
        <select id="imap-select">${options}</select>
      </label>
    </div>
    ${mapTiles}
    <div class="imap-panels">
      ${panels}
      <article class="imap-fallback"${article.geoData?.fallback ? '' : ' style="display:none"'}>
        <h3>National View</h3>
        <div class="imap-panel-content">${sanitizeArticleHtml(article.geoData?.fallback || '')}</div>
      </article>
    </div>
  </section>
</article>`;
    }

    const schemaLd = buildSchemaJsonLd(article, domain, 'Article', {
        about: entries.length > 0 ? entries.map(e => e.label) : undefined,
    });

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}
  ${bodyContent}
  ${dataSourcesHtml}
  ${trustHtml}
  ${entries.length > 0 ? buildMapScript(defaultKey) : ''}`;

    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
