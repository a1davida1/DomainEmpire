/**
 * Wizard template — multi-step guided flow with branching,
 * progress bar, results, and optional lead capture.
 * Generates vanilla JS with no external dependencies.
 */

import {
    escapeHtml,
    escapeAttr,
    buildTrustElements,
    buildSchemaJsonLd,
    wrapInAstroLayout,
    generateDataSourcesSection,
    buildOpenGraphTags,
    type DisclosureInfo,
    type ArticleDatasetInfo,
    type Article,
} from './shared';

interface WizardStep {
    id: string;
    title: string;
    description?: string;
    fields: Array<{
        id: string;
        type: 'radio' | 'checkbox' | 'select' | 'number' | 'text';
        label: string;
        options?: Array<{ value: string; label: string }>;
        required?: boolean;
    }>;
    nextStep?: string;
    branches?: Array<{ condition: string; goTo: string }>;
}

interface WizardConfig {
    steps: WizardStep[];
    resultRules: Array<{
        condition: string;
        title: string;
        body: string;
        cta?: { text: string; url: string };
    }>;
    resultTemplate: 'summary' | 'recommendation' | 'score' | 'eligibility';
    collectLead?: {
        fields: string[];
        consentText: string;
        endpoint: string;
    };
}

function renderField(field: WizardStep['fields'][0]): string {
    const req = field.required ? ' required' : '';
    const id = escapeAttr(field.id);
    const label = escapeHtml(field.label);

    switch (field.type) {
        case 'radio':
            if (!field.options?.length) return '';
            return `<fieldset class="wizard-field" data-field-id="${id}">
  <legend>${label}</legend>
  ${field.options.map(opt => `<label class="wizard-radio"><input type="radio" name="${id}" value="${escapeAttr(opt.value)}"${req}><span>${escapeHtml(opt.label)}</span></label>`).join('\n  ')}
</fieldset>`;

        case 'checkbox':
            if (!field.options?.length) return '';
            return `<fieldset class="wizard-field" data-field-id="${id}">
  <legend>${label}</legend>
  ${field.options.map(opt => `<label class="wizard-checkbox"><input type="checkbox" name="${id}" value="${escapeAttr(opt.value)}"><span>${escapeHtml(opt.label)}</span></label>`).join('\n  ')}
</fieldset>`;

        case 'select':
            return `<div class="wizard-field" data-field-id="${id}">
  <label for="wf-${id}">${label}</label>
  <select id="wf-${id}" name="${id}"${req}>
    <option value="">Select...</option>
    ${(field.options ?? []).map(opt => `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`).join('\n    ')}
  </select>
</div>`;

        case 'number':
            return `<div class="wizard-field" data-field-id="${id}">
  <label for="wf-${id}">${label}</label>
  <input type="number" id="wf-${id}" name="${id}" inputmode="numeric"${req}>
</div>`;

        case 'text':
        default:
            return `<div class="wizard-field" data-field-id="${id}">
  <label for="wf-${id}">${label}</label>
  <input type="text" id="wf-${id}" name="${id}"${req}>
</div>`;
    }
}

function renderStep(step: WizardStep, index: number, total: number): string {
    const fieldsHtml = step.fields.map(renderField).join('\n');
    const desc = step.description ? `<p class="wizard-step-desc">${escapeHtml(step.description)}</p>` : '';

    return `<div class="wizard-step" data-step-id="${escapeAttr(step.id)}" data-step-index="${index}" style="${index === 0 ? '' : 'display:none'}">
  <h3 class="wizard-step-title">${escapeHtml(step.title)}</h3>
  ${desc}
  ${fieldsHtml}
  <div class="wizard-nav">
    ${index > 0 ? '<button type="button" class="wizard-back">Back</button>' : '<span></span>'}
    <button type="button" class="wizard-next">${index === total - 1 ? 'See Results' : 'Next'}</button>
  </div>
</div>`;
}

function buildProgressBar(steps: WizardStep[]): string {
    const segments = steps.map((s, i) =>
        `<div class="wizard-progress-segment${i === 0 ? ' active' : ''}" data-index="${i}">
      <span class="wizard-progress-dot">${i + 1}</span>
      <span class="wizard-progress-label">${escapeHtml(s.title)}</span>
    </div>`
    ).join('\n  ');

    return `<div class="wizard-progress">${segments}</div>`;
}

function buildResultsTemplate(config: WizardConfig): string {
    // Lead capture form (optional)
    let leadHtml = '';
    if (config.collectLead) {
        const fields = config.collectLead.fields.map(f => {
            const type = f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text';
            return `<div class="wizard-field"><label for="lead-${escapeAttr(f)}">${escapeHtml(f.charAt(0).toUpperCase() + f.slice(1))}</label><input type="${type}" id="lead-${escapeAttr(f)}" name="${escapeAttr(f)}" required></div>`;
        }).join('\n    ');
        leadHtml = `
  <div class="wizard-lead-form" style="display:none">
    <h4>Get Your Personalized Report</h4>
    <form id="wizard-lead-form" action="${escapeAttr(config.collectLead.endpoint)}" method="POST">
      ${fields}
      <div class="consent"><label><input type="checkbox" required> ${escapeHtml(config.collectLead.consentText)}</label></div>
      <button type="submit">Get My Results</button>
    </form>
  </div>`;
    }

    return `<div class="wizard-results" style="display:none">
  <h3 class="wizard-results-title">Your Results</h3>
  <div class="wizard-results-cards"></div>
  ${leadHtml}
  <button type="button" class="wizard-restart">Start Over</button>
</div>`;
}

function buildWizardScript(config: WizardConfig): string {
    // Serialize config to JSON for client-side use
    const stepsJson = JSON.stringify(config.steps.map(s => ({
        id: s.id,
        nextStep: s.nextStep,
        branches: s.branches,
        fieldIds: s.fields.map(f => ({ id: f.id, required: !!f.required })),
    })));
    const rulesJson = JSON.stringify(config.resultRules);
    const resultTemplate = config.resultTemplate;

    return `<script>
(function(){
  var container = document.querySelector('.wizard-container');
  if(!container) return;
  var steps = ${stepsJson};
  var rules = ${rulesJson};
  var resultType = '${resultTemplate}';
  var answers = {};
  var history = [0];

  function getStepEl(idx) {
    return container.querySelectorAll('.wizard-step')[idx];
  }

  function showStep(idx) {
    container.querySelectorAll('.wizard-step').forEach(function(el,i){
      el.style.display = i===idx?'':'none';
    });
    container.querySelectorAll('.wizard-progress-segment').forEach(function(el,i){
      el.classList.toggle('active',i<=idx);
      el.classList.toggle('current',i===idx);
    });
  }

  function collectAnswers(stepEl) {
    stepEl.querySelectorAll('[name]').forEach(function(el){
      var name = el.name;
      if(el.type==='radio'){
        if(el.checked) answers[name]=el.value;
      } else if(el.type==='checkbox'){
        if(!answers[name]) answers[name]=[];
        if(el.checked && answers[name].indexOf(el.value)===-1) answers[name].push(el.value);
        else if(!el.checked) answers[name]=answers[name].filter(function(v){return v!==el.value});
      } else {
        answers[name]=el.value;
      }
    });
  }

  function validateStep(stepEl,stepDef) {
    var valid = true;
    stepDef.fieldIds.forEach(function(f){
      if(!f.required) return;
      var v = answers[f.id];
      if(v===undefined||v===''||(Array.isArray(v)&&v.length===0)) valid=false;
    });
    return valid;
  }

  // Safe expression evaluator — NO eval/new Function.
  // Supports: field refs, string/number literals, ==, !=, >=, <=, >, <, &&, ||, includes()
  function evalCondition(cond) {
    try {
      // Tokenize
      var tokens = [];
      var i = 0;
      while(i < cond.length) {
        if(cond[i]===' '||cond[i]==='\t'){i++;continue}
        if(cond[i]==="'" || cond[i]==='"'){
          var q=cond[i],j=i+1;
          while(j<cond.length&&cond[j]!==q)j++;
          tokens.push({t:'str',v:cond.slice(i+1,j)});i=j+1;continue;
        }
        if('0123456789'.indexOf(cond[i])!==-1||(cond[i]==='-'&&i+1<cond.length&&'0123456789'.indexOf(cond[i+1])!==-1)){
          var j=i;if(cond[j]==='-')j++;
          while(j<cond.length&&'0123456789.'.indexOf(cond[j])!==-1)j++;
          tokens.push({t:'num',v:parseFloat(cond.slice(i,j))});i=j;continue;
        }
        if(cond.slice(i,i+2)==='=='){tokens.push({t:'op',v:'=='});i+=2;continue}
        if(cond.slice(i,i+2)==='!='){tokens.push({t:'op',v:'!='});i+=2;continue}
        if(cond.slice(i,i+2)==='>='){tokens.push({t:'op',v:'>='});i+=2;continue}
        if(cond.slice(i,i+2)==='<='){tokens.push({t:'op',v:'<='});i+=2;continue}
        if(cond.slice(i,i+2)==='&&'){tokens.push({t:'op',v:'&&'});i+=2;continue}
        if(cond.slice(i,i+2)==='||'){tokens.push({t:'op',v:'||'});i+=2;continue}
        if(cond[i]==='>'){tokens.push({t:'op',v:'>'});i++;continue}
        if(cond[i]==='<'){tokens.push({t:'op',v:'<'});i++;continue}
        if(cond[i]==='('){tokens.push({t:'lp'});i++;continue}
        if(cond[i]===')'){tokens.push({t:'rp'});i++;continue}
        // Identifier (field name) or .includes()
        var j=i;
        while(j<cond.length&&/[a-zA-Z0-9_.]/.test(cond[j]))j++;
        var word=cond.slice(i,j);
        if(word==='.includes'){tokens.push({t:'op',v:'includes'});i=j;continue}
        if(word==='true'){tokens.push({t:'bool',v:true});i=j;continue}
        if(word==='false'){tokens.push({t:'bool',v:false});i=j;continue}
        if(word.indexOf('.includes')!==-1){
          var parts=word.split('.includes');
          tokens.push({t:'ref',v:parts[0]});
          tokens.push({t:'op',v:'includes'});
          i=j;continue;
        }
        tokens.push({t:'ref',v:word});i=j;
      }
      // Resolve a token to its value
      function resolve(tok){
        if(tok.t==='ref') return answers[tok.v]!==undefined?answers[tok.v]:'';
        if(tok.t==='num') return tok.v;
        if(tok.t==='str') return tok.v;
        if(tok.t==='bool') return tok.v;
        return tok.v;
      }
      // Simple recursive descent: expr = comparison ((&&/||) comparison)*
      var pos=0;
      function peek(){return tokens[pos]}
      function next(){return tokens[pos++]}
      function parseComparison(){
        var left=next();
        var leftVal=resolve(left);
        var op=peek();
        if(!op||op.t!=='op')return !!leftVal;
        if(op.v==='&&'||op.v==='||')return !!leftVal;
        next(); // consume op
        if(op.v==='includes'){
          // skip optional (
          if(peek()&&peek().t==='lp')next();
          var arg=next();
          if(peek()&&peek().t==='rp')next();
          var argVal=resolve(arg);
          if(Array.isArray(leftVal))return leftVal.indexOf(argVal)!==-1;
          return String(leftVal).indexOf(String(argVal))!==-1;
        }
        var right=next();
        var rightVal=resolve(right);
        var l=typeof leftVal==='string'&&!isNaN(Number(leftVal))&&typeof rightVal==='number'?Number(leftVal):leftVal;
        var r=typeof rightVal==='string'&&!isNaN(Number(rightVal))&&typeof leftVal==='number'?Number(rightVal):rightVal;
        if(op.v==='==')return l==r;
        if(op.v==='!=')return l!=r;
        if(op.v==='>=')return Number(l)>=Number(r);
        if(op.v==='<=')return Number(l)<=Number(r);
        if(op.v==='>')return Number(l)>Number(r);
        if(op.v==='<')return Number(l)<Number(r);
        return false;
      }
      function parseExpr(){
        var result=parseComparison();
        while(pos<tokens.length){
          var op=peek();
          if(!op||op.t!=='op')break;
          if(op.v==='&&'){next();result=result&&parseComparison()}
          else if(op.v==='||'){next();result=result||parseComparison()}
          else break;
        }
        return !!result;
      }
      return parseExpr();
    } catch(e) { return false; }
  }

  function getNextStepIndex(currentIdx) {
    var step = steps[currentIdx];
    if(step.branches) {
      for(var i=0;i<step.branches.length;i++){
        if(evalCondition(step.branches[i].condition)){
          var targetId = step.branches[i].goTo;
          for(var j=0;j<steps.length;j++){
            if(steps[j].id===targetId) return j;
          }
        }
      }
    }
    if(step.nextStep){
      for(var j=0;j<steps.length;j++){
        if(steps[j].id===step.nextStep) return j;
      }
    }
    return currentIdx+1;
  }

  function showResults() {
    container.querySelectorAll('.wizard-step').forEach(function(el){el.style.display='none'});
    container.querySelectorAll('.wizard-progress-segment').forEach(function(el){el.classList.add('active')});
    var resultsEl = container.querySelector('.wizard-results');
    var cardsEl = resultsEl.querySelector('.wizard-results-cards');
    cardsEl.innerHTML = '';
    rules.forEach(function(rule){
      if(evalCondition(rule.condition)){
        var card = document.createElement('div');
        card.className = 'wizard-result-card result-' + resultType;
        card.innerHTML = '<h4>'+rule.title+'</h4><p>'+rule.body+'</p>' +
          (rule.cta ? '<a href="'+rule.cta.url+'" class="cta-button">'+rule.cta.text+'</a>' : '');
        cardsEl.appendChild(card);
      }
    });
    if(cardsEl.children.length===0){
      cardsEl.innerHTML='<div class="wizard-result-card"><h4>No matching results</h4><p>Please try different answers.</p></div>';
    }
    resultsEl.style.display='';
    var leadForm = container.querySelector('.wizard-lead-form');
    if(leadForm) leadForm.style.display='';
  }

  container.addEventListener('click',function(e){
    var btn = e.target.closest('button');
    if(!btn) return;
    if(btn.classList.contains('wizard-next')){
      var currentIdx = history[history.length-1];
      var stepEl = getStepEl(currentIdx);
      collectAnswers(stepEl);
      if(!validateStep(stepEl,steps[currentIdx])){
        stepEl.classList.add('wizard-shake');
        setTimeout(function(){stepEl.classList.remove('wizard-shake')},400);
        return;
      }
      var next = getNextStepIndex(currentIdx);
      if(next >= steps.length){
        showResults();
      } else {
        history.push(next);
        showStep(next);
      }
    } else if(btn.classList.contains('wizard-back')){
      if(history.length>1){
        history.pop();
        showStep(history[history.length-1]);
      }
    } else if(btn.classList.contains('wizard-restart')){
      answers={};
      history=[0];
      container.querySelector('.wizard-results').style.display='none';
      container.querySelectorAll('input,select').forEach(function(el){
        if(el.type==='checkbox'||el.type==='radio') el.checked=false;
        else el.value='';
      });
      showStep(0);
    }
  });
})();
</script>`;
}

export async function generateWizardPage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    articleDatasetInfo: ArticleDatasetInfo[],
): Promise<string> {
    const config = article.wizardConfig as WizardConfig | null;
    if (!config?.steps?.length) {
        // Fallback: render as standard article if no wizard config
        const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
        const body = `${disclaimerHtml}<article><h1>${escapeHtml(article.title)}</h1><p>Wizard configuration is not yet available.</p></article>${trustHtml}`;
        return wrapInAstroLayout(article.title, article.metaDescription || '', body);
    }

    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(articleDatasetInfo);
    const schemaLd = buildSchemaJsonLd(article, domain, 'WebApplication');
    const ogTags = buildOpenGraphTags(article, domain);

    const progressBar = buildProgressBar(config.steps);
    const stepsHtml = config.steps.map((step, i) => renderStep(step, i, config.steps.length)).join('\n');
    const resultsHtml = buildResultsTemplate(config);

    const body = `${disclaimerHtml}
  ${schemaLd}
  <article>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="wizard-container">
      ${progressBar}
      ${stepsHtml}
      ${resultsHtml}
    </div>
  </article>
  ${dataSourcesHtml}
  ${trustHtml}
  ${buildWizardScript(config)}`;

    return wrapInAstroLayout(article.title, article.metaDescription || '', body, ogTags);
}
