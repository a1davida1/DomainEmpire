/**
 * Calculator page template generator.
 * Renders interactive calculator forms with safe formula evaluation,
 * methodology block, and WebApplication JSON-LD.
 */

import type { Article } from '@/lib/db/schema';
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
} from './shared';

type CalcInput = {
  id: string;
  label: string;
  type: 'number' | 'select' | 'range';
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: number }>;
};

type CalcOutput = {
  id: string;
  label: string;
  format: 'currency' | 'percent' | 'number';
  decimals?: number;
};

type CalculatorConfig = {
  inputs: CalcInput[];
  outputs: CalcOutput[];
  formula?: string;
  assumptions?: string[];
  methodology?: string;
};

function buildInputHtml(input: CalcInput): string {
  const id = escapeAttr(input.id);
  const label = escapeHtml(input.label);

  if (input.type === 'select' && input.options) {
    const opts = input.options.map(o =>
      `<option value="${o.value}">${escapeHtml(o.label)}</option>`
    ).join('');
    return `<div class="calc-field">
  <label for="${id}">${label}</label>
  <select id="${id}" name="${id}" class="calc-input">${opts}</select>
</div>`;
  }

  if (input.type === 'range') {
    const min = input.min ?? 0;
    const max = input.max ?? 100;
    const step = input.step ?? 1;
    const def = input.default ?? min;
    return `<div class="calc-field">
  <label for="${id}">${label}: <output id="${id}_display">${def}</output></label>
  <input type="range" id="${id}" name="${id}" class="calc-input" min="${min}" max="${max}" step="${step}" value="${def}">
</div>`;
  }

  // Default: number input
  const min = input.min != null ? ` min="${input.min}"` : '';
  const max = input.max != null ? ` max="${input.max}"` : '';
  const step = input.step != null ? ` step="${input.step}"` : '';
  const def = input.default != null ? ` value="${input.default}"` : '';
  return `<div class="calc-field">
  <label for="${id}">${label}</label>
  <input type="number" id="${id}" name="${id}" class="calc-input"${min}${max}${step}${def}>
</div>`;
}

function buildOutputHtml(output: CalcOutput): string {
  return `<div class="calc-result-item">
  <span class="calc-result-label">${escapeHtml(output.label)}</span>
  <output id="${escapeAttr(output.id)}" class="calc-result-value">—</output>
</div>`;
}

function buildCalculatorScript(config: CalculatorConfig): string {
  // Build safe formula evaluation using pre-defined financial functions.
  // No eval() — uses explicit math operations mapped from formula description.
  const inputIds = config.inputs.map(i => JSON.stringify(i.id));
  const outputConfigs = JSON.stringify(config.outputs.map(o => ({
    id: o.id,
    format: o.format,
    decimals: o.decimals ?? 2,
  })));

  return `<script>
(function() {
  // Financial helper functions available in formulas
  function pmt(rate, nper, pv) {
    if (rate === 0) return pv / nper;
    var x = Math.pow(1 + rate, nper);
    return (pv * rate * x) / (x - 1);
  }
  function fv(rate, nper, pmtVal, pv) {
    if (rate === 0) return -(pv + pmtVal * nper);
    var x = Math.pow(1 + rate, nper);
    return -(pv * x + pmtVal * ((x - 1) / rate));
  }
  function pv(rate, nper, pmtVal) {
    if (rate === 0) return -pmtVal * nper;
    return -pmtVal * ((1 - Math.pow(1 + rate, -nper)) / rate);
  }

  var inputIds = [${inputIds.join(',')}];
  var outputConfigs = ${outputConfigs};

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function formatValue(val, fmt, dec) {
    if (isNaN(val) || !isFinite(val)) return '—';
    if (fmt === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(val);
    if (fmt === 'percent') return (val * 100).toFixed(dec) + '%';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(val);
  }

  function calculate() {
    var vals = {};
    inputIds.forEach(function(id) { vals[id] = getVal(id); });
    // Expose vals for formula — the formula string is described in the methodology,
    // actual computation is done server-side during generation or inline here.
    // This generic handler exposes common patterns:
    try {
      var results = computeResults(vals);
      outputConfigs.forEach(function(o) {
        var el = document.getElementById(o.id);
        if (el && results[o.id] !== undefined) {
          el.textContent = formatValue(results[o.id], o.format, o.decimals);
        }
      });
    } catch(e) {
      outputConfigs.forEach(function(o) {
        var el = document.getElementById(o.id);
        if (el) el.textContent = 'Error';
        el && (el.title = 'Calculation failed: ' + (e.message || 'unknown error'));
      });
    }
  }

  // Named formula dispatch — recognized patterns get dedicated functions.
  var FORMULAS = {
    mortgage_payment: function(v) {
      var monthlyRate = (v.interest_rate / 100) / 12;
      var months = (v.loan_term || 30) * 12;
      var mp = pmt(monthlyRate, months, v.loan_amount || 0);
      return { monthly_payment: mp, total_paid: mp * months, total_interest: mp * months - (v.loan_amount || 0) };
    },
    compound_interest: function(v) {
      var principal = v.principal || v.initial_investment || 0;
      var rate = (v.interest_rate || v.annual_rate || 0) / 100;
      var years = v.years || v.time_period || 10;
      var n = v.compounds_per_year || 12;
      var contribution = v.monthly_contribution || 0;
      var total = fv(rate / n, n * years, -contribution, -principal);
      return { future_value: total, total_contributions: principal + contribution * n * years, total_interest: total - principal - contribution * n * years };
    },
    savings_goal: function(v) {
      var goal = v.savings_goal || v.target || 0;
      var rate = (v.interest_rate || v.annual_rate || 0) / 100;
      var years = v.years || v.time_period || 10;
      var n = 12;
      var r = rate / n;
      var periods = n * years;
      var monthly = r === 0 ? goal / periods : (goal * r) / (Math.pow(1 + r, periods) - 1);
      return { monthly_savings: monthly, total_contributed: monthly * periods, interest_earned: goal - monthly * periods };
    },
    loan_amortization: function(v) {
      var principal = v.loan_amount || v.principal || 0;
      var rate = (v.interest_rate || 0) / 100 / 12;
      var months = (v.loan_term || 30) * 12;
      var mp = pmt(rate, months, principal);
      var firstInterest = principal * rate;
      var firstPrincipal = mp - firstInterest;
      return { monthly_payment: mp, first_interest: firstInterest, first_principal: firstPrincipal, total_paid: mp * months, total_interest: mp * months - principal };
    },
    roi: function(v) {
      var gain = (v.final_value || 0) - (v.initial_investment || 0);
      var roiVal = (v.initial_investment || 0) !== 0 ? gain / (v.initial_investment || 1) : 0;
      return { net_gain: gain, roi_percent: roiVal, annualized_roi: v.years ? Math.pow(1 + roiVal, 1 / v.years) - 1 : roiVal };
    }
  };

  // Detect formula from config string or auto-detect from input IDs
  var formulaKey = (${JSON.stringify(config.formula || '')}).toLowerCase().replace(/[^a-z_]/g, '_');
  var computeFn = FORMULAS[formulaKey] || null;
  if (!computeFn) {
    var ids = inputIds.join(',');
    if (ids.indexOf('loan_amount') >= 0 && ids.indexOf('interest_rate') >= 0) computeFn = FORMULAS.mortgage_payment;
    else if (ids.indexOf('principal') >= 0 || ids.indexOf('initial_investment') >= 0) computeFn = FORMULAS.compound_interest;
    else if (ids.indexOf('savings_goal') >= 0 || ids.indexOf('target') >= 0) computeFn = FORMULAS.savings_goal;
  }

  if (!computeFn) {
    // Show user-facing message when formula isn't configured
    var msgEl = document.getElementById('calc-error-msg');
    if (msgEl) msgEl.style.display = 'block';
  }
  window.computeResults = computeFn || function() { return {}; };

  // Attach listeners
  inputIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function() {
        // Update range display if exists
        var display = document.getElementById(id + '_display');
        if (display) display.textContent = el.value;
        calculate();
      });
    }
  });

  // Initial calculation
  calculate();
})();
</script>`;
}

export async function generateCalculatorPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  datasets: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  const config = article.calculatorConfig as CalculatorConfig | null;
  const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
  const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
  const dataSourcesHtml = generateDataSourcesSection(datasets);

  const schemaLd = buildSchemaJsonLd(article, domain, 'WebApplication', {
    applicationCategory: 'FinanceApplication',
  });

  // Build calculator form
  let calculatorHtml = '';
  if (config && config.inputs.length > 0) {
    const inputsHtml = config.inputs.map(buildInputHtml).join('\n');
    const outputsHtml = config.outputs.map(buildOutputHtml).join('\n');

    calculatorHtml = `
<section class="calc-form" id="calculator">
  <h2>Calculator</h2>
  <form onsubmit="return false;">
    ${inputsHtml}
  </form>
  <div id="calc-error-msg" style="display:none;padding:1rem;background:#fef2f2;border:1px solid #fecaca;border-radius:0.5rem;color:#991b1b;margin-top:1rem;">
    This calculator's formula is not yet configured. Results may not display correctly.
  </div>
  <div class="calc-results">
    ${outputsHtml}
  </div>
</section>`;

    // Methodology block
    if (config.methodology || (config.assumptions && config.assumptions.length > 0)) {
      const assumptionsList = (config.assumptions || [])
        .map(a => `<li>${escapeHtml(a)}</li>`).join('');
      const methodText = config.methodology ? `<p>${escapeHtml(config.methodology)}</p>` : '';
      calculatorHtml += `
<details class="calc-methodology">
  <summary>Methodology & Assumptions</summary>
  ${methodText}
  ${assumptionsList ? `<ul>${assumptionsList}</ul>` : ''}
</details>`;
    }
  }

  const titleHtml = escapeHtml(article.title);
  const freshnessBadge = buildFreshnessBadge(article, datasets);
  const ogTags = buildOpenGraphTags(article, domain);
  const printBtn = buildPrintButton('calculator');

  const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  <article>
    <h1>${titleHtml}</h1>
    ${calculatorHtml}
    ${contentHtml}
  </article>
  ${dataSourcesHtml}
  ${trustHtml}
  ${config ? buildCalculatorScript(config) : ''}`;

  return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}
