/**
 * Embeddable widget export — generates standalone HTML for calculators/wizards
 * that can be embedded via <iframe>. No Astro layout, inline CSS + JS.
 */

import { escapeHtml, escapeAttr, type Article } from './shared';

/**
 * Generate a standalone embeddable HTML page for calculator or wizard articles.
 * Returns null if the article type doesn't support embedding.
 */
export function generateEmbedPage(article: Article, domain: string): string | null {
    const contentType = article.contentType || 'article';
    if (contentType !== 'calculator' && contentType !== 'wizard') return null;

    const title = escapeHtml(article.title);

    let widgetHtml: string;
    let widgetScript: string;

    if (contentType === 'calculator' && article.calculatorConfig) {
        const config = article.calculatorConfig;
        const inputsHtml = config.inputs.map(inp => {
            const id = escapeAttr(inp.id);
            const label = escapeHtml(inp.label);
            if (inp.type === 'select' && inp.options) {
                const opts = inp.options.map(o =>
                    `<option value="${o.value}">${escapeHtml(o.label)}</option>`
                ).join('');
                return `<div class="ef"><label for="e-${id}">${label}</label><select id="e-${id}" name="${id}">${opts}</select></div>`;
            }
            const attrs = [
                `type="number"`,
                `id="e-${id}"`,
                `name="${id}"`,
                inp.min !== undefined ? `min="${inp.min}"` : '',
                inp.max !== undefined ? `max="${inp.max}"` : '',
                inp.step !== undefined ? `step="${inp.step}"` : '',
                inp.default !== undefined ? `value="${inp.default}"` : '',
            ].filter(Boolean).join(' ');
            return `<div class="ef"><label for="e-${id}">${label}</label><input ${attrs}></div>`;
        }).join('\n');

        const outputsHtml = config.outputs.map(out =>
            `<div class="er"><span class="el">${escapeHtml(out.label)}</span><span class="ev" id="eo-${escapeAttr(out.id)}">—</span></div>`
        ).join('\n');

        widgetHtml = `<h2>${title}</h2><form id="embed-calc" onsubmit="return false">${inputsHtml}<button type="button" onclick="compute()">Calculate</button></form><div class="results">${outputsHtml}</div>`;

        widgetScript = `<script>
function compute(){
  var f=document.getElementById('embed-calc');
  var vals={};
  f.querySelectorAll('input,select').forEach(function(el){vals[el.name]=parseFloat(el.value)||0});
  var outputs=${JSON.stringify(config.outputs)};
  outputs.forEach(function(o){
    var el=document.getElementById('eo-'+o.id);
    if(el){
      var v=vals[o.id]||0;
      if(o.format==='currency') el.textContent='$'+v.toLocaleString(undefined,{minimumFractionDigits:o.decimals||0,maximumFractionDigits:o.decimals||0});
      else if(o.format==='percent') el.textContent=v.toFixed(o.decimals||1)+'%';
      else el.textContent=v.toFixed(o.decimals||0);
    }
  });
  window.parent.postMessage({type:'embed-result',source:'${escapeAttr(domain)}',values:vals},'*');
}
</script>`;
    } else {
        widgetHtml = `<h2>${title}</h2><p>Widget content not available for embedding.</p>`;
        widgetScript = '';
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;padding:1rem;color:#1e293b;line-height:1.5}
h2{font-size:1.25rem;margin-bottom:1rem}
.ef{margin-bottom:0.75rem}
.ef label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.875rem}
.ef input,.ef select{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
button{background:#2563eb;color:#fff;border:none;padding:0.625rem 1.5rem;border-radius:0.375rem;font-weight:600;cursor:pointer;margin-top:0.5rem}
button:hover{background:#1d4ed8}
.results{margin-top:1rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:0.5rem;padding:1rem}
.er{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #dbeafe}
.er:last-child{border-bottom:none}
.el{font-weight:500}.ev{font-size:1.125rem;font-weight:700;color:#1d4ed8}
</style>
</head>
<body>
${widgetHtml}
${widgetScript}
<script>
// Auto-resize: notify parent of height changes
var lastH=0;
function notifyHeight(){
  var h=document.body.scrollHeight;
  if(h!==lastH){lastH=h;window.parent.postMessage({type:'embed-resize',height:h},'*');}
}
new ResizeObserver(notifyHeight).observe(document.body);
notifyHeight();
</script>
</body>
</html>`;
}

/**
 * Generate the embed snippet code users can copy-paste.
 */
export function generateEmbedSnippet(slug: string, domain: string): string {
    const src = `https://${domain}/embed/${slug}.html`;
    return `<!-- ${domain} embed widget -->
<div id="embed-${escapeAttr(slug)}"></div>
<script>
(function(){
  var d=document.getElementById('embed-${escapeAttr(slug)}');
  var f=document.createElement('iframe');
  f.src='${src}';
  f.style.cssText='width:100%;border:none;overflow:hidden';
  f.setAttribute('loading','lazy');
  f.setAttribute('title','${escapeAttr(slug)}');
  d.appendChild(f);
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='embed-resize')f.style.height=e.data.height+'px';
  });
})();
</script>`;
}
