/**
 * Interactive Block Renderers — ComparisonTable, QuoteCalculator, CostBreakdown,
 * LeadForm, Wizard, InteractiveMap, StatGrid, DataTable, and more.
 *
 * These are extracted from the existing v1 template files and adapted to work
 * with the block envelope + render context pattern.
 */

import { registerBlockRenderer } from './renderer-registry';
import { escapeHtml, escapeAttr, sanitizeArticleHtml } from '../templates/shared';

// ============================================================
// ComparisonTable
// ============================================================

registerBlockRenderer('ComparisonTable', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const options = (content.options as Array<{
        name: string; url?: string; badge?: string; winner?: boolean;
        scores: Record<string, number | string>;
    }>) || [];
    const columns = (content.columns as Array<{
        key: string; label: string; type: string; sortable?: boolean;
    }>) || [];
    const verdict = (content.verdict as string) || '';
    const title = (content.title as string) || '';

    if (options.length === 0 || columns.length === 0) return '';

    const titleHtml = title ? `<h2 class="section-heading">${escapeHtml(title)}</h2>` : '';

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
        const winnerClass = option.winner ? ' class="comparison-winner"' : '';
        const badge = option.badge
            ? `<span class="comparison-badge">${escapeHtml(option.badge)}</span> `
            : '';
        const winnerIcon = option.winner ? '<span class="comparison-crown">👑</span> ' : '';
        const nameCell = `<td>${winnerIcon}${badge}${escapeHtml(option.name)}</td>`;

        const dataCells = columns.map(col => {
            const val = option.scores[col.key];
            if (val == null) return '<td>—</td>';
            if (col.type === 'rating' && typeof val === 'number') {
                const clamped = Math.max(0, Math.min(val, 5));
                const stars = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
                return `<td data-value="${clamped}"><span class="comparison-stars">${stars}</span> ${clamped}/5</td>`;
            }
            return `<td data-value="${escapeAttr(String(val))}">${escapeHtml(String(val))}</td>`;
        }).join('');

        const cta = option.url
            ? `<td><a href="${escapeAttr(option.url)}" class="cta-button" rel="nofollow noopener sponsored" target="_blank">Visit →</a></td>`
            : '<td></td>';

        return `<tr${winnerClass}>${nameCell}${dataCells}${cta}</tr>`;
    }).join('\n');

    const verdictHtml = verdict
        ? `<div class="comparison-verdict"><span class="verdict-icon">⚖️</span> <strong>Our Verdict:</strong> ${escapeHtml(verdict)}</div>`
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
  ${titleHtml}
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

// ── Formula security helpers ──────────────────────────────────────────────────

/**
 * Parse multi-output formulas at BUILD TIME so braces never reach client JS.
 * Accepts: ({key1: expr1, key2: expr2}) or {key1: expr1, key2: expr2}
 * Returns map of output-id → raw expression string, or null if single-output.
 */
function parseMultiOutputFormula(formula: string): Record<string, string> | null {
    const trimmed = formula.trim();
    const match = trimmed.match(/^\(?\s*\{([\s\S]+)\}\s*\)?$/);
    if (!match) return null;

    const inner = match[1];
    const result: Record<string, string> = {};
    let depth = 0;
    let segStart = 0;

    for (let i = 0; i <= inner.length; i++) {
        const ch = i < inner.length ? inner[i] : ','; // sentinel
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            const seg = inner.substring(segStart, i).trim();
            const colon = seg.indexOf(':');
            if (colon > 0) {
                const key = seg.substring(0, colon).trim();
                const expr = seg.substring(colon + 1).trim();
                if (/^[a-zA-Z_]\w*$/.test(key) && expr) result[key] = expr;
            }
            segStart = i + 1;
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

/** Generate JS format expression for a calculator output value. */
function outputFormatCode(out: { format?: string; decimals?: number }, varName: string): string {
    if (out.format === 'currency') {
        return `'$'+${varName}.toLocaleString(undefined,{minimumFractionDigits:${out.decimals ?? 2},maximumFractionDigits:${out.decimals ?? 2}})`;
    }
    if (out.format === 'percent') {
        return `${varName}.toFixed(${out.decimals ?? 1})+'%'`;
    }
    return `${varName}.toLocaleString(undefined,{maximumFractionDigits:${out.decimals ?? 0}})`;
}

// ============================================================
// QuoteCalculator
// ============================================================

registerBlockRenderer('QuoteCalculator', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const inputs = (content.inputs as Array<{
        id: string; label: string; type: string;
        default?: number; min?: number; max?: number; step?: number;
        unit?: string;
        options?: Array<{ label: string; value: number }>;
    }>) || [];
    const outputs = (content.outputs as Array<{
        id: string; label: string; format: string; decimals?: number;
    }>) || [];
    const formula = (content.formula as string) || '';
    const assumptions = (content.assumptions as string[]) || [];
    const methodology = (content.methodology as string) || '';
    const heading = (content.heading as string) || (config.heading as string) || '';

    if (inputs.length === 0) return '';

    // Infer unit suffix from label/id for smart display
    function inferUnit(inp: { id: string; label: string; unit?: string }): string {
        if (inp.unit) return inp.unit;
        const l = (inp.label + ' ' + inp.id).toLowerCase();
        if (l.includes('rate') || l.includes('percent') || l.includes('apr') || l.includes('interest')) return '%';
        if (l.includes('amount') || l.includes('cost') || l.includes('price') || l.includes('budget') || l.includes('loan') || l.includes('value') || l.includes('salary') || l.includes('income')) return '$';
        if (l.includes('year') || l.includes('term') || l.includes('duration')) return 'years';
        if (l.includes('month')) return 'months';
        if (l.includes('sqft') || l.includes('square')) return 'sq ft';
        return '';
    }

    const inputsHtml = inputs.map(inp => {
        const id = escapeAttr(inp.id);
        const label = escapeHtml(inp.label);
        const unit = inferUnit(inp);

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
  <label for="${id}">${label}: <output id="${id}_display">${def}</output>${unit ? ' ' + escapeHtml(unit) : ''}</label>
  <input type="range" id="${id}" name="${id}" class="calc-input calc-range" min="${min}" max="${max}" step="${step}" value="${def}">
</div>`;
        }

        const min = inp.min != null ? ` min="${inp.min}"` : '';
        const max = inp.max != null ? ` max="${inp.max}"` : '';
        const step = inp.step != null ? ` step="${inp.step}"` : '';
        const def = inp.default != null ? ` value="${inp.default}"` : '';
        const unitHtml = unit ? `<span class="calc-unit">${escapeHtml(unit)}</span>` : '';
        const prefixClass = (unit === '$') ? ' calc-input-group--prefix' : '';

        return `<div class="calc-field">
  <label for="${id}">${label}</label>
  <div class="calc-input-group${prefixClass}">
    ${unit === '$' ? '<span class="calc-unit calc-unit--prefix">$</span>' : ''}
    <input type="number" id="${id}" name="${id}" class="calc-input"${min}${max}${step}${def}>
    ${unit && unit !== '$' ? unitHtml : ''}
  </div>
</div>`;
    }).join('\n');

    // Result cards — BusyBusy style with colored left border
    const outputsHtml = outputs.map(out =>
        `<div class="calc-result-card">
  <span class="calc-result-label">${escapeHtml(out.label)}</span>
  <span class="calc-result-value" id="result-${escapeAttr(out.id)}">—</span>
</div>`
    ).join('\n');

    // Breakdown line items for loan calculators (Total Interest, Fees, Total Payments)
    const isLoan = inputs.some(i => {
        const l = (i.label + ' ' + i.id).toLowerCase();
        return l.includes('rate') || l.includes('interest') || l.includes('apr');
    });
    const breakdownHtml = isLoan ? `<div class="calc-breakdown" id="calc-breakdown">
  <div class="calc-breakdown-row"><span>Total Interest Payable</span><span id="breakdown-total-interest">—</span></div>
  <div class="calc-breakdown-row"><span>Loan Fees (est.)</span><span id="breakdown-fees">—</span></div>
  <div class="calc-breakdown-row calc-breakdown-total"><span>Total Payments</span><span id="breakdown-total">—</span></div>
</div>` : '';

    const assumptionsHtml = assumptions.length > 0
        ? `<details class="calc-methodology"><summary>Assumptions</summary><ul>${assumptions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul></details>`
        : '';

    const methodologyHtml = methodology
        ? `<details class="calc-methodology"><summary>Methodology</summary><p>${escapeHtml(methodology)}</p></details>`
        : '';

    const headingHtml = heading ? `<h2>${escapeHtml(heading)}</h2>` : '';

    // SECURITY: Formula sanitization for new Function() evaluation.
    // NO braces {} — prevents getter/setter injection ({get x(){evil()}}).
    // NO colons — prevents object literal syntax in client JS.
    // NO brackets [] — prevents dynamic property access (self[String.fromCharCode(...)]).
    // Multi-output formulas ({key: expr, ...}) are parsed at BUILD TIME (server-side).
    // Each expression is individually sanitized; no {} ever reaches the client browser.
    const sanitizeExpr = (s: string) => s.replace(/[^a-zA-Z0-9_\s+\-*/%().,]/g, '');
    const multiOutput = parseMultiOutputFormula(formula);

    let evalCode: string;
    let hasFormula: boolean;

    if (multiOutput) {
        // Multi-output: parse {key: expr} server-side, generate per-output Function calls.
        // No {} or : ever appears in the generated client JavaScript.
        const parts = outputs.map((out, idx) => {
            const expr = multiOutput[out.id];
            if (!expr) return '';
            const safe = sanitizeExpr(expr);
            if (!safe.trim()) return '';
            const fmt = outputFormatCode(out, `r${idx}`);
            return `try{var fn${idx}=new Function(keys,'return ('+${JSON.stringify(safe)}+')');var r${idx}=fn${idx}.apply(null,values);var el${idx}=document.getElementById('result-${out.id}');if(el${idx}&&typeof r${idx}==='number'&&isFinite(r${idx}))el${idx}.textContent=${fmt};}catch(e){}`;
        }).filter(Boolean);
        evalCode = parts.length > 0
            ? `var keys=Object.keys(vals).join(',');var values=Object.values(vals);\n      ${parts.join('\n      ')}`
            : '';
        hasFormula = parts.length > 0;
    } else {
        // Single-output: sanitize the whole formula expression.
        const safe = sanitizeExpr(formula);
        if (safe.trim()) {
            evalCode = `try{
      var fn=new Function(Object.keys(vals).join(','),'return ('+${JSON.stringify(safe)}+')');
      var result=fn.apply(null,Object.values(vals));
      ${outputs.map(out => {
                const fmt = outputFormatCode(out, 'r');
                return `var r=result;
      var el=document.getElementById('result-${out.id}');
      if(el&&typeof r==='number'&&isFinite(r))el.textContent=${fmt};`;
            }).join('\n      ')}
    }catch(e){}`;
            hasFormula = true;
        } else {
            evalCode = '';
            hasFormula = false;
        }
    }

    const calcScript = hasFormula ? `<script>
(function(){
  var form=document.querySelector('.calc-split');
  if(!form)form=document.querySelector('.calc-form');
  if(!form)return;
  var inputs=form.querySelectorAll('.calc-input');
  function calculate(){
    var vals={};
    inputs.forEach(function(inp){
      vals[inp.name]=parseFloat(inp.value)||0;
    });
    ${evalCode}
    ${isLoan ? `
    // Compute breakdown line items for loan calculators
    try{
      var amt=0,rt=0,tm=0;
      ${inputs.map(inp => {
        const l = (inp.label + ' ' + inp.id).toLowerCase();
        if (l.includes('amount') || l.includes('loan') || l.includes('price') || l.includes('cost'))
            return `amt=vals['${inp.id}']||0;`;
        if (l.includes('rate') || l.includes('interest') || l.includes('apr'))
            return `rt=vals['${inp.id}']||0;`;
        if (l.includes('term') || l.includes('year') || l.includes('duration'))
            return `tm=vals['${inp.id}']||0;`;
        return '';
      }).filter(Boolean).join('\n      ')}
      if(amt&&rt&&tm){
        var mr=rt/100/12,np=Math.round(tm*12);
        var mp=amt*(mr*Math.pow(1+mr,np))/(Math.pow(1+mr,np)-1);
        if(isFinite(mp)){
          var totalPaid=mp*np;
          var totalInterest=totalPaid-amt;
          var fees=amt*0.004;
          var totalAll=totalPaid+fees;
          var fmt=function(n){return'$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})};
          var tiEl=document.getElementById('breakdown-total-interest');
          var fEl=document.getElementById('breakdown-fees');
          var tEl=document.getElementById('breakdown-total');
          if(tiEl)tiEl.textContent=fmt(totalInterest);
          if(fEl)fEl.textContent=fmt(fees);
          if(tEl)tEl.textContent=fmt(totalAll);
        }
      }
    }catch(e){}
    ` : ''}
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

    // Amortization schedule table (optional)
    const scheduleType = (config.scheduleType as string) || '';
    const scheduleHtml = scheduleType === 'amortization' ? `
  <div class="amort-section">
    <h3 class="amort-heading">Amortization Schedule</h3>
    <div class="amort-chart-wrap">
      <canvas id="amort-chart" width="700" height="320"></canvas>
    </div>
    <h4 class="amort-subheading">Annual Balances</h4>
    <div class="amort-toolbar">
      <button class="amort-dl-btn amort-dl-excel" onclick="downloadSchedule('excel')">Download Excel</button>
      <button class="amort-dl-btn amort-dl-csv" onclick="downloadSchedule('csv')">Download CSV</button>
      <label class="amort-page-limit">Page Limit
        <select id="amort-page-limit" onchange="renderSchedule()">
          <option value="12">12</option>
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="all">All</option>
        </select>
      </label>
    </div>
    <div class="amort-table-wrap">
      <table class="amort-table" id="amort-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Initial Balance</th>
            <th>Interest Payment</th>
            <th>Principal Payment</th>
            <th>Ending Balance</th>
          </tr>
        </thead>
        <tbody id="amort-body"></tbody>
      </table>
    </div>
    <div class="amort-pagination" id="amort-pagination"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>` : '';

    const amortScript = scheduleType === 'amortization' ? `<script>
(function(){
  var scheduleData=[];
  var currentPage=1;

  function getVal(id){
    var el=document.getElementById(id);
    return el?parseFloat(el.value)||0:0;
  }

  function generateSchedule(){
    // Try to find loan inputs by common naming patterns
    var amount=0,rate=0,termYears=0;
    ${inputs.map(inp => {
        const l = (inp.label + ' ' + inp.id).toLowerCase();
        if (l.includes('amount') || l.includes('loan') || l.includes('price') || l.includes('cost') || l.includes('budget'))
            return `amount=getVal('${inp.id}');`;
        if (l.includes('rate') || l.includes('interest') || l.includes('apr'))
            return `rate=getVal('${inp.id}');`;
        if (l.includes('term') || l.includes('year') || l.includes('duration'))
            return `termYears=getVal('${inp.id}');`;
        return '';
    }).filter(Boolean).join('\n    ')}

    if(!amount||!rate||!termYears)return[];
    var monthlyRate=rate/100/12;
    var numPayments=Math.round(termYears*12);
    var monthlyPayment=amount*(monthlyRate*Math.pow(1+monthlyRate,numPayments))/(Math.pow(1+monthlyRate,numPayments)-1);
    if(!isFinite(monthlyPayment))return[];

    var rows=[];
    var balance=amount;
    for(var i=1;i<=numPayments;i++){
      var interest=balance*monthlyRate;
      var principal=monthlyPayment-interest;
      var ending=balance-principal;
      if(ending<0)ending=0;
      rows.push({month:i,initial:balance,interest:interest,principal:principal,ending:ending});
      balance=ending;
    }
    return rows;
  }

  function fmt(n){return'$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}

  window.renderSchedule=function(){
    scheduleData=generateSchedule();
    currentPage=1;
    renderPage();
  };

  function renderPage(){
    var tbody=document.getElementById('amort-body');
    var pag=document.getElementById('amort-pagination');
    if(!tbody)return;
    var limitEl=document.getElementById('amort-page-limit');
    var limit=limitEl?limitEl.value:'25';
    var perPage=limit==='all'?scheduleData.length:parseInt(limit);
    var totalPages=Math.ceil(scheduleData.length/perPage)||1;
    if(currentPage>totalPages)currentPage=totalPages;
    var start=(currentPage-1)*perPage;
    var slice=scheduleData.slice(start,start+perPage);

    tbody.innerHTML=slice.map(function(r){
      return'<tr><td>'+r.month+'</td><td>'+fmt(r.initial)+'</td><td>'+fmt(r.interest)+'</td><td>'+fmt(r.principal)+'</td><td>'+fmt(r.ending)+'</td></tr>';
    }).join('');

    if(pag&&totalPages>1){
      var btns='';
      for(var p=1;p<=totalPages;p++){
        btns+='<button class="amort-page-btn'+(p===currentPage?' active':'')+'" onclick="goAmortPage('+p+')">'+p+'</button>';
      }
      pag.innerHTML=btns;
    }else if(pag){pag.innerHTML='';}
  }

  window.goAmortPage=function(p){currentPage=p;renderPage();};

  window.downloadSchedule=function(type){
    if(!scheduleData.length)return;
    var header='Month,Initial Balance,Interest Payment,Principal Payment,Ending Balance\\n';
    var rows=scheduleData.map(function(r){
      return r.month+','+r.initial.toFixed(2)+','+r.interest.toFixed(2)+','+r.principal.toFixed(2)+','+r.ending.toFixed(2);
    }).join('\\n');
    var csv=header+rows;
    var blob=new Blob([csv],{type:type==='excel'?'application/vnd.ms-excel':'text/csv'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    a.download=type==='excel'?'amortization-schedule.xls':'amortization-schedule.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Chart rendering
  var chartInstance=null;
  function renderChart(){
    var canvas=document.getElementById('amort-chart');
    if(!canvas||!scheduleData.length||typeof Chart==='undefined')return;
    var years=Math.ceil(scheduleData.length/12);
    var labels=[],balanceData=[],principalData=[],interestData=[];
    var cumPrincipal=0,cumInterest=0;
    for(var y=1;y<=years;y++){
      labels.push('Year '+y);
      var monthIdx=Math.min(y*12,scheduleData.length)-1;
      balanceData.push(Math.round(scheduleData[monthIdx].ending));
      for(var m=(y-1)*12;m<Math.min(y*12,scheduleData.length);m++){
        cumPrincipal+=scheduleData[m].principal;
        cumInterest+=scheduleData[m].interest;
      }
      principalData.push(Math.round(cumPrincipal));
      interestData.push(Math.round(cumInterest));
    }
    if(chartInstance){chartInstance.destroy();}
    chartInstance=new Chart(canvas,{
      type:'line',
      data:{
        labels:labels,
        datasets:[
          {label:'Loan Balance',data:balanceData,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',fill:true,tension:0.3,borderWidth:2,pointRadius:3},
          {label:'Principal Paid',data:principalData,borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.1)',fill:true,tension:0.3,borderWidth:2,pointRadius:3},
          {label:'Interest Paid',data:interestData,borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,0.1)',fill:true,tension:0.3,borderWidth:2,pointRadius:3}
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{position:'bottom',labels:{padding:16,usePointStyle:true,font:{size:12}}},
          tooltip:{mode:'index',intersect:false,callbacks:{label:function(ctx){return ctx.dataset.label+': $'+ctx.parsed.y.toLocaleString()}}}
        },
        scales:{
          y:{beginAtZero:true,ticks:{callback:function(v){return'$'+v.toLocaleString()}}},
          x:{grid:{display:false}}
        },
        interaction:{mode:'nearest',axis:'x',intersect:false}
      }
    });
  }

  // Hook into calculator inputs to auto-regenerate
  var calcInputs=document.querySelectorAll('.calc-input');
  calcInputs.forEach(function(inp){
    inp.addEventListener('input',function(){setTimeout(function(){renderSchedule();renderChart()},50)});
  });
  setTimeout(function(){renderSchedule();setTimeout(renderChart,200)},100);
})();
</script>` : '';

    const collectUrl = _ctx.collectUrl || '';
    const downloadGateHtml = `<div class="calc-download-gate" id="calc-download-gate">
  <div class="calc-download-cta">
    <span class="calc-download-icon">📊</span>
    <div>
      <strong>Download Your Results</strong>
      <p>Get a PDF summary of your calculation emailed to you.</p>
    </div>
  </div>
  <form class="calc-gate-form" id="calc-gate-form">
    <input type="email" name="email" placeholder="Enter your email" required class="calc-gate-email">
    <button type="submit" class="calc-gate-btn">Download Results</button>
  </form>
  <div class="calc-gate-success" id="calc-gate-success" style="display:none">
    <span class="success-icon">✓</span> Check your inbox! Your results summary is on the way.
  </div>
  <div class="calc-gate-error" id="calc-gate-error" style="display:none">
    Something went wrong. Please try again.
  </div>
</div>`;

    const downloadGateScript = `<script>
(function(){
  var form=document.getElementById('calc-gate-form');
  if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var email=form.querySelector('input[name="email"]').value;
    var results={};
    document.querySelectorAll('.calc-result-value').forEach(function(el){results[el.id]=el.textContent});
    var btn=form.querySelector('button');
    btn.disabled=true;btn.textContent='Sending...';
    var errEl=document.getElementById('calc-gate-error');if(errEl)errEl.style.display='none';
    var collectUrl=${JSON.stringify(collectUrl)};
    var payload={formType:'calculator',route:location.pathname,domain:location.hostname,email:email,data:{results:results,url:location.href}};
    var target=collectUrl||'/api/collect';
    fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      form.style.display='none';
      document.getElementById('calc-gate-success').style.display='';
    }).catch(function(){
      btn.disabled=false;btn.textContent='Send Results';
      var err=document.getElementById('calc-gate-error');
      if(err)err.style.display='';
    });
  });
})();
</script>`;

    return `<section class="calculator-section">
  ${headingHtml}
  <div class="calc-split">
    <div class="calc-inputs">
      ${inputsHtml}
    </div>
    <div class="calc-results">
      <h3 class="calc-results-heading">Results</h3>
      ${outputsHtml}
      ${breakdownHtml}
    </div>
  </div>
  ${downloadGateHtml}
  ${assumptionsHtml}
  ${methodologyHtml}
  ${scheduleHtml}
  ${calcScript}
  ${amortScript}
  ${downloadGateScript}
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
    const title = (content.title as string) || '';

    if (ranges.length === 0) return '';

    const fmt = (n: number) => `${currency}${n.toLocaleString()}`;
    const titleHtml = title ? `<h2 class="section-heading">${escapeHtml(title)}</h2>` : '';

    // Find global max for percentage bar widths
    const globalMax = Math.max(...ranges.map(r => r.high), 1);

    const rangesHtml = ranges.map(r => {
        const avg = r.average ?? Math.round((r.low + r.high) / 2);
        const label = r.label ? `<h3 class="cost-range-label">${escapeHtml(r.label)}</h3>` : '';
        const lowPct = Math.round((r.low / globalMax) * 100);
        const avgPct = Math.round((avg / globalMax) * 100);
        const highPct = Math.round((r.high / globalMax) * 100);
        return `<div class="cost-range">
  ${label}
  <div class="cost-range-bar">
    <div class="cost-tier cost-low">
      <span class="cost-label">Low</span>
      <div class="cost-bar-track"><div class="cost-bar-fill cost-bar--low" style="width:${lowPct}%"></div></div>
      <span class="cost-value">${fmt(r.low)}</span>
    </div>
    <div class="cost-tier cost-avg">
      <span class="cost-label">Average</span>
      <div class="cost-bar-track"><div class="cost-bar-fill cost-bar--avg" style="width:${avgPct}%"></div></div>
      <span class="cost-value cost-value--highlight">${fmt(avg)}</span>
    </div>
    <div class="cost-tier cost-high">
      <span class="cost-label">High</span>
      <div class="cost-bar-track"><div class="cost-bar-fill cost-bar--high" style="width:${highPct}%"></div></div>
      <span class="cost-value">${fmt(r.high)}</span>
    </div>
  </div>
</div>`;
    }).join('\n');

    const impactIcons: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
    const factorsHtml = factors.length > 0 ? `<div class="factors-grid">
  <h3 class="factors-heading">Cost Factors</h3>
  <div class="factors-cards">
    ${factors.map(f => {
        const icon = impactIcons[f.impact.toLowerCase()] || '⚪';
        return `<div class="factor-card impact-${escapeAttr(f.impact.toLowerCase())}">
  <div class="factor-header">
    <h4>${escapeHtml(f.name)}</h4>
    <span class="factor-impact">${icon} ${escapeHtml(f.impact)}</span>
  </div>
  <p>${escapeHtml(f.description)}</p>
</div>`;
    }).join('\n    ')}
  </div>
</div>` : '';

    return `<section class="cost-section">
  ${titleHtml}
  <div class="cost-ranges">${rangesHtml}</div>
  ${factorsHtml}
</section>`;
});

// ============================================================
// LeadForm
// ============================================================

registerBlockRenderer('LeadForm', (block, ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const fields = (content.fields as Array<{
        name: string; label: string; type: string;
        required?: boolean; options?: string[];
        half?: boolean;
        placeholder?: string;
    }>) || [];
    const consentText = (content.consentText as string) || '';
    const privacyUrl = (content.privacyUrl as string) || (content.privacyPolicyUrl as string) || '/privacy';
    const successMessage = (content.successMessage as string) || 'Thank you! We\'ll be in touch shortly.';
    const disclosureAboveFold = (content.disclosureAboveFold as string) || '';
    const heading = (content.heading as string) || '';
    const subheading = (content.subheading as string) || '';
    const rawEndpoint = (config.endpoint as string) || '';
    // Treat '#' placeholder as no endpoint — it's the default seed value
    const endpoint = rawEndpoint && rawEndpoint !== '#' ? rawEndpoint : '';
    const collectUrl = ctx.collectUrl || '';
    const submitLabel = (config.submitLabel as string) || 'GET STARTED';

    if (fields.length === 0 || (!endpoint && !collectUrl)) return '';

    const disclosureHtml = disclosureAboveFold
        ? `<div class="disclosure-above">${escapeHtml(disclosureAboveFold)}</div>`
        : '';

    const headingHtml = heading
        ? `<h2 class="lead-heading">${escapeHtml(heading)}</h2>`
        : '';
    const subheadingHtml = subheading
        ? `<p class="lead-subheading">${escapeHtml(subheading)}</p>`
        : '';

    // Map field names to autocomplete hints
    const autoCompleteMap: Record<string, string> = {
        email: 'email', phone: 'tel', tel: 'tel', name: 'name',
        firstName: 'given-name', first_name: 'given-name', firstname: 'given-name',
        lastName: 'family-name', last_name: 'family-name', lastname: 'family-name',
        zip: 'postal-code', zipcode: 'postal-code', postal: 'postal-code',
        city: 'address-level2', state: 'address-level1',
        address: 'street-address', company: 'organization',
    };
    const inputModeMap: Record<string, string> = {
        email: 'email', tel: 'tel', number: 'numeric', url: 'url',
    };

    // Group consecutive half-width fields into rows
    let fieldsHtml = '';
    let i = 0;
    while (i < fields.length) {
        const field = fields[i];
        const id = escapeAttr(field.name);
        const label = escapeHtml(field.label);
        const placeholder = field.placeholder ? escapeAttr(field.placeholder) : label;
        const req = field.required !== false ? ' required' : '';
        const ac = autoCompleteMap[field.name] ? ` autocomplete="${autoCompleteMap[field.name]}"` : '';
        const im = inputModeMap[field.type] ? ` inputmode="${inputModeMap[field.type]}"` : '';

        // Check if this and next field are both half-width → pair them
        if (field.half && i + 1 < fields.length && fields[i + 1].half) {
            const field2 = fields[i + 1];
            const id2 = escapeAttr(field2.name);
            const label2 = escapeHtml(field2.label);
            const placeholder2 = field2.placeholder ? escapeAttr(field2.placeholder) : label2;
            const req2 = field2.required !== false ? ' required' : '';
            const ac2 = autoCompleteMap[field2.name] ? ` autocomplete="${autoCompleteMap[field2.name]}"` : '';
            const im2 = inputModeMap[field2.type] ? ` inputmode="${inputModeMap[field2.type]}"` : '';
            fieldsHtml += `<div class="lead-field-row">
  <div class="lead-field lead-field--half">
    <input type="${field.type}" id="${id}" name="${id}" placeholder="${placeholder}"${req}${ac}${im}>
  </div>
  <div class="lead-field lead-field--half">
    <input type="${field2.type}" id="${id2}" name="${id2}" placeholder="${placeholder2}"${req2}${ac2}${im2}>
  </div>
</div>\n`;
            i += 2;
            continue;
        }

        if (field.type === 'select' && field.options) {
            const opts = field.options.map(o =>
                `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`
            ).join('');
            fieldsHtml += `<div class="lead-field">
  <select id="${id}" name="${id}"${req}><option value="">${label}</option>${opts}</select>
</div>\n`;
        } else {
            fieldsHtml += `<div class="lead-field">
  <input type="${field.type}" id="${id}" name="${id}" placeholder="${placeholder}"${req}${ac}${im}>
</div>\n`;
        }
        i++;
    }

    let consentHtml = '';
    if (consentText) {
        const escaped = escapeHtml(consentText);
        const linked = escaped.replace(/Privacy Policy/gi, `<a href="${escapeAttr(privacyUrl)}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>`);
        // If no "Privacy Policy" phrase was found, append a link so consent always includes one
        const hasLink = linked !== escaped;
        const finalText = hasLink ? linked : `${linked} <a href="${escapeAttr(privacyUrl)}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>`;
        consentHtml = `<div class="consent"><label><input type="checkbox" name="consent" required> ${finalText}</label></div>`;
    }

    return `<section class="lead-section">
  ${disclosureHtml}
  ${headingHtml}
  ${subheadingHtml}
  <form class="lead-form" id="lead-form">
    ${fieldsHtml}
    ${consentHtml}
    <button type="submit"><span class="btn-lock">🔒</span> ${escapeHtml(submitLabel)}</button>
    <p class="lead-trust">Your information is secure and never shared with third parties.</p>
    <div class="success-msg" id="lead-success" style="display:none">
      <span class="success-icon">✓</span>
      <strong>${escapeHtml(successMessage)}</strong>
    </div>
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
    var collectUrl=${JSON.stringify(collectUrl)};
    if(collectUrl){try{fetch(collectUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formType:'lead',route:location.pathname,domain:location.hostname,data:data,email:data.email||null})})}catch(e){}}
    var ep=${JSON.stringify(endpoint)};
    var mainFetch=ep?fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}):collectUrl?fetch(collectUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formType:'lead',route:location.pathname,domain:location.hostname,data:data,email:data.email||null})}):Promise.resolve({ok:true});
    mainFetch.then(function(r){
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
        icon?: string; trend?: 'up' | 'down' | 'flat';
    }>) || [];
    const filterable = config.filterable !== false;
    const title = (content.title as string) || '';

    if (items.length === 0) return '';

    const groups = [...new Set(items.map(i => i.group))];
    const titleHtml = title ? `<h2 class="section-heading">${escapeHtml(title)}</h2>` : '';

    const chips = filterable && groups.length > 1
        ? `<div class="infographic-chips">
  <button type="button" class="infographic-chip active" data-group="all">All</button>
  ${groups.map(g => `<button type="button" class="infographic-chip" data-group="${escapeAttr(g)}">${escapeHtml(g)}</button>`).join('\n  ')}
</div>`
        : '';

    const trendIcons: Record<string, string> = { up: '↑', down: '↓', flat: '→' };
    const trendClasses: Record<string, string> = { up: 'stat-trend--up', down: 'stat-trend--down', flat: 'stat-trend--flat' };

    const cards = items.map(item => {
        const pct = Math.max(0, Math.min(100, Math.round(item.metricValue)));
        const r = 36;
        const circ = Math.round(2 * Math.PI * r);
        const offset = Math.round(circ * (1 - pct / 100));
        const iconHtml = item.icon ? `<span class="stat-icon">${escapeHtml(item.icon)}</span>` : '';
        const trendHtml = item.trend ? `<span class="stat-trend ${trendClasses[item.trend] || ''}">${trendIcons[item.trend] || ''}</span>` : '';
        return `<div class="infographic-card" data-group="${escapeAttr(item.group)}">
  ${iconHtml}
  <div class="stat-ring-wrap">
    <svg class="stat-ring" viewBox="0 0 80 80" width="80" height="80">
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--color-border,#e2e8f0)" stroke-width="6"/>
      <circle class="stat-ring-fill" cx="40" cy="40" r="${r}" fill="none" stroke="var(--color-accent,#2563eb)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 40 40)"/>
    </svg>
    <span class="stat-ring-value" data-count="${pct}" data-suffix="%">${pct}%</span>
  </div>
  <h3>${escapeHtml(item.title)} ${trendHtml}</h3>
  <p class="infographic-summary">${escapeHtml(item.summary)}</p>
  <div class="infographic-meter">
    <span class="infographic-meter-label">${escapeHtml(item.metricLabel)}</span>
    <span data-count="${pct}" data-suffix="%">${pct}%</span>
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
  ${titleHtml}
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
    const config = (block.config || {}) as Record<string, unknown>;
    const headers = (content.headers as string[]) || [];
    const rows = (content.rows as Array<Array<string | number>>) || [];
    const caption = (content.caption as string) || '';
    const title = (content.title as string) || '';
    const sortable = config.sortable !== false;

    if (headers.length === 0 || rows.length === 0) return '';

    const titleHtml = title ? `<h2 class="section-heading">${escapeHtml(title)}</h2>` : '';
    const captionHtml = caption ? `<caption>${escapeHtml(caption)}</caption>` : '';
    const thead = `<thead><tr>${headers.map((h, i) => {
        const sortAttr = sortable ? ` data-sort-col="${i}" role="button" tabindex="0"` : '';
        const sortIcon = sortable ? ' <span class="sort-indicator">↕</span>' : '';
        return `<th scope="col"${sortAttr}>${escapeHtml(h)}${sortIcon}</th>`;
    }).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(row =>
        `<tr>${row.map(cell => {
            const val = String(cell);
            return `<td data-value="${escapeAttr(val)}">${escapeHtml(val)}</td>`;
        }).join('')}</tr>`
    ).join('\n')}</tbody>`;

    const sortScript = sortable ? `<script>
(function(){
  var table=document.querySelector('.data-table-section .data-table');
  if(!table)return;
  table.querySelectorAll('th[data-sort-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=parseInt(th.dataset.sortCol,10);
      var tbody=table.querySelector('tbody');
      var rows=Array.from(tbody.querySelectorAll('tr'));
      var asc=th.dataset.sortDir!=='asc';
      th.dataset.sortDir=asc?'asc':'desc';
      rows.sort(function(a,b){
        var aVal=a.children[col]?.dataset?.value||a.children[col]?.textContent||'';
        var bVal=b.children[col]?.dataset?.value||b.children[col]?.textContent||'';
        var aNum=parseFloat(aVal),bNum=parseFloat(bVal);
        if(!isNaN(aNum)&&!isNaN(bNum))return asc?aNum-bNum:bNum-aNum;
        return asc?aVal.localeCompare(bVal):bVal.localeCompare(aVal);
      });
      rows.forEach(function(r){tbody.appendChild(r)});
    });
  });
})();
</script>` : '';

    return `<section class="data-table-section">
  ${titleHtml}
  <div class="data-table-wrapper">
    <table class="data-table">${captionHtml}${thead}${tbody}</table>
  </div>
  ${sortScript}
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
  <div class="imap-panel-content">${sanitizeArticleHtml(val.content)}</div>
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
  <div class="geo-content">${sanitizeArticleHtml(data.content)}</div>
</div>`;
    }).join('\n');

    const fallbackHtml = `<div class="geo-block geo-fallback"><div class="geo-content">${sanitizeArticleHtml(fallback)}</div></div>`;

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
        ? `<div class="review-rating"><span class="review-stars">${'★'.repeat(Math.floor(rating))}${'☆'.repeat(5 - Math.floor(rating))}</span> <span class="review-score">${rating}/5</span></div>`
        : '';
    const badgeHtml = badge ? `<span class="review-badge">${escapeHtml(badge)}</span>` : '';
    const prosHtml = pros.length > 0
        ? `<div class="pros"><h4 class="pros-heading">✓ Pros</h4><ul>${pros.map(p => `<li><span class="pro-icon">✓</span> ${escapeHtml(p)}</li>`).join('')}</ul></div>`
        : '';
    const consHtml = cons.length > 0
        ? `<div class="cons"><h4 class="cons-heading">✗ Cons</h4><ul>${cons.map(c => `<li><span class="con-icon">✗</span> ${escapeHtml(c)}</li>`).join('')}</ul></div>`
        : '';
    const summaryHtml = summary ? `<p class="review-summary">${escapeHtml(summary)}</p>` : '';
    const ctaHtml = url ? `<a href="${escapeAttr(url)}" class="cta-button review-cta" rel="nofollow noopener sponsored" target="_blank">Visit Site →</a>` : '';

    return `<div class="review-card">
  <div class="review-card-header">
    <h3>${escapeHtml(name)}</h3>
    ${badgeHtml}
  </div>
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
        rating?: number; badge?: string; url?: string; score?: number;
    }>) || [];
    const title = (content.title as string) || '';

    if (items.length === 0) return '';

    const titleHtml = title ? `<h2 class="section-heading">${escapeHtml(title)}</h2>` : '';
    const listHtml = items.map(item => {
        const medalClass = item.rank === 1 ? ' ranking-gold' : item.rank === 2 ? ' ranking-silver' : item.rank === 3 ? ' ranking-bronze' : '';
        const ratingHtml = typeof item.rating === 'number'
            ? `<div class="ranking-rating"><span class="ranking-stars">${'★'.repeat(Math.floor(item.rating))}${'☆'.repeat(5 - Math.floor(item.rating))}</span> <span class="ranking-score-text">${item.rating}/5</span></div>`
            : '';
        const badgeHtml = item.badge ? `<span class="ranking-badge">${escapeHtml(item.badge)}</span>` : '';
        const scoreBar = typeof item.score === 'number'
            ? `<div class="ranking-score-bar"><div class="ranking-score-fill" style="width:${Math.min(item.score, 100)}%"></div></div>`
            : '';
        const ctaHtml = item.url ? `<a href="${escapeAttr(item.url)}" class="cta-button ranking-cta" rel="nofollow noopener sponsored" target="_blank">Visit →</a>` : '';
        return `<li class="ranking-item${medalClass}">
  <span class="ranking-number">${item.rank}</span>
  <div class="ranking-content">
    <div class="ranking-header">
      <h3>${escapeHtml(item.name)}</h3>
      ${badgeHtml}
    </div>
    ${ratingHtml}
    ${scoreBar}
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

    // Determine winner by higher rating
    const aRating = typeof itemA.rating === 'number' ? itemA.rating : 0;
    const bRating = typeof itemB.rating === 'number' ? itemB.rating : 0;
    const winnerSide = aRating > bRating ? 'a' : bRating > aRating ? 'b' : null;

    function renderSide(item: { name: string; description: string; pros: string[]; cons: string[]; rating?: number; url?: string }, isWinner: boolean): string {
        const ratingHtml = typeof item.rating === 'number'
            ? `<div class="vs-rating"><span class="vs-stars">${'★'.repeat(Math.floor(item.rating))}${'☆'.repeat(5 - Math.floor(item.rating))}</span> <span class="vs-score">${item.rating}/5</span></div>`
            : '';
        const winnerBadge = isWinner ? '<span class="vs-winner-badge">👑 Winner</span>' : '';
        const prosHtml = item.pros.length > 0 ? `<div class="vs-section"><h4 class="vs-section-label vs-section-pros">✓ Pros</h4><ul class="vs-pros">${item.pros.map(p => `<li><span class="pro-icon">✓</span> ${escapeHtml(p)}</li>`).join('')}</ul></div>` : '';
        const consHtml = item.cons.length > 0 ? `<div class="vs-section"><h4 class="vs-section-label vs-section-cons">✗ Cons</h4><ul class="vs-cons">${item.cons.map(c => `<li><span class="con-icon">✗</span> ${escapeHtml(c)}</li>`).join('')}</ul></div>` : '';
        const ctaHtml = item.url ? `<a href="${escapeAttr(item.url)}" class="cta-button vs-cta" rel="nofollow noopener sponsored" target="_blank">Visit →</a>` : '';
        const winnerClass = isWinner ? ' vs-side--winner' : '';
        return `<div class="vs-side${winnerClass}">
  <div class="vs-side-header">
    <h3>${escapeHtml(item.name)}</h3>
    ${winnerBadge}
  </div>
  ${ratingHtml}
  <p>${escapeHtml(item.description)}</p>
  ${prosHtml}${consHtml}
  ${ctaHtml}
</div>`;
    }

    const verdictHtml = verdict ? `<div class="comparison-verdict"><span class="verdict-icon">⚖️</span> <strong>Verdict:</strong> ${escapeHtml(verdict)}</div>` : '';

    return `<section class="vs-card">
  <div class="vs-grid">
    ${renderSide(itemA, winnerSide === 'a')}
    <div class="vs-divider"><span>VS</span></div>
    ${renderSide(itemB, winnerSide === 'b')}
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
        quote: string; author: string; title?: string; rating?: number; verified?: boolean;
    }>) || [];
    const heading = (content.heading as string) || '';

    if (testimonials.length === 0) return '';

    const headingHtml = heading ? `<h2 class="section-heading">${escapeHtml(heading)}</h2>` : '';

    const cards = testimonials.map(t => {
        const ratingHtml = typeof t.rating === 'number'
            ? `<div class="testimonial-rating">${'★'.repeat(Math.floor(t.rating))}${'☆'.repeat(5 - Math.floor(t.rating))}</div>`
            : '';
        const titleHtml = t.title ? `<span class="testimonial-title">${escapeHtml(t.title)}</span>` : '';
        const initials = t.author.split(' ').map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('');
        const verifiedHtml = t.verified === true ? '<span class="testimonial-verified" title="Verified">✓</span>' : '';
        return `<div class="testimonial-card">
  ${ratingHtml}
  <blockquote class="testimonial-quote"><span class="testimonial-mark">"</span>${escapeHtml(t.quote)}</blockquote>
  <div class="testimonial-author">
    <span class="testimonial-avatar">${initials}</span>
    <div class="testimonial-info">
      <cite>${escapeHtml(t.author)} ${verifiedHtml}</cite>
      ${titleHtml}
    </div>
  </div>
</div>`;
    }).join('\n');

    return `<section class="testimonial-section">
  ${headingHtml}
  <div class="testimonial-grid">${cards}</div>
</section>`;
});

// ============================================================
// PricingTable
// ============================================================

registerBlockRenderer('PricingTable', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const heading = (content.heading as string) || '';
    const subheading = (content.subheading as string) || '';
    const plans = (content.plans as Array<{
        name: string; price: string; period?: string; description?: string;
        features: string[]; ctaText?: string; ctaUrl?: string;
        highlighted?: boolean; badge?: string;
    }>) || [];

    if (plans.length === 0) return '';

    const headingHtml = heading ? `<h2 class="section-heading">${escapeHtml(heading)}</h2>` : '';
    const subHtml = subheading ? `<p class="section-subheading">${escapeHtml(subheading)}</p>` : '';

    const cards = plans.map(plan => {
        const highlight = plan.highlighted ? ' pricing-highlighted' : '';
        const badgeHtml = plan.badge ? `<span class="pricing-badge">${escapeHtml(plan.badge)}</span>` : '';
        const period = plan.period ? `<span class="pricing-period">/${escapeHtml(plan.period)}</span>` : '';
        const descHtml = plan.description ? `<p class="pricing-desc">${escapeHtml(plan.description)}</p>` : '';
        const features = plan.features.map(f => {
            const isExcluded = f.startsWith('✗ ') || f.startsWith('x ');
            const text = isExcluded ? f.slice(2) : f;
            return `<li class="${isExcluded ? 'pricing-feature--excluded' : ''}"><span class="pricing-check">${isExcluded ? '✗' : '✓'}</span> ${escapeHtml(text)}</li>`;
        }).join('');
        const cta = plan.ctaText && plan.ctaUrl
            ? `<a href="${escapeAttr(plan.ctaUrl)}" class="cta-button pricing-cta">${escapeHtml(plan.ctaText)}</a>`
            : '';
        return `<div class="pricing-card${highlight}">
  ${badgeHtml}
  <h3>${escapeHtml(plan.name)}</h3>
  <div class="pricing-price">${escapeHtml(plan.price)}${period}</div>
  ${descHtml}
  <ul class="pricing-features">${features}</ul>
  ${cta}
</div>`;
    }).join('\n');

    return `<section class="pricing-section">
  ${headingHtml}
  ${subHtml}
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
    const description = (content.description as string) || '';
    const type = (config.type as string) || 'article';
    const gated = config.gated === true;

    if (!articleId) return '';

    const pdfUrl = `/api/articles/${articleId}/pdf?type=${type}`;
    const descHtml = description ? `<p class="pdf-desc">${escapeHtml(description)}</p>` : '';

    if (!gated) {
        return `<div class="pdf-download">
  <span class="pdf-icon">📄</span>
  <div class="pdf-content">
    ${descHtml}
    <a href="${escapeAttr(pdfUrl)}" class="pdf-download-btn" download><span class="pdf-btn-icon">⬇</span> ${escapeHtml(buttonText)}</a>
  </div>
</div>`;
    }

    return `<div class="pdf-download" id="pdf-gate">
  <span class="pdf-icon">📄</span>
  <div class="pdf-content">
    ${descHtml}
    <p class="pdf-gate-text">Enter your email to download:</p>
    <form id="pdf-gate-form" class="pdf-gate-form">
      <input type="email" id="pdf-gate-email" placeholder="your@email.com" required>
      <button type="submit"><span class="pdf-btn-icon">⬇</span> ${escapeHtml(buttonText)}</button>
    </form>
    <a href="${escapeAttr(pdfUrl)}" class="pdf-download-btn" id="pdf-direct-link" style="display:none" download><span class="pdf-btn-icon">⬇</span> ${escapeHtml(buttonText)}</a>
  </div>
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
    rules.forEach(function(rule){if(evalCondition(rule.condition)){var card=document.createElement('div');card.className='wizard-result-card result-'+resultType;var rh=document.createElement('h4');rh.textContent=rule.title;card.appendChild(rh);var rp=document.createElement('p');rp.textContent=rule.body;card.appendChild(rp);if(rule.cta){var ra=document.createElement('a');ra.href=rule.cta.url;ra.className='cta-button';ra.textContent=rule.cta.text;card.appendChild(ra)}cardsEl.appendChild(card)}});
    var scoreValue=null,scoreBand=null;
    if(enableScoreUi){scoreValue=computeScore();scoreBand=getScoreBand(scoreValue)}
    if(cardsEl.children.length===0){var scoreOutcome=scoreValue!==null?getScoreOutcome(scoreValue):null;if(scoreOutcome){var oc=document.createElement('div');oc.className='wizard-result-card result-'+resultType;var oh=document.createElement('h4');oh.textContent=scoreOutcome.title;oc.appendChild(oh);var op=document.createElement('p');op.textContent=scoreOutcome.body;oc.appendChild(op);if(scoreOutcome.cta){var oa=document.createElement('a');oa.href=scoreOutcome.cta.url;oa.className='cta-button';oa.textContent=scoreOutcome.cta.text;oc.appendChild(oa)}cardsEl.appendChild(oc)}else{var ec=document.createElement('div');ec.className='wizard-result-card';var eh=document.createElement('h4');eh.textContent=emptyTitle;ec.appendChild(eh);var ep=document.createElement('p');ep.textContent=emptyBody;ec.appendChild(ep);cardsEl.appendChild(ec)}}
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
    const config = (block.config || {}) as Record<string, unknown>;
    const title = (content.title as string) || 'Widget';
    const sourceBlockId = (content.sourceBlockId as string) || '';
    const width = (config.width as string) || '100%';
    const height = (config.height as string) || '600px';

    const titleHtml = title ? `<h3 class="embed-title">${escapeHtml(title)}</h3>` : '';
    const src = sourceBlockId ? `/embed/${escapeAttr(sourceBlockId)}` : '';

    if (!src) {
        return `<div class="embed-widget">${titleHtml}<p class="embed-placeholder">Embed widget — no source configured</p></div>`;
    }

    return `<div class="embed-widget">
  ${titleHtml}
  <div class="embed-container" style="max-width:${escapeAttr(width)}">
    <iframe src="${src}" loading="lazy" title="${escapeAttr(title)}" style="width:100%;height:${escapeAttr(height)};border:none;border-radius:var(--radius-md,.5rem)" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
  </div>
</div>`;
});

// ============================================================
// ResourceGrid — BusyBusy-style "More Resources" icon card grid
// ============================================================

registerBlockRenderer('ResourceGrid', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const heading = (content.heading as string) || 'More Resources';
    const items = (content.items as Array<{
        icon: string; title: string; description: string; href: string;
    }>) || [];

    if (items.length === 0) return '';

    const cardsHtml = items.map(item =>
        `<a href="${escapeAttr(item.href)}" class="resource-card">
  <span class="resource-icon">${escapeHtml(item.icon)}</span>
  <h3 class="resource-title">${escapeHtml(item.title)}</h3>
  <p class="resource-desc">${escapeHtml(item.description)}</p>
</a>`
    ).join('\n');

    return `<section class="resource-grid-section">
  <div class="resource-grid-banner">
    <h2>${escapeHtml(heading)}</h2>
  </div>
  <div class="site-container">
    <div class="resource-grid">${cardsHtml}</div>
  </div>
</section>`;
});

// ============================================================
// LatestArticles — card grid with image + title + excerpt
// ============================================================

registerBlockRenderer('LatestArticles', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const heading = (content.heading as string) || 'Latest Articles';
    const articles = (content.articles as Array<{
        title: string; excerpt: string; href: string; image?: string;
    }>) || [];

    if (articles.length === 0) return '';

    const cardsHtml = articles.map(article => {
        // Validate image URL: only allow http(s) or root-relative paths to prevent CSS injection
        const isValidImage = article.image && /^(https?:\/\/|\/)[^'"()]+$/.test(article.image);
        const imgHtml = isValidImage
            ? `<div class="article-card-img" style="background-image:url('${escapeAttr(article.image as string)}')"></div>`
            : `<div class="article-card-img article-card-img--placeholder"></div>`;
        return `<a href="${escapeAttr(article.href)}" class="article-card">
  ${imgHtml}
  <div class="article-card-body">
    <h3 class="article-card-title">${escapeHtml(article.title)}</h3>
    <p class="article-card-excerpt">${escapeHtml(article.excerpt)}</p>
  </div>
</a>`;
    }).join('\n');

    return `<section class="latest-articles-section">
  <div class="site-container">
    <div class="latest-articles-banner">
      <h2>${escapeHtml(heading)}</h2>
    </div>
    <div class="latest-articles-grid">${cardsHtml}</div>
  </div>
</section>`;
});
