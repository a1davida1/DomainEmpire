/**
 * Embeddable widget export — generates standalone HTML for calculators/wizards
 * that can be embedded via <iframe>. No Astro layout, inline CSS + JS.
 */

import { escapeHtml, escapeAttr, type Article } from './shared';

/**
 * Generate a standalone embeddable HTML page for supported interactive articles.
 * Returns null if the article type doesn't support embedding.
 */
export function generateEmbedPage(article: Article, domain: string): string | null {
    const contentType = String(article.contentType || 'article');
    const wizardLikeTypes = new Set(['wizard', 'configurator', 'quiz', 'survey', 'assessment']);
    if (contentType !== 'calculator' && !wizardLikeTypes.has(contentType)) return null;
    const wizardMode = contentType === 'configurator' || contentType === 'quiz' || contentType === 'survey' || contentType === 'assessment'
        ? contentType
        : 'wizard';
    const wizardFinalLabel = wizardMode === 'configurator'
        ? 'Review Configuration'
        : wizardMode === 'quiz'
            ? 'See Score'
            : wizardMode === 'survey'
                ? 'Submit Survey'
                : wizardMode === 'assessment'
                    ? 'See Assessment'
                    : 'See Results';
    const wizardResultsTitle = wizardMode === 'configurator'
        ? 'Your Configuration'
        : wizardMode === 'quiz'
            ? 'Your Score'
            : wizardMode === 'survey'
                ? 'Thanks for sharing'
                : wizardMode === 'assessment'
                    ? 'Assessment Results'
                    : 'Your Results';
    const wizardRestartLabel = wizardMode === 'configurator'
        ? 'Reconfigure'
        : wizardMode === 'quiz'
            ? 'Retake Quiz'
            : wizardMode === 'survey'
                ? 'Submit Another Response'
                : wizardMode === 'assessment'
                    ? 'Retake Assessment'
                    : 'Start Over';

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
    } else if (wizardLikeTypes.has(contentType) && article.wizardConfig) {
        const wc = article.wizardConfig as {
            steps: Array<{
                id: string; title: string; description?: string;
                fields: Array<{ id: string; type: string; label: string; options?: Array<{ value: string; label: string }>; required?: boolean }>;
                nextStep?: string; branches?: Array<{ condition: string; goTo: string }>;
            }>;
            resultRules: Array<{ condition: string; title: string; body: string; cta?: { text: string; url: string } }>;
        };

        // Render progress bar
        const progressHtml = wc.steps.map((s, i) =>
            `<div class="wp-seg${i === 0 ? ' active' : ''}" data-index="${i}"><span class="wp-dot">${i + 1}</span><span class="wp-lbl">${escapeHtml(s.title)}</span></div>`
        ).join('');

        // Render each step
        const stepsHtml = wc.steps.map((step, i) => {
            const fieldsHtml = step.fields.map(f => {
                const fid = escapeAttr(f.id);
                const lbl = escapeHtml(f.label);
                const req = f.required ? ' required' : '';
                if (f.type === 'radio' && f.options?.length) {
                    return `<fieldset class="wf" data-field-id="${fid}"><legend>${lbl}</legend>${f.options.map(o => `<label class="wr"><input type="radio" name="${fid}" value="${escapeAttr(o.value)}"${req}><span>${escapeHtml(o.label)}</span></label>`).join('')}</fieldset>`;
                }
                if (f.type === 'checkbox' && f.options?.length) {
                    return `<fieldset class="wf" data-field-id="${fid}"><legend>${lbl}</legend>${f.options.map(o => `<label class="wc"><input type="checkbox" name="${fid}" value="${escapeAttr(o.value)}"><span>${escapeHtml(o.label)}</span></label>`).join('')}</fieldset>`;
                }
                if (f.type === 'select') {
                    return `<div class="wf" data-field-id="${fid}"><label for="wf-${fid}">${lbl}</label><select id="wf-${fid}" name="${fid}"${req}><option value="">Select...</option>${(f.options ?? []).map(o => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
                }
                const inputType = f.type === 'number' ? 'number' : 'text';
                return `<div class="wf" data-field-id="${fid}"><label for="wf-${fid}">${lbl}</label><input type="${inputType}" id="wf-${fid}" name="${fid}"${req}></div>`;
            }).join('\n');

            const desc = step.description ? `<p class="ws-desc">${escapeHtml(step.description)}</p>` : '';
            return `<div class="ws" data-step-id="${escapeAttr(step.id)}" data-step-index="${i}" style="${i === 0 ? '' : 'display:none'}">
  <h3>${escapeHtml(step.title)}</h3>${desc}${fieldsHtml}
  <div class="wn">${i > 0 ? '<button type="button" class="wb">Back</button>' : '<span></span>'}<button type="button" class="wnx">${i === wc.steps.length - 1 ? escapeHtml(wizardFinalLabel) : 'Next'}</button></div>
</div>`;
        }).join('\n');

        widgetHtml = `<h2>${title}</h2><div class="wizard-container wizard-mode-${escapeAttr(wizardMode)}"><div class="wp">${progressHtml}</div>${stepsHtml}<div class="wres" style="display:none"><h3>${escapeHtml(wizardResultsTitle)}</h3><div class="wres-cards"></div><button type="button" class="wrs">${escapeHtml(wizardRestartLabel)}</button></div></div>`;

        const stepsJson = JSON.stringify(wc.steps.map(s => ({
            id: s.id, nextStep: s.nextStep, branches: s.branches,
            fieldIds: s.fields.map(f => ({ id: f.id, required: !!f.required })),
        })));
        const rulesJson = JSON.stringify(wc.resultRules);

        widgetScript = `<script>
(function(){
  var c=document.querySelector('.wizard-container');if(!c)return;
  var steps=${stepsJson},rules=${rulesJson},answers={},hist=[0];
  function showStep(idx){c.querySelectorAll('.ws').forEach(function(e,i){e.style.display=i===idx?'':'none'});c.querySelectorAll('.wp-seg').forEach(function(e,i){e.classList.toggle('active',i<=idx);e.classList.toggle('current',i===idx)});}
  function collect(el){el.querySelectorAll('[name]').forEach(function(e){var n=e.name;if(e.type==='radio'){if(e.checked)answers[n]=e.value}else if(e.type==='checkbox'){if(!answers[n])answers[n]=[];if(e.checked&&answers[n].indexOf(e.value)===-1)answers[n].push(e.value);else if(!e.checked)answers[n]=answers[n].filter(function(v){return v!==e.value})}else{answers[n]=e.value}});}
  function validate(stepDef){var ok=true;stepDef.fieldIds.forEach(function(f){if(!f.required)return;var v=answers[f.id];if(v===undefined||v===''||(Array.isArray(v)&&v.length===0))ok=false});return ok;}
  function evalCond(cond){try{var tokens=[],i=0;while(i<cond.length){if(cond[i]===' '){i++;continue}if(cond[i]==="'"||cond[i]==='"'){var q=cond[i],j=i+1;while(j<cond.length&&cond[j]!==q)j++;tokens.push({t:'s',v:cond.slice(i+1,j)});i=j+1;continue}if('0123456789-'.indexOf(cond[i])!==-1){var j=i;if(cond[j]==='-')j++;while(j<cond.length&&'0123456789.'.indexOf(cond[j])!==-1)j++;tokens.push({t:'n',v:parseFloat(cond.slice(i,j))});i=j;continue}if(cond.slice(i,i+2)==='=='){tokens.push({t:'o',v:'=='});i+=2;continue}if(cond.slice(i,i+2)==='!='){tokens.push({t:'o',v:'!='});i+=2;continue}if(cond.slice(i,i+2)==='>='){tokens.push({t:'o',v:'>='});i+=2;continue}if(cond.slice(i,i+2)==='<='){tokens.push({t:'o',v:'<='});i+=2;continue}if(cond.slice(i,i+2)==='&&'){tokens.push({t:'o',v:'&&'});i+=2;continue}if(cond.slice(i,i+2)==='||'){tokens.push({t:'o',v:'||'});i+=2;continue}if(cond[i]==='>'){tokens.push({t:'o',v:'>'});i++;continue}if(cond[i]==='<'){tokens.push({t:'o',v:'<'});i++;continue}if(cond[i]==='('){tokens.push({t:'lp'});i++;continue}if(cond[i]===')'){tokens.push({t:'rp'});i++;continue}var j=i;while(j<cond.length&&/[a-zA-Z0-9_.]/.test(cond[j]))j++;var w=cond.slice(i,j);if(w==='.includes'){tokens.push({t:'o',v:'includes'});i=j;continue}if(w==='true'){tokens.push({t:'b',v:true});i=j;continue}if(w==='false'){tokens.push({t:'b',v:false});i=j;continue}if(w.indexOf('.includes')!==-1){var p=w.split('.includes');tokens.push({t:'r',v:p[0]});tokens.push({t:'o',v:'includes'});i=j;continue}tokens.push({t:'r',v:w});i=j;}function res(t){if(t.t==='r')return answers[t.v]!==undefined?answers[t.v]:'';return t.v;}var pos=0;function pk(){return tokens[pos]}function nx(){return tokens[pos++]}function cmp(){var l=nx(),lv=res(l),o=pk();if(!o||o.t!=='o')return !!lv;if(o.v==='&&'||o.v==='||')return !!lv;nx();if(o.v==='includes'){if(pk()&&pk().t==='lp')nx();var a=nx();if(pk()&&pk().t==='rp')nx();var av=res(a);if(Array.isArray(lv))return lv.indexOf(av)!==-1;return String(lv).indexOf(String(av))!==-1;}var r=nx(),rv=res(r);if(o.v==='==')return lv==rv;if(o.v==='!=')return lv!=rv;if(o.v==='>=')return Number(lv)>=Number(rv);if(o.v==='<=')return Number(lv)<=Number(rv);if(o.v==='>')return Number(lv)>Number(rv);if(o.v==='<')return Number(lv)<Number(rv);return false;}function expr(){var r=cmp();while(pos<tokens.length){var o=pk();if(!o||o.t!=='o')break;if(o.v==='&&'){nx();r=r&&cmp()}else if(o.v==='||'){nx();r=r||cmp()}else break}return !!r;}return expr();}catch(e){return false;}}
  function nextIdx(ci){var s=steps[ci];if(s.branches){for(var i=0;i<s.branches.length;i++){if(evalCond(s.branches[i].condition)){var tid=s.branches[i].goTo;for(var j=0;j<steps.length;j++)if(steps[j].id===tid)return j;}}}if(s.nextStep){for(var j=0;j<steps.length;j++)if(steps[j].id===s.nextStep)return j;}return ci+1;}
  function showResults(){c.querySelectorAll('.ws').forEach(function(e){e.style.display='none'});c.querySelectorAll('.wp-seg').forEach(function(e){e.classList.add('active')});var r=c.querySelector('.wres'),rc=r.querySelector('.wres-cards');rc.innerHTML='';rules.forEach(function(rule){if(evalCond(rule.condition)){var d=document.createElement('div');d.className='wrc';var h4=document.createElement('h4');h4.textContent=rule.title;d.appendChild(h4);var p=document.createElement('p');p.textContent=rule.body;d.appendChild(p);if(rule.cta){var a=document.createElement('a');a.href=rule.cta.url;a.className='cta-btn';a.textContent=rule.cta.text;d.appendChild(a);}rc.appendChild(d);}});if(!rc.children.length)rc.innerHTML='<div class="wrc"><h4>No matching results</h4><p>Try different answers.</p></div>';r.style.display='';window.parent.postMessage({type:'embed-result',source:'${escapeAttr(domain)}',answers:answers},'*');}
  c.addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b)return;if(b.classList.contains('wnx')){var ci=hist[hist.length-1];var se=c.querySelectorAll('.ws')[ci];collect(se);if(!validate(steps[ci])){se.classList.add('shake');setTimeout(function(){se.classList.remove('shake')},400);return;}var ni=nextIdx(ci);if(ni>=steps.length)showResults();else{hist.push(ni);showStep(ni);}}else if(b.classList.contains('wb')){if(hist.length>1){hist.pop();showStep(hist[hist.length-1]);}}else if(b.classList.contains('wrs')){answers={};hist=[0];c.querySelector('.wres').style.display='none';c.querySelectorAll('input,select').forEach(function(e){if(e.type==='checkbox'||e.type==='radio')e.checked=false;else e.value='';});showStep(0);}});
})();
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
.wp{display:flex;gap:0.25rem;margin-bottom:1.5rem}
.wp-seg{flex:1;text-align:center;padding:0.5rem 0.25rem;border-bottom:3px solid #e2e8f0;opacity:0.5;font-size:0.75rem}
.wp-seg.active{border-color:#2563eb;opacity:1}
.wp-seg.current{font-weight:700}
.wp-dot{display:inline-block;width:1.5rem;height:1.5rem;border-radius:50%;background:#e2e8f0;line-height:1.5rem;font-size:0.75rem;margin-bottom:0.125rem}
.wp-seg.active .wp-dot{background:#2563eb;color:#fff}
.wp-lbl{display:block;font-size:0.625rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ws h3{font-size:1rem;margin-bottom:0.5rem}
.ws-desc{color:#64748b;font-size:0.875rem;margin-bottom:0.75rem}
.wf{margin-bottom:0.75rem}
.wf label,.wf legend{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.875rem}
.wf input[type=text],.wf input[type=number],.wf select{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
.wr,.wc{display:block;padding:0.375rem 0;cursor:pointer}
.wr input,.wc input{margin-right:0.5rem}
.wn{display:flex;justify-content:space-between;margin-top:1rem}
.wb{background:#94a3b8}
.wb:hover{background:#64748b}
.wres{margin-top:1rem}
.wrc{background:#eff6ff;border:1px solid #bfdbfe;border-radius:0.5rem;padding:1rem;margin-bottom:0.75rem}
.wrc h4{margin-bottom:0.25rem}
.cta-btn{display:inline-block;margin-top:0.5rem;background:#2563eb;color:#fff;padding:0.5rem 1rem;border-radius:0.375rem;text-decoration:none;font-weight:600}
.wrs{background:#94a3b8;margin-top:1rem}
.wizard-mode-configurator .wnx{background:#0f766e}
.wizard-mode-configurator .wnx:hover{background:#115e59}
.wizard-mode-quiz .wnx{background:#b45309}
.wizard-mode-quiz .wnx:hover{background:#92400e}
.wizard-mode-survey .wnx{background:#15803d}
.wizard-mode-survey .wnx:hover{background:#166534}
.wizard-mode-assessment .wnx{background:#c2410c}
.wizard-mode-assessment .wnx:hover{background:#9a3412}
.shake{animation:shake 0.3s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
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
