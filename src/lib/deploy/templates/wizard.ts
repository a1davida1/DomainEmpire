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
  wrapInHtmlPage,
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
  scoring?: {
    method?: 'completion' | 'weighted';
    weights?: Record<string, number>;
    valueMap?: Record<string, Record<string, number>>;
    bands?: Array<{
      min: number;
      max: number;
      label: string;
      description?: string;
    }>;
    outcomes?: Array<{
      min: number;
      max: number;
      title: string;
      body: string;
      cta?: { text: string; url: string };
    }>;
  };
}

type WizardMode = 'wizard' | 'configurator' | 'quiz' | 'survey' | 'assessment';

interface WizardModeCopy {
  finalStepLabel: string;
  resultsTitle: string;
  restartLabel: string;
  emptyTitle: string;
  emptyBody: string;
  leadTitle: string;
  leadButton: string;
  showAnswerSummary: boolean;
  showQuizScore: boolean;
}

const WIZARD_MODE_COPY: Record<WizardMode, WizardModeCopy> = {
  wizard: {
    finalStepLabel: 'See Results',
    resultsTitle: 'Your Results',
    restartLabel: 'Start Over',
    emptyTitle: 'No matching results',
    emptyBody: 'Please try different answers.',
    leadTitle: 'Get Your Personalized Report',
    leadButton: 'Get My Results',
    showAnswerSummary: false,
    showQuizScore: false,
  },
  configurator: {
    finalStepLabel: 'Review Configuration',
    resultsTitle: 'Your Configuration',
    restartLabel: 'Reconfigure',
    emptyTitle: 'Configuration ready',
    emptyBody: 'Your current selections are shown below.',
    leadTitle: 'Send Me This Configuration',
    leadButton: 'Save Configuration',
    showAnswerSummary: true,
    showQuizScore: false,
  },
  quiz: {
    finalStepLabel: 'See Score',
    resultsTitle: 'Your Score',
    restartLabel: 'Retake Quiz',
    emptyTitle: 'Quiz complete',
    emptyBody: 'You completed the quiz. Review your score below.',
    leadTitle: 'Email My Quiz Results',
    leadButton: 'Send Results',
    showAnswerSummary: false,
    showQuizScore: true,
  },
  survey: {
    finalStepLabel: 'Submit Survey',
    resultsTitle: 'Thanks for sharing',
    restartLabel: 'Submit Another Response',
    emptyTitle: 'Submission recorded',
    emptyBody: 'Thank you for completing this survey.',
    leadTitle: 'Send Me A Copy',
    leadButton: 'Email My Response',
    showAnswerSummary: true,
    showQuizScore: false,
  },
  assessment: {
    finalStepLabel: 'See Assessment',
    resultsTitle: 'Assessment Results',
    restartLabel: 'Retake Assessment',
    emptyTitle: 'Assessment complete',
    emptyBody: 'Review your outcome and recommendations below.',
    leadTitle: 'Email My Assessment',
    leadButton: 'Send Assessment',
    showAnswerSummary: true,
    showQuizScore: true,
  },
};

function getWizardModeFromContentType(contentType: string | null | undefined): WizardMode {
  if (contentType === 'configurator' || contentType === 'quiz' || contentType === 'survey' || contentType === 'assessment') {
    return contentType;
  }
  return 'wizard';
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

function renderStep(step: WizardStep, index: number, total: number, mode: WizardMode): string {
  const fieldsHtml = step.fields.map(renderField).join('\n');
  const desc = step.description ? `<p class="wizard-step-desc">${escapeHtml(step.description)}</p>` : '';
  const finalLabel = WIZARD_MODE_COPY[mode].finalStepLabel;

  return `<div class="wizard-step" data-step-id="${escapeAttr(step.id)}" data-step-index="${index}" style="${index === 0 ? '' : 'display:none'}">
  <h3 class="wizard-step-title">${escapeHtml(step.title)}</h3>
  ${desc}
  ${fieldsHtml}
  <div class="wizard-nav">
    ${index > 0 ? '<button type="button" class="wizard-back">Back</button>' : '<span></span>'}
    <button type="button" class="wizard-next">${index === total - 1 ? finalLabel : 'Next'}</button>
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

function buildResultsTemplate(config: WizardConfig, mode: WizardMode): string {
  const modeCopy = WIZARD_MODE_COPY[mode];
  // Lead capture form (optional)
  let leadHtml = '';
  if (config.collectLead) {
    const fields = config.collectLead.fields.map(f => {
      const type = f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text';
      return `<div class="wizard-field"><label for="lead-${escapeAttr(f)}">${escapeHtml(f.charAt(0).toUpperCase() + f.slice(1))}</label><input type="${type}" id="lead-${escapeAttr(f)}" name="${escapeAttr(f)}" required></div>`;
    }).join('\n    ');
    leadHtml = `
  <div class="wizard-lead-form" style="display:none">
    <h4>${escapeHtml(modeCopy.leadTitle)}</h4>
    <form id="wizard-lead-form" action="${escapeAttr(config.collectLead.endpoint)}" method="POST">
      ${fields}
      <div class="consent"><label><input type="checkbox" required> ${escapeHtml(config.collectLead.consentText)}</label></div>
      <button type="submit">${escapeHtml(modeCopy.leadButton)}</button>
    </form>
  </div>`;
  }

  const answerSummaryHtml = modeCopy.showAnswerSummary
    ? `<div class="wizard-answer-summary" style="display:none">
  <h4>Selection Summary</h4>
  <ul class="wizard-answer-list"></ul>
</div>`
    : '';
  const quizScoreHtml = modeCopy.showQuizScore
    ? '<div class="wizard-quiz-score" style="display:none"></div>'
    : '';

  return `<div class="wizard-results" style="display:none">
  <h3 class="wizard-results-title">${escapeHtml(modeCopy.resultsTitle)}</h3>
  ${quizScoreHtml}
  <div class="wizard-results-cards"></div>
  ${answerSummaryHtml}
  ${leadHtml}
  <button type="button" class="wizard-restart">${escapeHtml(modeCopy.restartLabel)}</button>
</div>`;
}

function buildWizardScript(config: WizardConfig, mode: WizardMode): string {
  const modeCopy = WIZARD_MODE_COPY[mode];
  // Serialize config to JSON for client-side use
  const stepsJson = JSON.stringify(config.steps.map(s => ({
    id: s.id,
    nextStep: s.nextStep,
    branches: s.branches,
    fieldIds: s.fields.map(f => ({ id: f.id, label: f.label, required: !!f.required })),
  })));
  const rulesJson = JSON.stringify(config.resultRules);
  const scoringJson = JSON.stringify(config.scoring ?? null);
  const resultTemplate = config.resultTemplate;

  return `<script>
(function(){
  var container = document.querySelector('.wizard-container');
  if(!container) return;
  var steps = ${stepsJson};
  var rules = ${rulesJson};
  var scoring = ${scoringJson};
  var resultType = '${resultTemplate}';
  var wizardMode = ${JSON.stringify(mode)};
  var enableScoreUi = ${JSON.stringify(modeCopy.showQuizScore)};
  var emptyTitle = ${JSON.stringify(modeCopy.emptyTitle)};
  var emptyBody = ${JSON.stringify(modeCopy.emptyBody)};
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

  function computeCompletionScore() {
    var required = 0;
    var answeredRequired = 0;
    steps.forEach(function(step){
      step.fieldIds.forEach(function(field){
        if(!field.required) return;
        required++;
        var v = answers[field.id];
        if(v!==undefined && v!=='' && (!Array.isArray(v) || v.length>0)) answeredRequired++;
      });
    });
    return required > 0 ? Math.round((answeredRequired / required) * 100) : 100;
  }

  function toScoreValue(fieldId, value) {
    if(value===undefined || value===null) return null;
    var valueMap = scoring && scoring.valueMap ? scoring.valueMap[fieldId] : null;
    if(typeof value==='number') return value;
    if(typeof value==='string'){
      if(valueMap && Object.prototype.hasOwnProperty.call(valueMap, value)){
        return Number(valueMap[value]);
      }
      if(value.trim()!=='' && !isNaN(Number(value))) return Number(value);
      return value.trim()!=='' ? 100 : null;
    }
    if(Array.isArray(value)){
      if(value.length===0) return 0;
      if(valueMap){
        var sum = 0;
        var count = 0;
        value.forEach(function(entry){
          if(Object.prototype.hasOwnProperty.call(valueMap, entry)){
            sum += Number(valueMap[entry]);
            count += 1;
          }
        });
        if(count>0) return sum / count;
      }
      return 100;
    }
    return 100;
  }

  function computeWeightedScore() {
    if(!scoring || scoring.method !== 'weighted' || !scoring.weights) return null;
    var weights = scoring.weights;
    var totalWeight = 0;
    var achieved = 0;
    Object.keys(weights).forEach(function(fieldId){
      var weight = Number(weights[fieldId]);
      if(!isFinite(weight) || weight <= 0) return;
      totalWeight += weight;
      var scoreVal = toScoreValue(fieldId, answers[fieldId]);
      if(scoreVal===null) return;
      var bounded = Math.max(0, Math.min(100, Number(scoreVal)));
      achieved += weight * (bounded / 100);
    });
    if(totalWeight <= 0) return null;
    return Math.round((achieved / totalWeight) * 100);
  }

  function computeScore() {
    if(scoring && scoring.method === 'weighted') {
      var weighted = computeWeightedScore();
      if(weighted !== null) return weighted;
    }
    return computeCompletionScore();
  }

  function getScoreBand(score) {
    if(!scoring || !Array.isArray(scoring.bands)) return null;
    for(var i=0;i<scoring.bands.length;i++){
      var band = scoring.bands[i];
      var min = Number(band.min);
      var max = Number(band.max);
      if(!isFinite(min) || !isFinite(max)) continue;
      if(score >= min && score <= max) return band;
    }
    return null;
  }

  function getScoreOutcome(score) {
    if(!scoring || !Array.isArray(scoring.outcomes)) return null;
    for(var i=0;i<scoring.outcomes.length;i++){
      var outcome = scoring.outcomes[i];
      var min = Number(outcome.min);
      var max = Number(outcome.max);
      if(!isFinite(min) || !isFinite(max)) continue;
      if(score >= min && score <= max) return outcome;
    }
    return null;
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
    var scoreValue = null;
    var scoreBand = null;
    if(enableScoreUi){
      scoreValue = computeScore();
      scoreBand = getScoreBand(scoreValue);
    }
    if(cardsEl.children.length===0){
      var scoreOutcome = scoreValue!==null ? getScoreOutcome(scoreValue) : null;
      if(scoreOutcome){
        var outcomeCard = document.createElement('div');
        outcomeCard.className = 'wizard-result-card result-' + resultType;
        outcomeCard.innerHTML = '<h4>'+scoreOutcome.title+'</h4><p>'+scoreOutcome.body+'</p>' +
          (scoreOutcome.cta ? '<a href="'+scoreOutcome.cta.url+'" class="cta-button">'+scoreOutcome.cta.text+'</a>' : '');
        cardsEl.appendChild(outcomeCard);
      } else {
        cardsEl.innerHTML='<div class="wizard-result-card"><h4>'+emptyTitle+'</h4><p>'+emptyBody+'</p></div>';
      }
    }
    function findFieldLabel(fieldId){
      for(var si=0;si<steps.length;si++){
        var fields = steps[si].fieldIds || [];
        for(var fi=0;fi<fields.length;fi++){
          if(fields[fi].id===fieldId) return fields[fi].label || fieldId;
        }
      }
      return fieldId;
    }
    var summaryEl = container.querySelector('.wizard-answer-summary');
    if(summaryEl){
      var listEl = summaryEl.querySelector('.wizard-answer-list');
      if(listEl){
        listEl.innerHTML = '';
        Object.keys(answers).forEach(function(key){
          var item = document.createElement('li');
          var value = answers[key];
          var text = Array.isArray(value) ? value.join(', ') : String(value || '(none)');
          item.textContent = findFieldLabel(key) + ': ' + text;
          listEl.appendChild(item);
        });
      }
      summaryEl.style.display = '';
    }
    var scoreEl = container.querySelector('.wizard-quiz-score');
    if(scoreEl){
      var pct = scoreValue!==null ? scoreValue : computeScore();
      var band = scoreBand || getScoreBand(pct);
      var prefix = wizardMode === 'quiz' ? 'Quiz Score: ' : 'Assessment Score: ';
      var suffix = band && band.label ? (' - ' + band.label) : '';
      var details = band && band.description ? (' (' + band.description + ')') : '';
      scoreEl.textContent = prefix + pct + '%' + suffix;
      if(details){
        var detailEl = document.createElement('div');
        detailEl.className = 'wizard-score-detail';
        detailEl.textContent = details;
        scoreEl.innerHTML = '';
        var textSpan = document.createElement('span');
        textSpan.textContent = prefix + pct + '%' + suffix;
        scoreEl.appendChild(textSpan);
        scoreEl.appendChild(detailEl);
      }
      scoreEl.style.display = '';
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
      var summaryEl = container.querySelector('.wizard-answer-summary');
      if(summaryEl) summaryEl.style.display='none';
      var scoreEl = container.querySelector('.wizard-quiz-score');
      if(scoreEl) scoreEl.style.display='none';
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

async function generateWizardLikePage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  articleDatasetInfo: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
  mode: WizardMode,
): Promise<string> {
  const config = article.wizardConfig as WizardConfig | null;
  if (!config?.steps?.length) {
    // Fallback: render as standard article if no wizard config
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const body = `${disclaimerHtml}<article><h1>${escapeHtml(article.title)}</h1><p>Wizard configuration is not yet available.</p></article>${trustHtml}`;
    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell);
  }

  const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
  const dataSourcesHtml = generateDataSourcesSection(articleDatasetInfo);
  const schemaLd = buildSchemaJsonLd(article, domain, 'WebApplication');
  const ogTags = buildOpenGraphTags(article, domain);

  const progressBar = buildProgressBar(config.steps);
  const stepsHtml = config.steps.map((step, i) => renderStep(step, i, config.steps.length, mode)).join('\n');
  const resultsHtml = buildResultsTemplate(config, mode);

  const body = `${disclaimerHtml}
  ${schemaLd}
  <article>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="wizard-container wizard-mode-${escapeAttr(mode)}" data-wizard-mode="${escapeAttr(mode)}">
      ${progressBar}
      ${stepsHtml}
      ${resultsHtml}
    </div>
  </article>
  ${dataSourcesHtml}
  ${trustHtml}
  ${buildWizardScript(config, mode)}`;

  return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}

export async function generateWizardPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  articleDatasetInfo: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  const mode = getWizardModeFromContentType(article.contentType);
  return generateWizardLikePage(article, domain, disclosure, articleDatasetInfo, pageShell, mode);
}

export async function generateConfiguratorPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  articleDatasetInfo: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  return generateWizardLikePage(article, domain, disclosure, articleDatasetInfo, pageShell, 'configurator');
}

export async function generateQuizPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  articleDatasetInfo: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  return generateWizardLikePage(article, domain, disclosure, articleDatasetInfo, pageShell, 'quiz');
}

export async function generateSurveyPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  articleDatasetInfo: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  return generateWizardLikePage(article, domain, disclosure, articleDatasetInfo, pageShell, 'survey');
}

export async function generateAssessmentPage(
  article: Article,
  domain: string,
  disclosure: DisclosureInfo | null | undefined,
  articleDatasetInfo: ArticleDatasetInfo[],
  pageShell: import('./shared').PageShell,
): Promise<string> {
  return generateWizardLikePage(article, domain, disclosure, articleDatasetInfo, pageShell, 'assessment');
}
