/**
 * Interactive Block Renderers — ComparisonTable, QuoteCalculator, CostBreakdown,
 * LeadForm, Wizard, InteractiveMap, StatGrid, DataTable, and more.
 *
 * These are extracted from the existing v1 template files and adapted to work
 * with the block envelope + render context pattern.
 */

import { registerBlockRenderer } from './assembler';
import { escapeHtml, escapeAttr } from '../templates/shared';

// ============================================================
// ComparisonTable
// ============================================================

registerBlockRenderer('ComparisonTable', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const options = (content.options as Array<{
        name: string; url?: string; badge?: string;
        scores: Record<string, number | string>;
    }>) || [];
    const columns = (content.columns as Array<{
        key: string; label: string; type: string; sortable?: boolean;
    }>) || [];
    const verdict = (content.verdict as string) || '';

    if (options.length === 0 || columns.length === 0) return '';

    const headerCells = [
        '<th scope="col">Name</th>',
        ...columns.map(col => {
            const isSortable = col.sortable ?? true;
            const sortAttr = isSortable
                ? ` data-sort-key="${escapeAttr(col.key)}" role="button" tabindex="0"`
                : '';
            return `<th scope="col"${sortAttr}>${escapeHtml(col.label)}${isSortable ? ' <span class="sort-indicator">↕</span>' : ''}</th>`;
        }),
        '<th scope="col"></th>',
    ];

    const rows = options.map(option => {
        const badge = option.badge
            ? `<span class="comparison-badge">${escapeHtml(option.badge)}</span> `
            : '';
        const nameCell = `<td>${badge}${escapeHtml(option.name)}</td>`;

        const dataCells = columns.map(col => {
            const val = option.scores[col.key];
            if (val == null) return '<td>—</td>';
            if (col.type === 'rating' && typeof val === 'number') {
                const clamped = Math.max(0, Math.min(val, 5));
                const stars = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
                return `<td data-value="${clamped}">${stars} ${clamped}/5</td>`;
            }
            return `<td data-value="${escapeAttr(String(val))}">${escapeHtml(String(val))}</td>`;
        }).join('');

        const cta = option.url
            ? `<td><a href="${escapeAttr(option.url)}" class="cta-button" rel="nofollow noopener sponsored" target="_blank">Visit</a></td>`
            : '<td></td>';

        return `<tr>${nameCell}${dataCells}${cta}</tr>`;
    }).join('\n');

    const verdictHtml = verdict
        ? `<div class="comparison-verdict"><strong>Our Verdict:</strong> ${escapeHtml(verdict)}</div>`
        : '';

    const sortScript = `<script>
(function(){
  var table=document.querySelector('.comparison-table');
  if(!table)return;
  var headers=table.querySelectorAll('th[data-sort-key]');
  headers.forEach(function(th){
    th.addEventListener('click',function(){
      var key=th.dataset.sortKey;
      var tbody=table.querySelector('tbody');
      var rows=Array.from(tbody.querySelectorAll('tr'));
      var asc=th.dataset.sortDir!=='asc';
      th.dataset.sortDir=asc?'asc':'desc';
      rows.sort(function(a,b){
        var colIdx=Array.from(th.parentNode.children).indexOf(th);
        var aVal=a.children[colIdx]?.dataset?.value||a.children[colIdx]?.textContent||'';
        var bVal=b.children[colIdx]?.dataset?.value||b.children[colIdx]?.textContent||'';
        var aNum=parseFloat(aVal),bNum=parseFloat(bVal);
        if(!isNaN(aNum)&&!isNaN(bNum)) return asc?aNum-bNum:bNum-aNum;
        return asc?aVal.localeCompare(bVal):bVal.localeCompare(aVal);
      });
      rows.forEach(function(r){tbody.appendChild(r)});
    });
  });
})();
</script>`;

    return `<section class="comparison-section">
  <div class="comparison-table-wrapper">
    <table class="comparison-table">
      <thead><tr>${headerCells.join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${verdictHtml}
  ${sortScript}
</section>`;
});

// ============================================================
// QuoteCalculator
// ============================================================

registerBlockRenderer('QuoteCalculator', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const inputs = (content.inputs as Array<{
        id: string; label: string; type: string;
        default?: number; min?: number; max?: number; step?: number;
        options?: Array<{ label: string; value: number }>;
    }>) || [];
    const outputs = (content.outputs as Array<{
        id: string; label: string; format: string; decimals?: number;
    }>) || [];
    const formula = (content.formula as string) || '';
    const assumptions = (content.assumptions as string[]) || [];
    const methodology = (content.methodology as string) || '';

    if (inputs.length === 0) return '';

    const inputsHtml = inputs.map(inp => {
        const id = escapeAttr(inp.id);
        const label = escapeHtml(inp.label);

        if (inp.type === 'select' && inp.options) {
            const opts = inp.options.map(o =>
                `<option value="${o.value}">${escapeHtml(o.label)}</option>`
            ).join('');
            return `<div class="calc-field">
  <label for="${id}">${label}</label>
  <select id="${id}" name="${id}" class="calc-input">${opts}</select>
</div>`;
        }

        if (inp.type === 'range') {
            const min = inp.min ?? 0;
            const max = inp.max ?? 100;
            const step = inp.step ?? 1;
            const def = inp.default ?? min;
            return `<div class="calc-field">
  <label for="${id}">${label}: <output id="${id}_display">${def}</output></label>
  <input type="range" id="${id}" name="${id}" class="calc-input" min="${min}" max="${max}" step="${step}" value="${def}">
</div>`;
        }

        const min = inp.min != null ? ` min="${inp.min}"` : '';
        const max = inp.max != null ? ` max="${inp.max}"` : '';
        const step = inp.step != null ? ` step="${inp.step}"` : '';
        const def = inp.default != null ? ` value="${inp.default}"` : '';
        return `<div class="calc-field">
  <label for="${id}">${label}</label>
  <input type="number" id="${id}" name="${id}" class="calc-input"${min}${max}${step}${def}>
</div>`;
    }).join('\n');

    const outputsHtml = outputs.map(out =>
        `<div class="calc-result-item">
  <span class="calc-result-label">${escapeHtml(out.label)}</span>
  <span class="calc-result-value" id="result-${escapeAttr(out.id)}">—</span>
</div>`
    ).join('\n');

    const assumptionsHtml = assumptions.length > 0
        ? `<details class="calc-methodology"><summary>Assumptions</summary><ul>${assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul></details>`
        : '';

    const methodologyHtml = methodology
        ? `<details class="calc-methodology"><summary>Methodology</summary><p>${escapeHtml(methodology)}</p></details>`
        : '';

    const calcScript = formula ? `<script>
(function(){
  var inputs=document.querySelectorAll('.calc-input');
  function calculate(){
    var vals={};
    inputs.forEach(function(inp){
      vals[inp.name]=parseFloat(inp.value)||0;
    });
    try{
      var fn=new Function(Object.keys(vals).join(','),'return ('+${JSON.stringify(formula)}+')');
      var result=fn.apply(null,Object.values(vals));
      ${outputs.map(out => {
        const format = out.format === 'currency'
            ? `'$'+r.toLocaleString(undefined,{minimumFractionDigits:${out.decimals ?? 0},maximumFractionDigits:${out.decimals ?? 0}})`
            : out.format === 'percent'
            ? `r.toFixed(${out.decimals ?? 1})+'%'`
            : `r.toFixed(${out.decimals ?? 0})`;
        return `var r=typeof result==='object'?result['${out.id}']:result;
      var el=document.getElementById('result-${out.id}');
      if(el&&typeof r==='number'&&isFinite(r))el.textContent=${format};`;
      }).join('\n      ')}
    }catch(e){}
  }
  inputs.forEach(function(inp){
    inp.addEventListener('input',calculate);
    if(inp.type==='range'){
      inp.addEventListener('input',function(){
        var d=document.getElementById(inp.id+'_display');
        if(d)d.textContent=inp.value;
      });
    }
  });
  calculate();
})();
</script>` : '';

    return `<section class="calculator-section">
  <div class="calc-form">
    ${inputsHtml}
    <div class="calc-results">${outputsHtml}</div>
    ${assumptionsHtml}
    ${methodologyHtml}
  </div>
  ${calcScript}
</section>`;
});

// ============================================================
// CostBreakdown
// ============================================================

registerBlockRenderer('CostBreakdown', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const ranges = (content.ranges as Array<{
        label?: string; low: number; high: number; average?: number;
    }>) || [];
    const factors = (content.factors as Array<{
        name: string; impact: string; description: string;
    }>) || [];
    const currency = (config.currencySymbol as string) || '$';

    if (ranges.length === 0) return '';

    const fmt = (n: number) => `${currency}${n.toLocaleString()}`;

    const rangesHtml = ranges.map(r => {
        const avg = r.average ?? Math.round((r.low + r.high) / 2);
        const label = r.label ? `<h3>${escapeHtml(r.label)}</h3>` : '';
        return `<div class="cost-range">
  ${label}
  <div class="cost-range-bar">
    <div class="cost-low"><span class="cost-label">Low</span><span class="cost-value">${fmt(r.low)}</span></div>
    <div class="cost-avg"><span class="cost-label">Average</span><span class="cost-value">${fmt(avg)}</span></div>
    <div class="cost-high"><span class="cost-label">High</span><span class="cost-value">${fmt(r.high)}</span></div>
  </div>
</div>`;
    }).join('\n');

    const factorsHtml = factors.length > 0 ? `<div class="factors-grid">
  <h3>Cost Factors</h3>
  <div class="factors-cards">
    ${factors.map(f => `<div class="factor-card impact-${escapeAttr(f.impact)}">
  <h4>${escapeHtml(f.name)}</h4>
  <span class="factor-impact">${escapeHtml(f.impact)} impact</span>
  <p>${escapeHtml(f.description)}</p>
</div>`).join('\n    ')}
  </div>
</div>` : '';

    return `<section class="cost-section">
  <div class="cost-ranges">${rangesHtml}</div>
  ${factorsHtml}
</section>`;
});

// ============================================================
// LeadForm
// ============================================================

registerBlockRenderer('LeadForm', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const fields = (content.fields as Array<{
        name: string; label: string; type: string;
        required?: boolean; options?: string[];
    }>) || [];
    const consentText = (content.consentText as string) || '';
    const successMessage = (content.successMessage as string) || 'Thank you!';
    const disclosureAboveFold = (content.disclosureAboveFold as string) || '';
    const endpoint = (config.endpoint as string) || '';
    const submitLabel = (config.submitLabel as string) || 'Submit';

    if (fields.length === 0 || !endpoint) return '';

    const disclosureHtml = disclosureAboveFold
        ? `<div class="disclosure-above">${escapeHtml(disclosureAboveFold)}</div>`
        : '';

    const fieldsHtml = fields.map(field => {
        const id = escapeAttr(field.name);
        const label = escapeHtml(field.label);
        const req = field.required !== false ? ' required' : '';

        if (field.type === 'select' && field.options) {
            const opts = field.options.map(o =>
                `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`
            ).join('');
            return `<div class="lead-field">
  <label for="${id}">${label}</label>
  <select id="${id}" name="${id}"${req}><option value="">Select...</option>${opts}</select>
</div>`;
        }

        return `<div class="lead-field">
  <label for="${id}">${label}</label>
  <input type="${field.type}" id="${id}" name="${id}" placeholder="${label}"${req}>
</div>`;
    }).join('\n');

    const consentHtml = consentText
        ? `<div class="consent"><label><input type="checkbox" name="consent" required> ${escapeHtml(consentText)}</label></div>`
        : '';

    return `<section class="lead-section">
  ${disclosureHtml}
  <form class="lead-form" id="lead-form">
    ${fieldsHtml}
    ${consentHtml}
    <button type="submit">${escapeHtml(submitLabel)}</button>
    <div class="success-msg" id="lead-success" style="display:none">${escapeHtml(successMessage)}</div>
    <div class="error-msg" id="lead-error" style="display:none">Something went wrong. Please try again.</div>
  </form>
  <script>
(function(){
  var form=document.getElementById('lead-form');
  if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var btn=form.querySelector('button[type="submit"]');
    btn.disabled=true;btn.textContent='Sending...';
    var data={};
    new FormData(form).forEach(function(v,k){data[k]=v});
    fetch(${JSON.stringify(endpoint)},{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    }).then(function(r){
      if(r.ok){
        form.style.display='none';
        document.getElementById('lead-success').style.display='';
      } else {
        document.getElementById('lead-error').style.display='';
        btn.disabled=false;btn.textContent=${JSON.stringify(submitLabel)};
      }
    }).catch(function(){
      document.getElementById('lead-error').style.display='';
      btn.disabled=false;btn.textContent=${JSON.stringify(submitLabel)};
    });
  });
})();
</script>
</section>`;
});

// ============================================================
// StatGrid (from interactive-infographic)
// ============================================================

registerBlockRenderer('StatGrid', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const items = (content.items as Array<{
        id: string; title: string; metricLabel: string;
        metricValue: number; summary: string; group: string;
    }>) || [];
    const filterable = config.filterable !== false;

    if (items.length === 0) return '';

    const groups = [...new Set(items.map(i => i.group))];

    const chips = filterable && groups.length > 1
        ? `<div class="infographic-chips">
  <button type="button" class="infographic-chip active" data-group="all">All</button>
  ${groups.map(g => `<button type="button" class="infographic-chip" data-group="${escapeAttr(g)}">${escapeHtml(g)}</button>`).join('\n  ')}
</div>`
        : '';

    const cards = items.map(item => {
        const pct = Math.max(0, Math.min(100, Math.round(item.metricValue)));
        return `<div class="infographic-card" data-group="${escapeAttr(item.group)}">
  <h3>${escapeHtml(item.title)}</h3>
  <p class="infographic-summary">${escapeHtml(item.summary)}</p>
  <div class="infographic-meter">
    <span class="infographic-meter-label">${escapeHtml(item.metricLabel)}</span>
    <span>${pct}%</span>
  </div>
  <div class="infographic-bar"><span style="width:${pct}%"></span></div>
</div>`;
    }).join('\n');

    const filterScript = filterable && groups.length > 1 ? `<script>
(function(){
  var chips=document.querySelectorAll('.infographic-chip');
  var cards=document.querySelectorAll('.infographic-card');
  chips.forEach(function(chip){
    chip.addEventListener('click',function(){
      chips.forEach(function(c){c.classList.remove('active')});
      chip.classList.add('active');
      var g=chip.dataset.group;
      cards.forEach(function(card){
        card.style.display=(g==='all'||card.dataset.group===g)?'':'none';
      });
    });
  });
})();
</script>` : '';

    return `<section class="infographic-shell">
  <div class="infographic-toolbar">${chips}</div>
  <div class="infographic-grid">${cards}</div>
  ${filterScript}
</section>`;
});

// ============================================================
// DataTable
// ============================================================

registerBlockRenderer('DataTable', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const headers = (content.headers as string[]) || [];
    const rows = (content.rows as Array<Array<string | number>>) || [];
    const caption = (content.caption as string) || '';

    if (headers.length === 0 || rows.length === 0) return '';

    const captionHtml = caption ? `<caption>${escapeHtml(caption)}</caption>` : '';
    const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(row =>
        `<tr>${row.map(cell => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`
    ).join('\n')}</tbody>`;

    return `<section class="data-table-section">
  <div class="comparison-table-wrapper">
    <table class="comparison-table">${captionHtml}${thead}${tbody}</table>
  </div>
</section>`;
});

// ============================================================
// InteractiveMap
// ============================================================

registerBlockRenderer('InteractiveMap', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const regions = (content.regions as Record<string, { label: string; content: string }>) || {};
    const defaultRegion = (content.defaultRegion as string) || '';
    const showTileGrid = config.showTileGrid !== false;
    const showDropdown = config.showDropdown !== false;

    const entries = Object.entries(regions);
    if (entries.length === 0) return '';

    const defaultKey = defaultRegion || entries[0][0];

    const dropdown = showDropdown
        ? `<select id="imap-select" aria-label="Select region">
  ${entries.map(([key, val]) => `<option value="${escapeAttr(key)}"${key === defaultKey ? ' selected' : ''}>${escapeHtml(val.label)}</option>`).join('\n  ')}
</select>`
        : '';

    const tiles = showTileGrid && entries.length >= 8
        ? `<div class="imap-map-grid" aria-label="Interactive region map">
  ${entries.map(([key, val]) => `<button type="button" class="imap-state-tile${key === defaultKey ? ' active' : ''}" data-region-key="${escapeAttr(key)}" aria-label="${escapeAttr(val.label)}">${escapeHtml(key.toUpperCase())}</button>`).join('\n  ')}
</div>`
        : '';

    const panels = entries.map(([key, val]) => {
        const display = key === defaultKey ? '' : ' style="display:none"';
        return `<div class="imap-panel" data-region-key="${escapeAttr(key)}"${display}>
  <h3>${escapeHtml(val.label)}</h3>
  <div class="imap-panel-content">${val.content}</div>
</div>`;
    }).join('\n');

    return `<section class="imap-shell">
  <div class="imap-controls">
    ${dropdown}
  </div>
  ${tiles}
  <div class="imap-panels">${panels}</div>
  <script>
(function(){
  var root=document.querySelector('.imap-shell');
  if(!root)return;
  var select=root.querySelector('#imap-select');
  var buttons=Array.from(root.querySelectorAll('[data-region-key]'));
  var panels=Array.from(root.querySelectorAll('.imap-panel'));
  function setActive(key){
    buttons.forEach(function(btn){btn.classList.toggle('active',btn.dataset.regionKey===key)});
    panels.forEach(function(p){p.style.display=p.dataset.regionKey===key?'':'none'});
    if(select&&select.value!==key)select.value=key;
  }
  buttons.forEach(function(btn){
    btn.addEventListener('click',function(){setActive(btn.dataset.regionKey||${JSON.stringify(defaultKey)})});
  });
  if(select)select.addEventListener('change',function(){setActive(String(select.value||${JSON.stringify(defaultKey)}))});
})();
</script>
</section>`;
});

// ============================================================
// GeoContent
// ============================================================

registerBlockRenderer('GeoContent', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const regions = (content.regions as Record<string, { content: string; label?: string }>) || {};
    const fallback = (content.fallback as string) || '';

    if (Object.keys(regions).length === 0) return '';

    const regionBlocks = Object.entries(regions).map(([region, data]) => {
        const label = data.label ? `<span class="geo-label">${escapeHtml(data.label)}</span>` : '';
        return `<div class="geo-block" data-region="${escapeHtml(region)}" style="display:none">
  ${label}
  <div class="geo-content">${data.content}</div>
</div>`;
    }).join('\n');

    const fallbackHtml = `<div class="geo-block geo-fallback"><div class="geo-content">${fallback}</div></div>`;

    return `<div class="geo-adaptive">
  ${regionBlocks}
  ${fallbackHtml}
</div>
<script>
(function(){
  var tzMap={'America/New_York':'northeast','America/Chicago':'midwest','America/Denver':'mountain','America/Los_Angeles':'west','America/Phoenix':'southwest'};
  try{
    var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    var reg=tzMap[tz]||null;
    if(reg){
      var blocks=document.querySelectorAll('.geo-block[data-region]');
      var matched=false;
      blocks.forEach(function(b){
        if(b.dataset.region===reg){b.style.display='';matched=true;}
      });
      if(matched){var fb=document.querySelector('.geo-fallback');if(fb)fb.style.display='none';}
    }
  }catch(e){}
})();
</script>`;
});

// ============================================================
// ProsConsCard
// ============================================================

registerBlockRenderer('ProsConsCard', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const name = (content.name as string) || '';
    const rating = content.rating as number | undefined;
    const pros = (content.pros as string[]) || [];
    const cons = (content.cons as string[]) || [];
    const summary = (content.summary as string) || '';
    const url = (content.url as string) || '';
    const badge = (content.badge as string) || '';

    if (!name) return '';

    const ratingHtml = typeof rating === 'number'
        ? `<span class="review-stars">${'★'.repeat(Math.floor(rating))}${'☆'.repeat(5 - Math.floor(rating))} ${rating}/5</span>`
        : '';
    const badgeHtml = badge ? `<span class="comparison-badge">${escapeHtml(badge)}</span>` : '';
    const prosHtml = pros.length > 0
        ? `<div class="pros"><h4>Pros</h4><ul>${pros.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
        : '';
    const consHtml = cons.length > 0
        ? `<div class="cons"><h4>Cons</h4><ul>${cons.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>`
        : '';
    const summaryHtml = summary ? `<p class="review-summary">${escapeHtml(summary)}</p>` : '';
    const ctaHtml = url ? `<a href="${escapeAttr(url)}" class="cta-button" rel="nofollow noopener sponsored" target="_blank">Visit</a>` : '';

    return `<div class="review-card">
  <h3>${badgeHtml}${escapeHtml(name)}</h3>
  ${ratingHtml}
  ${summaryHtml}
  <div class="pros-cons">${prosHtml}${consHtml}</div>
  ${ctaHtml}
</div>`;
});

// ============================================================
// RankingList
// ============================================================

registerBlockRenderer('RankingList', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const items = (content.items as Array<{
        rank: number; name: string; description: string;
        rating?: number; badge?: string; url?: string;
    }>) || [];
    const title = (content.title as string) || '';

    if (items.length === 0) return '';

    const titleHtml = title ? `<h2>${escapeHtml(title)}</h2>` : '';
    const listHtml = items.map(item => {
        const ratingHtml = typeof item.rating === 'number'
            ? ` <span class="review-stars">${'★'.repeat(Math.floor(item.rating))}${'☆'.repeat(5 - Math.floor(item.rating))} ${item.rating}/5</span>`
            : '';
        const badgeHtml = item.badge ? ` <span class="comparison-badge">${escapeHtml(item.badge)}</span>` : '';
        const ctaHtml = item.url ? ` <a href="${escapeAttr(item.url)}" class="cta-button" rel="nofollow noopener sponsored" target="_blank">Visit</a>` : '';
        return `<li class="ranking-item">
  <span class="ranking-number">#${item.rank}</span>
  <div class="ranking-content">
    <h3>${escapeHtml(item.name)}${badgeHtml}${ratingHtml}</h3>
    <p>${escapeHtml(item.description)}</p>
    ${ctaHtml}
  </div>
</li>`;
    }).join('\n');

    return `<section class="ranking-section">
  ${titleHtml}
  <ol class="ranking-list">${listHtml}</ol>
</section>`;
});

// ============================================================
// VsCard
// ============================================================

registerBlockRenderer('VsCard', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const itemA = (content.itemA as { name: string; description: string; pros: string[]; cons: string[]; rating?: number; url?: string }) || null;
    const itemB = (content.itemB as { name: string; description: string; pros: string[]; cons: string[]; rating?: number; url?: string }) || null;
    const verdict = (content.verdict as string) || '';

    if (!itemA || !itemB) return '';

    function renderSide(item: { name: string; description: string; pros: string[]; cons: string[]; rating?: number; url?: string }): string {
        const ratingHtml = typeof item.rating === 'number'
            ? `<span class="review-stars">${'★'.repeat(Math.floor(item.rating))}${'☆'.repeat(5 - Math.floor(item.rating))} ${item.rating}/5</span>`
            : '';
        const prosHtml = item.pros.length > 0 ? `<ul class="vs-pros">${item.pros.map(p => `<li>✓ ${escapeHtml(p)}</li>`).join('')}</ul>` : '';
        const consHtml = item.cons.length > 0 ? `<ul class="vs-cons">${item.cons.map(c => `<li>✗ ${escapeHtml(c)}</li>`).join('')}</ul>` : '';
        return `<div class="vs-side">
  <h3>${escapeHtml(item.name)}</h3>
  ${ratingHtml}
  <p>${escapeHtml(item.description)}</p>
  ${prosHtml}${consHtml}
</div>`;
    }

    const verdictHtml = verdict ? `<div class="comparison-verdict"><strong>Verdict:</strong> ${escapeHtml(verdict)}</div>` : '';

    return `<section class="vs-card">
  <div class="vs-grid">
    ${renderSide(itemA)}
    <div class="vs-divider"><span>VS</span></div>
    ${renderSide(itemB)}
  </div>
  ${verdictHtml}
</section>`;
});

// ============================================================
// TestimonialGrid
// ============================================================

registerBlockRenderer('TestimonialGrid', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const testimonials = (content.testimonials as Array<{
        quote: string; author: string; title?: string; rating?: number;
    }>) || [];

    if (testimonials.length === 0) return '';

    const cards = testimonials.map(t => {
        const ratingHtml = typeof t.rating === 'number'
            ? `<div class="testimonial-rating">${'★'.repeat(Math.floor(t.rating))}${'☆'.repeat(5 - Math.floor(t.rating))}</div>`
            : '';
        const titleHtml = t.title ? `<span class="testimonial-title">${escapeHtml(t.title)}</span>` : '';
        return `<div class="testimonial-card">
  ${ratingHtml}
  <blockquote>"${escapeHtml(t.quote)}"</blockquote>
  <cite>${escapeHtml(t.author)}${titleHtml}</cite>
</div>`;
    }).join('\n');

    return `<section class="testimonial-section">
  <div class="testimonial-grid">${cards}</div>
</section>`;
});

// ============================================================
// PricingTable
// ============================================================

registerBlockRenderer('PricingTable', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const plans = (content.plans as Array<{
        name: string; price: string; period?: string;
        features: string[]; ctaText?: string; ctaUrl?: string;
        highlighted?: boolean; badge?: string;
    }>) || [];

    if (plans.length === 0) return '';

    const cards = plans.map(plan => {
        const highlight = plan.highlighted ? ' pricing-highlighted' : '';
        const badgeHtml = plan.badge ? `<span class="pricing-badge">${escapeHtml(plan.badge)}</span>` : '';
        const period = plan.period ? `<span class="pricing-period">/${escapeHtml(plan.period)}</span>` : '';
        const features = plan.features.map(f => `<li>${escapeHtml(f)}</li>`).join('');
        const cta = plan.ctaText && plan.ctaUrl
            ? `<a href="${escapeAttr(plan.ctaUrl)}" class="cta-button">${escapeHtml(plan.ctaText)}</a>`
            : '';
        return `<div class="pricing-card${highlight}">
  ${badgeHtml}
  <h3>${escapeHtml(plan.name)}</h3>
  <div class="pricing-price">${escapeHtml(plan.price)}${period}</div>
  <ul class="pricing-features">${features}</ul>
  ${cta}
</div>`;
    }).join('\n');

    return `<section class="pricing-section">
  <div class="pricing-grid">${cards}</div>
</section>`;
});

// ============================================================
// PdfDownload
// ============================================================

registerBlockRenderer('PdfDownload', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const articleId = (content.articleId as string) || '';
    const buttonText = (content.buttonText as string) || 'Download PDF';
    const type = (config.type as string) || 'article';
    const gated = config.gated === true;

    if (!articleId) return '';

    const pdfUrl = `/api/articles/${articleId}/pdf?type=${type}`;

    if (!gated) {
        return `<div class="pdf-download"><a href="${escapeAttr(pdfUrl)}" class="pdf-download-btn" download>${escapeHtml(buttonText)}</a></div>`;
    }

    return `<div class="pdf-download" id="pdf-gate">
  <p class="pdf-gate-text">Enter your email to download:</p>
  <form id="pdf-gate-form" class="pdf-gate-form">
    <input type="email" id="pdf-gate-email" placeholder="your@email.com" required>
    <button type="submit">${escapeHtml(buttonText)}</button>
  </form>
  <a href="${escapeAttr(pdfUrl)}" class="pdf-download-btn" id="pdf-direct-link" style="display:none" download>${escapeHtml(buttonText)}</a>
</div>`;
});

// ============================================================
// Wizard (multi-step guided flow with branching, scoring, lead capture)
// ============================================================

registerBlockRenderer('Wizard', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const steps = (content.steps as Array<{
        id: string; title: string; description?: string;
        fields: Array<{
            id: string; type: 'radio' | 'checkbox' | 'select' | 'number' | 'text';
            label: string; options?: Array<{ value: string; label: string }>;
            required?: boolean;
        }>;
        nextStep?: string;
        branches?: Array<{ condition: string; goTo: string }>;
    }>) || [];
    const resultRules = (content.resultRules as Array<{
        condition: string; title: string; body: string;
        cta?: { text: string; url: string };
    }>) || [];
    const resultTemplate = (content.resultTemplate as string) || 'summary';
    const collectLead = content.collectLead as {
        fields: string[]; consentText: string; endpoint: string;
    } | undefined;
    const scoring = content.scoring as {
        method?: string; weights?: Record<string, number>;
        valueMap?: Record<string, Record<string, number>>;
        bands?: Array<{ min: number; max: number; label: string; description?: string }>;
        outcomes?: Array<{ min: number; max: number; title: string; body: string; cta?: { text: string; url: string } }>;
    } | undefined;

    const mode = (config.mode as string) || 'wizard';

    if (steps.length === 0) return '';

    const COPY: Record<string, { finalStepLabel: string; resultsTitle: string; restartLabel: string; emptyTitle: string; emptyBody: string; leadTitle: string; leadButton: string; showAnswerSummary: boolean; showQuizScore: boolean }> = {
        wizard: { finalStepLabel: 'See Results', resultsTitle: 'Your Results', restartLabel: 'Start Over', emptyTitle: 'No matching results', emptyBody: 'Please try different answers.', leadTitle: 'Get Your Personalized Report', leadButton: 'Get My Results', showAnswerSummary: false, showQuizScore: false },
        configurator: { finalStepLabel: 'Review Configuration', resultsTitle: 'Your Configuration', restartLabel: 'Reconfigure', emptyTitle: 'Configuration ready', emptyBody: 'Your current selections are shown below.', leadTitle: 'Send Me This Configuration', leadButton: 'Save Configuration', showAnswerSummary: true, showQuizScore: false },
        quiz: { finalStepLabel: 'See Score', resultsTitle: 'Your Score', restartLabel: 'Retake Quiz', emptyTitle: 'Quiz complete', emptyBody: 'You completed the quiz. Review your score below.', leadTitle: 'Email My Quiz Results', leadButton: 'Send Results', showAnswerSummary: false, showQuizScore: true },
        survey: { finalStepLabel: 'Submit Survey', resultsTitle: 'Thanks for sharing', restartLabel: 'Submit Another Response', emptyTitle: 'Submission recorded', emptyBody: 'Thank you for completing this survey.', leadTitle: 'Send Me A Copy', leadButton: 'Email My Response', showAnswerSummary: true, showQuizScore: false },
        assessment: { finalStepLabel: 'See Assessment', resultsTitle: 'Assessment Results', restartLabel: 'Retake Assessment', emptyTitle: 'Assessment complete', emptyBody: 'Review your outcome and recommendations below.', leadTitle: 'Email My Assessment', leadButton: 'Send Assessment', showAnswerSummary: true, showQuizScore: true },
    };

    const modeCopy = COPY[mode] || COPY.wizard;

    // Render fields
    function renderField(field: { id: string; type: string; label: string; options?: Array<{ value: string; label: string }>; required?: boolean }): string {
        const req = field.required ? ' required' : '';
        const id = escapeAttr(field.id);
        const label = escapeHtml(field.label);
        switch (field.type) {
            case 'radio':
                if (!field.options?.length) return '';
                return `<fieldset class="wizard-field" data-field-id="${id}"><legend>${label}</legend>${field.options.map(o => `<label class="wizard-radio"><input type="radio" name="${id}" value="${escapeAttr(o.value)}"${req}><span>${escapeHtml(o.label)}</span></label>`).join('\n')}</fieldset>`;
            case 'checkbox':
                if (!field.options?.length) return '';
                return `<fieldset class="wizard-field" data-field-id="${id}"><legend>${label}</legend>${field.options.map(o => `<label class="wizard-checkbox"><input type="checkbox" name="${id}" value="${escapeAttr(o.value)}"><span>${escapeHtml(o.label)}</span></label>`).join('\n')}</fieldset>`;
            case 'select':
                return `<div class="wizard-field" data-field-id="${id}"><label for="wf-${id}">${label}</label><select id="wf-${id}" name="${id}"${req}><option value="">Select...</option>${(field.options ?? []).map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
            case 'number':
                return `<div class="wizard-field" data-field-id="${id}"><label for="wf-${id}">${label}</label><input type="number" id="wf-${id}" name="${id}" inputmode="numeric"${req}></div>`;
            default:
                return `<div class="wizard-field" data-field-id="${id}"><label for="wf-${id}">${label}</label><input type="text" id="wf-${id}" name="${id}"${req}></div>`;
        }
    }

    // Progress bar
    const progressHtml = `<div class="wizard-progress">${steps.map((s, i) =>
        `<div class="wizard-progress-segment${i === 0 ? ' active' : ''}" data-index="${i}"><span class="wizard-progress-dot">${i + 1}</span><span class="wizard-progress-label">${escapeHtml(s.title)}</span></div>`
    ).join('\n')}</div>`;

    // Steps
    const stepsHtml = steps.map((step, i) => {
        const fieldsHtml = step.fields.map(renderField).join('\n');
        const desc = step.description ? `<p class="wizard-step-desc">${escapeHtml(step.description)}</p>` : '';
        return `<div class="wizard-step" data-step-id="${escapeAttr(step.id)}" data-step-index="${i}" style="${i === 0 ? '' : 'display:none'}">
  <h3 class="wizard-step-title">${escapeHtml(step.title)}</h3>
  ${desc}
  ${fieldsHtml}
  <div class="wizard-nav">
    ${i > 0 ? '<button type="button" class="wizard-back">Back</button>' : '<span></span>'}
    <button type="button" class="wizard-next">${i === steps.length - 1 ? modeCopy.finalStepLabel : 'Next'}</button>
  </div>
</div>`;
    }).join('\n');

    // Results template
    let leadHtml = '';
    if (collectLead) {
        const fields = collectLead.fields.map(f => {
            const type = f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text';
            return `<div class="wizard-field"><label for="lead-${escapeAttr(f)}">${escapeHtml(f.charAt(0).toUpperCase() + f.slice(1))}</label><input type="${type}" id="lead-${escapeAttr(f)}" name="${escapeAttr(f)}" required></div>`;
        }).join('\n');
        leadHtml = `<div class="wizard-lead-form" style="display:none"><h4>${escapeHtml(modeCopy.leadTitle)}</h4><form id="wizard-lead-form" action="${escapeAttr(collectLead.endpoint)}" method="POST">${fields}<div class="consent"><label><input type="checkbox" required> ${escapeHtml(collectLead.consentText)}</label></div><button type="submit">${escapeHtml(modeCopy.leadButton)}</button></form></div>`;
    }

    const answerSummaryHtml = modeCopy.showAnswerSummary
        ? '<div class="wizard-answer-summary" style="display:none"><h4>Selection Summary</h4><ul class="wizard-answer-list"></ul></div>'
        : '';
    const quizScoreHtml = modeCopy.showQuizScore
        ? '<div class="wizard-quiz-score" style="display:none"></div>'
        : '';

    const resultsHtml = `<div class="wizard-results" style="display:none">
  <h3 class="wizard-results-title">${escapeHtml(modeCopy.resultsTitle)}</h3>
  ${quizScoreHtml}
  <div class="wizard-results-cards"></div>
  ${answerSummaryHtml}
  ${leadHtml}
  <button type="button" class="wizard-restart">${escapeHtml(modeCopy.restartLabel)}</button>
</div>`;

    // Client-side script — exact same logic as v1 wizard.ts
    const stepsJson = JSON.stringify(steps.map(s => ({
        id: s.id, nextStep: s.nextStep, branches: s.branches,
        fieldIds: s.fields.map(f => ({ id: f.id, label: f.label, required: !!f.required })),
    })));
    const rulesJson = JSON.stringify(resultRules);
    const scoringJson = JSON.stringify(scoring ?? null);

    const script = `<script>
(function(){
  var container=document.querySelector('.wizard-container');
  if(!container)return;
  var steps=${stepsJson};
  var rules=${rulesJson};
  var scoring=${scoringJson};
  var resultType=${JSON.stringify(resultTemplate)};
  var wizardMode=${JSON.stringify(mode)};
  var enableScoreUi=${JSON.stringify(modeCopy.showQuizScore)};
  var emptyTitle=${JSON.stringify(modeCopy.emptyTitle)};
  var emptyBody=${JSON.stringify(modeCopy.emptyBody)};
  var answers={};
  var history=[0];
  function getStepEl(idx){return container.querySelectorAll('.wizard-step')[idx]}
  function showStep(idx){
    container.querySelectorAll('.wizard-step').forEach(function(el,i){el.style.display=i===idx?'':'none'});
    container.querySelectorAll('.wizard-progress-segment').forEach(function(el,i){el.classList.toggle('active',i<=idx);el.classList.toggle('current',i===idx)});
  }
  function collectAnswers(stepEl){
    stepEl.querySelectorAll('[name]').forEach(function(el){
      var name=el.name;
      if(el.type==='radio'){if(el.checked)answers[name]=el.value}
      else if(el.type==='checkbox'){if(!answers[name])answers[name]=[];if(el.checked&&answers[name].indexOf(el.value)===-1)answers[name].push(el.value);else if(!el.checked)answers[name]=answers[name].filter(function(v){return v!==el.value})}
      else{answers[name]=el.value}
    });
  }
  function validateStep(stepEl,stepDef){
    var valid=true;
    stepDef.fieldIds.forEach(function(f){if(!f.required)return;var v=answers[f.id];if(v===undefined||v===''||(Array.isArray(v)&&v.length===0))valid=false});
    return valid;
  }
  function computeCompletionScore(){
    var required=0,answeredRequired=0;
    steps.forEach(function(step){step.fieldIds.forEach(function(f){if(!f.required)return;required++;var v=answers[f.id];if(v!==undefined&&v!==''&&(!Array.isArray(v)||v.length>0))answeredRequired++})});
    return required>0?Math.round((answeredRequired/required)*100):100;
  }
  function toScoreValue(fieldId,value){
    if(value===undefined||value===null)return null;
    var valueMap=scoring&&scoring.valueMap?scoring.valueMap[fieldId]:null;
    if(typeof value==='number')return value;
    if(typeof value==='string'){if(valueMap&&Object.prototype.hasOwnProperty.call(valueMap,value))return Number(valueMap[value]);if(value.trim()!==''&&!isNaN(Number(value)))return Number(value);return value.trim()!==''?100:null}
    if(Array.isArray(value)){if(value.length===0)return 0;if(valueMap){var sum=0,count=0;value.forEach(function(entry){if(Object.prototype.hasOwnProperty.call(valueMap,entry)){sum+=Number(valueMap[entry]);count+=1}});if(count>0)return sum/count}return 100}
    return 100;
  }
  function computeWeightedScore(){
    if(!scoring||scoring.method!=='weighted'||!scoring.weights)return null;
    var weights=scoring.weights,totalWeight=0,achieved=0;
    Object.keys(weights).forEach(function(fieldId){var weight=Number(weights[fieldId]);if(!isFinite(weight)||weight<=0)return;totalWeight+=weight;var scoreVal=toScoreValue(fieldId,answers[fieldId]);if(scoreVal===null)return;var bounded=Math.max(0,Math.min(100,Number(scoreVal)));achieved+=weight*(bounded/100)});
    if(totalWeight<=0)return null;return Math.round((achieved/totalWeight)*100);
  }
  function computeScore(){if(scoring&&scoring.method==='weighted'){var w=computeWeightedScore();if(w!==null)return w}return computeCompletionScore()}
  function getScoreBand(score){if(!scoring||!Array.isArray(scoring.bands))return null;for(var i=0;i<scoring.bands.length;i++){var b=scoring.bands[i];if(score>=Number(b.min)&&score<=Number(b.max))return b}return null}
  function getScoreOutcome(score){if(!scoring||!Array.isArray(scoring.outcomes))return null;for(var i=0;i<scoring.outcomes.length;i++){var o=scoring.outcomes[i];if(score>=Number(o.min)&&score<=Number(o.max))return o}return null}
  function evalCondition(cond){
    try{var tokens=[],i=0;
    while(i<cond.length){if(cond[i]===' '||cond[i]==='\\t'){i++;continue}
    if(cond[i]==="'"||cond[i]==='"'){var q=cond[i],j=i+1;while(j<cond.length&&cond[j]!==q)j++;tokens.push({t:'str',v:cond.slice(i+1,j)});i=j+1;continue}
    if('0123456789'.indexOf(cond[i])!==-1||(cond[i]==='-'&&i+1<cond.length&&'0123456789'.indexOf(cond[i+1])!==-1)){var j=i;if(cond[j]==='-')j++;while(j<cond.length&&'0123456789.'.indexOf(cond[j])!==-1)j++;tokens.push({t:'num',v:parseFloat(cond.slice(i,j))});i=j;continue}
    if(cond.slice(i,i+2)==='=='){tokens.push({t:'op',v:'=='});i+=2;continue}if(cond.slice(i,i+2)==='!='){tokens.push({t:'op',v:'!='});i+=2;continue}if(cond.slice(i,i+2)==='>='){tokens.push({t:'op',v:'>='});i+=2;continue}if(cond.slice(i,i+2)==='<='){tokens.push({t:'op',v:'<='});i+=2;continue}if(cond.slice(i,i+2)==='&&'){tokens.push({t:'op',v:'&&'});i+=2;continue}if(cond.slice(i,i+2)==='||'){tokens.push({t:'op',v:'||'});i+=2;continue}
    if(cond[i]==='>'){tokens.push({t:'op',v:'>'});i++;continue}if(cond[i]==='<'){tokens.push({t:'op',v:'<'});i++;continue}if(cond[i]==='('){tokens.push({t:'lp'});i++;continue}if(cond[i]===')'){tokens.push({t:'rp'});i++;continue}
    var j=i;while(j<cond.length&&/[a-zA-Z0-9_.]/.test(cond[j]))j++;var word=cond.slice(i,j);
    if(word==='.includes'){tokens.push({t:'op',v:'includes'});i=j;continue}if(word==='true'){tokens.push({t:'bool',v:true});i=j;continue}if(word==='false'){tokens.push({t:'bool',v:false});i=j;continue}
    if(word.indexOf('.includes')!==-1){var parts=word.split('.includes');tokens.push({t:'ref',v:parts[0]});tokens.push({t:'op',v:'includes'});i=j;continue}
    tokens.push({t:'ref',v:word});i=j}
    function resolve(tok){if(tok.t==='ref')return answers[tok.v]!==undefined?answers[tok.v]:'';if(tok.t==='num')return tok.v;if(tok.t==='str')return tok.v;if(tok.t==='bool')return tok.v;return tok.v}
    var pos=0;function peek(){return tokens[pos]}function next(){return tokens[pos++]}
    function parseComparison(){var left=next(),leftVal=resolve(left),op=peek();if(!op||op.t!=='op')return!!leftVal;if(op.v==='&&'||op.v==='||')return!!leftVal;next();
    if(op.v==='includes'){if(peek()&&peek().t==='lp')next();var arg=next();if(peek()&&peek().t==='rp')next();var argVal=resolve(arg);if(Array.isArray(leftVal))return leftVal.indexOf(argVal)!==-1;return String(leftVal).indexOf(String(argVal))!==-1}
    var right=next(),rightVal=resolve(right);var l=typeof leftVal==='string'&&!isNaN(Number(leftVal))&&typeof rightVal==='number'?Number(leftVal):leftVal;var r=typeof rightVal==='string'&&!isNaN(Number(rightVal))&&typeof leftVal==='number'?Number(rightVal):rightVal;
    if(op.v==='==')return l==r;if(op.v==='!=')return l!=r;if(op.v==='>=')return Number(l)>=Number(r);if(op.v==='<=')return Number(l)<=Number(r);if(op.v==='>')return Number(l)>Number(r);if(op.v==='<')return Number(l)<Number(r);return false}
    function parseExpr(){var result=parseComparison();while(pos<tokens.length){var op=peek();if(!op||op.t!=='op')break;if(op.v==='&&'){next();result=result&&parseComparison()}else if(op.v==='||'){next();result=result||parseComparison()}else break}return!!result}
    return parseExpr()}catch(e){return false}
  }
  function getNextStepIndex(currentIdx){
    var step=steps[currentIdx];
    if(step.branches){for(var i=0;i<step.branches.length;i++){if(evalCondition(step.branches[i].condition)){var tid=step.branches[i].goTo;for(var j=0;j<steps.length;j++){if(steps[j].id===tid)return j}}}}
    if(step.nextStep){for(var j=0;j<steps.length;j++){if(steps[j].id===step.nextStep)return j}}
    return currentIdx+1;
  }
  function showResults(){
    container.querySelectorAll('.wizard-step').forEach(function(el){el.style.display='none'});
    container.querySelectorAll('.wizard-progress-segment').forEach(function(el){el.classList.add('active')});
    var resultsEl=container.querySelector('.wizard-results'),cardsEl=resultsEl.querySelector('.wizard-results-cards');
    cardsEl.innerHTML='';
    rules.forEach(function(rule){if(evalCondition(rule.condition)){var card=document.createElement('div');card.className='wizard-result-card result-'+resultType;card.innerHTML='<h4>'+rule.title+'</h4><p>'+rule.body+'</p>'+(rule.cta?'<a href="'+rule.cta.url+'" class="cta-button">'+rule.cta.text+'</a>':'');cardsEl.appendChild(card)}});
    var scoreValue=null,scoreBand=null;
    if(enableScoreUi){scoreValue=computeScore();scoreBand=getScoreBand(scoreValue)}
    if(cardsEl.children.length===0){var scoreOutcome=scoreValue!==null?getScoreOutcome(scoreValue):null;if(scoreOutcome){var oc=document.createElement('div');oc.className='wizard-result-card result-'+resultType;oc.innerHTML='<h4>'+scoreOutcome.title+'</h4><p>'+scoreOutcome.body+'</p>'+(scoreOutcome.cta?'<a href="'+scoreOutcome.cta.url+'" class="cta-button">'+scoreOutcome.cta.text+'</a>':'');cardsEl.appendChild(oc)}else{cardsEl.innerHTML='<div class="wizard-result-card"><h4>'+emptyTitle+'</h4><p>'+emptyBody+'</p></div>'}}
    function findFieldLabel(fieldId){for(var si=0;si<steps.length;si++){var fields=steps[si].fieldIds||[];for(var fi=0;fi<fields.length;fi++){if(fields[fi].id===fieldId)return fields[fi].label||fieldId}}return fieldId}
    var summaryEl=container.querySelector('.wizard-answer-summary');
    if(summaryEl){var listEl=summaryEl.querySelector('.wizard-answer-list');if(listEl){listEl.innerHTML='';Object.keys(answers).forEach(function(key){var item=document.createElement('li');var value=answers[key];var text=Array.isArray(value)?value.join(', '):String(value||'(none)');item.textContent=findFieldLabel(key)+': '+text;listEl.appendChild(item)})}summaryEl.style.display=''}
    var scoreEl=container.querySelector('.wizard-quiz-score');
    if(scoreEl){var pct=scoreValue!==null?scoreValue:computeScore();var band=scoreBand||getScoreBand(pct);var prefix=wizardMode==='quiz'?'Quiz Score: ':'Assessment Score: ';var suffix=band&&band.label?(' - '+band.label):'';scoreEl.textContent=prefix+pct+'%'+suffix;scoreEl.style.display=''}
    resultsEl.style.display='';
    var leadForm=container.querySelector('.wizard-lead-form');if(leadForm)leadForm.style.display='';
  }
  container.addEventListener('click',function(e){
    var btn=e.target.closest('button');if(!btn)return;
    if(btn.classList.contains('wizard-next')){var currentIdx=history[history.length-1];var stepEl=getStepEl(currentIdx);collectAnswers(stepEl);if(!validateStep(stepEl,steps[currentIdx])){stepEl.classList.add('wizard-shake');setTimeout(function(){stepEl.classList.remove('wizard-shake')},400);return}var next=getNextStepIndex(currentIdx);if(next>=steps.length){showResults()}else{history.push(next);showStep(next)}}
    else if(btn.classList.contains('wizard-back')){if(history.length>1){history.pop();showStep(history[history.length-1])}}
    else if(btn.classList.contains('wizard-restart')){answers={};history=[0];container.querySelector('.wizard-results').style.display='none';var summaryEl=container.querySelector('.wizard-answer-summary');if(summaryEl)summaryEl.style.display='none';var scoreEl=container.querySelector('.wizard-quiz-score');if(scoreEl)scoreEl.style.display='none';container.querySelectorAll('input,select').forEach(function(el){if(el.type==='checkbox'||el.type==='radio')el.checked=false;else el.value=''});showStep(0)}
  });
})();
</script>`;

    return `<section class="wizard-section">
  <div class="wizard-container wizard-mode-${escapeAttr(mode)}" data-wizard-mode="${escapeAttr(mode)}">
    ${progressHtml}
    ${stepsHtml}
    ${resultsHtml}
  </div>
  ${script}
</section>`;
});

// ============================================================
// EmbedWidget (placeholder — just renders the source block in an iframe-friendly wrapper)
// ============================================================

registerBlockRenderer('EmbedWidget', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const title = (content.title as string) || 'Widget';
    return `<div class="embed-widget"><h3>${escapeHtml(title)}</h3><p>Embed widget placeholder</p></div>`;
});
