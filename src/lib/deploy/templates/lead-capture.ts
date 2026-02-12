/**
 * Lead capture page template generator.
 * Renders forms with FTC-compliant above-fold disclosure,
 * consent checkbox, and AJAX submission.
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
    type DisclosureInfo,
    type ArticleDatasetInfo,
} from './shared';

type LeadGenField = {
    name: string;
    label: string;
    type: 'text' | 'email' | 'tel' | 'select' | 'number';
    required?: boolean;
    options?: string[];
};

type LeadGenConfig = {
    fields: LeadGenField[];
    consentText: string;
    endpoint: string;
    successMessage: string;
    disclosureAboveFold?: string;
    privacyPolicyUrl?: string;
};

function buildFormField(field: LeadGenField): string {
    const id = escapeAttr(field.name);
    const label = escapeHtml(field.label);
    const req = field.required === false ? '' : ' required';

    if (field.type === 'select' && field.options) {
        const opts = field.options.map(o =>
            `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`
        ).join('');
        return `<div class="lead-field">
  <label for="${id}">${label}</label>
  <select id="${id}" name="${id}"${req}>
    <option value="">Select...</option>
    ${opts}
  </select>
</div>`;
    }

    return `<div class="lead-field">
  <label for="${id}">${label}</label>
  <input type="${field.type}" id="${id}" name="${id}" placeholder="${label}"${req}>
</div>`;
}

function buildLeadFormScript(config: LeadGenConfig): string {
    const endpoint = JSON.stringify(config.endpoint);
    const successMsg = JSON.stringify(config.successMessage);

    return `<script>
(function() {
  var form = document.getElementById('lead-form');
  if (!form) return;
  var consent = document.getElementById('lead-consent');
  var submitBtn = form.querySelector('button[type="submit"]');
  var msgEl = document.getElementById('lead-form-message');

  if (consent && submitBtn) {
    submitBtn.disabled = !consent.checked;
    consent.addEventListener('change', function() {
      submitBtn.disabled = !consent.checked;
    });
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (consent && !consent.checked) return;
    // Honeypot check — silently reject bot submissions
    var hp = document.getElementById('lead_hp_field');
    if (hp && hp.value) { msgEl.textContent = 'Thank you!'; msgEl.className = 'success-msg'; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    msgEl.textContent = '';
    msgEl.className = '';

    var data = new FormData(form);
    var body = {};
    data.forEach(function(val, key) { body[key] = val; });

    fetch(${endpoint}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(res) {
      if (res.ok) {
        msgEl.textContent = ${successMsg};
        msgEl.className = 'success-msg';
        form.reset();
        submitBtn.textContent = 'Submitted';
      } else {
        throw new Error('Submission failed');
      }
    }).catch(function() {
      msgEl.textContent = 'Something went wrong. Please try again.';
      msgEl.className = 'error-msg';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    });
  });
})();
</script>`;
}

export async function generateLeadCapturePage(
    article: Article,
    domain: string,
    disclosure: DisclosureInfo | null | undefined,
    datasets: ArticleDatasetInfo[],
): Promise<string> {
    const config = article.leadGenConfig as LeadGenConfig | null;
    const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(datasets);
    const schemaLd = buildSchemaJsonLd(article, domain, 'Article');

    // FTC-required above-fold disclosure
    let aboveFoldHtml = '';
    if (config?.disclosureAboveFold) {
        aboveFoldHtml = `<div class="disclosure-above">${escapeHtml(config.disclosureAboveFold)}</div>`;
    }

    // Block non-HTTPS endpoints — PII must not transmit unencrypted
    if (config?.endpoint && !config.endpoint.startsWith('https://')) {
        console.error(`[lead-capture] BLOCKED: Endpoint is not HTTPS: ${config.endpoint}. Lead forms require HTTPS to protect user data.`);
        // Null out the endpoint so the form won't submit to an insecure URL
        config.endpoint = '';
    }

    // Lead gen form
    let formHtml = '';
    if (config && config.fields.length > 0) {
        const fieldsHtml = config.fields.map(buildFormField).join('\n');
        const consentHtml = config.consentText
            ? `<div class="consent">
  <label><input type="checkbox" id="lead-consent" required> ${escapeHtml(config.consentText)}</label>
</div>`
            : '';

        const privacyHtml = config.privacyPolicyUrl
            ? `<p class="privacy-link"><a href="${escapeAttr(config.privacyPolicyUrl)}" target="_blank" rel="noopener">Privacy Policy</a></p>`
            : '';

        // Honeypot field — hidden from real users, bots fill it triggering rejection
        const honeypotHtml = `<div style="position:absolute;left:-9999px" aria-hidden="true">
  <label for="lead_hp_field">Leave blank</label>
  <input type="text" id="lead_hp_field" name="lead_hp_field" tabindex="-1" autocomplete="off">
</div>`;

        formHtml = `
<section class="lead-form-section">
  <!-- Required disclosures: This form collects personal information subject to applicable privacy laws. -->
  <form id="lead-form" class="lead-form" action="${config.endpoint ? escapeAttr(config.endpoint) : '#'}" method="POST">
    ${honeypotHtml}
    ${fieldsHtml}
    ${consentHtml}
    ${privacyHtml}
    <button type="submit" disabled>Submit</button>
    <div id="lead-form-message"></div>
  </form>
</section>`;
    }

    const titleHtml = escapeHtml(article.title);

    const body = `${disclaimerHtml}
  ${aboveFoldHtml}
  ${schemaLd}
  <article>
    <h1>${titleHtml}</h1>
    ${formHtml}
    <Fragment set:html={${JSON.stringify(contentHtml)}} />
  </article>
  ${dataSourcesHtml}
  ${trustHtml}
  ${config ? buildLeadFormScript(config) : ''}`;

    return wrapInAstroLayout(article.title, article.metaDescription || '', body);
}
