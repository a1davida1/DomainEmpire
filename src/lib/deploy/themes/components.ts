/**
 * Component CSS styles shared across all themes.
 * Covers interactive components: calculators, comparisons, lead forms, FAQs, cost guides, etc.
 */
export const componentStyles = `
/* Trust elements */
.disclaimer{background:var(--color-warning-light,#fef3c7);border:1px solid var(--color-warning,#f59e0b);padding:1rem;border-radius:var(--radius-md,.5rem);margin-bottom:1.5rem;font-size:0.9rem}
.disclosure{background:var(--color-bg-surface);padding:0.75rem;border-radius:var(--radius-sm);margin:1rem 0}
.sources{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--color-border)}
.sources ol{padding-left:1.5rem}.sources li{margin-bottom:0.5rem;font-size:0.875rem}
.reviewed-by,.last-updated{color:var(--color-text-muted);font-size:0.875rem;margin-top:0.5rem}

/* Calculator components — BusyBusy-style split layout */
.calculator-section{margin:2.5rem 0}
.calculator-section h2{margin-bottom:1.5rem;font-size:clamp(1.5rem,3vw,2rem)}

/* Split layout: inputs left, results right */
.calc-split{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:2.5rem;
  align-items:start;
}
@media(max-width:768px){.calc-split{grid-template-columns:1fr;gap:1.5rem}}

/* Inputs panel */
.calc-inputs{}
.calc-form{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);padding:2rem;margin:2rem 0}
.calc-field{margin-bottom:1.25rem}
.calc-field label{display:block;font-weight:600;margin-bottom:0.5rem;font-size:0.9rem;color:var(--color-text)}

/* Input group with unit suffix/prefix */
.calc-input-group{display:flex;align-items:center;border:var(--border-width,1px) solid var(--color-border-strong);border-radius:var(--radius-md);overflow:hidden;background:var(--color-bg);transition:border-color .15s}
.calc-input-group:focus-within{border-color:var(--color-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}
.calc-input-group .calc-input{border:none;outline:none;box-shadow:none;flex:1;padding:0.75rem;font-size:1.1rem;background:transparent}
.calc-input-group .calc-input:focus{box-shadow:none}
.calc-unit{padding:0.75rem 0.875rem;font-size:0.9rem;font-weight:600;color:var(--color-text-muted);background:var(--color-bg-surface);white-space:nowrap;user-select:none}
.calc-unit--prefix{border-right:1px solid var(--color-border)}
.calc-unit:not(.calc-unit--prefix){border-left:1px solid var(--color-border)}

/* Standalone input (no unit group) */
.calc-field > .calc-input{width:100%;padding:0.75rem;border:var(--border-width,1px) solid var(--color-border-strong);border-radius:var(--radius-md);font-size:1.1rem;background:var(--color-bg);color:var(--color-text);transition:border-color .15s}
.calc-field > .calc-input:focus{border-color:var(--color-accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}

/* Range input polish */
.calc-range{-webkit-appearance:none;height:6px;border-radius:3px;background:var(--color-border);outline:none}
.calc-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:var(--color-accent);cursor:pointer;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.15)}

/* Results panel */
.calc-results{background:var(--color-bg-surface);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg);padding:1.5rem;position:sticky;top:5rem}
.calc-results-heading{font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:1rem}

/* Result cards — BusyBusy style with colored left border */
.calc-result-card{
  background:var(--color-bg);
  border:var(--border-width,1px) solid var(--color-border);
  border-left:4px solid var(--color-accent);
  border-radius:var(--radius-md,.5rem);
  padding:1.25rem 1.5rem;
  margin-bottom:0.75rem;
  transition:box-shadow .15s;
}
.calc-result-card:hover{box-shadow:0 2px 12px rgba(0,0,0,.06)}
.calc-result-label{display:block;font-size:0.85rem;font-weight:600;color:var(--color-text-muted);margin-bottom:0.375rem;text-transform:uppercase;letter-spacing:0.03em}
.calc-result-value{display:block;font-size:clamp(1.5rem,3vw,2.25rem);font-weight:800;color:var(--color-text);letter-spacing:-0.02em}

/* Legacy result items (backwards compat) */
.calc-result-item{display:flex;justify-content:space-between;align-items:center;padding:0.625rem 0;border-bottom:1px solid var(--color-border)}
.calc-result-item:last-child{border-bottom:none}
.calc-result-item .calc-result-label{font-weight:500;color:var(--color-text-muted);text-transform:none;letter-spacing:0;margin:0;display:inline}
.calc-result-item .calc-result-value{font-size:1.25rem;font-weight:700;color:var(--color-accent);display:inline}

/* Calculate button */
.calc-button{display:block;width:100%;margin-top:1.25rem;padding:0.875rem 1.5rem;background:var(--color-primary);color:var(--color-hero-text,#fff);border:none;border-radius:var(--radius-md);font-size:1.1rem;font-weight:700;cursor:pointer;transition:background .15s,transform .1s;letter-spacing:0.01em}
.calc-button:hover{background:var(--color-primary-hover,var(--color-primary));transform:translateY(-1px)}
.calc-button:active{transform:translateY(0)}

.calc-methodology{margin-top:1.5rem;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);overflow:hidden}
.calc-methodology summary{padding:0.75rem 1rem;cursor:pointer;font-weight:600;background:var(--color-bg-surface);font-size:0.9rem}
.calc-methodology ul,.calc-methodology p{padding:1rem;font-size:0.9rem;color:var(--color-text-muted)}

/* Calculator download gate — email capture for results */
.calc-download-gate{margin-top:1.5rem;padding:1.25rem;border:2px solid var(--color-accent);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--color-accent) 5%,var(--color-bg))}
.calc-download-cta{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem}
.calc-download-icon{font-size:1.5rem}
.calc-download-cta strong{display:block;font-size:1rem;color:var(--color-text)}
.calc-download-cta p{font-size:0.85rem;color:var(--color-text-muted);margin:0.15rem 0 0}
.calc-gate-form{display:flex;gap:0.5rem}
.calc-gate-email{flex:1;padding:0.6rem 0.75rem;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);font-size:0.9rem;background:var(--color-bg);color:var(--color-text)}
.calc-gate-email:focus{border-color:var(--color-accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}
.calc-gate-btn{padding:0.6rem 1.25rem;background:var(--color-accent);color:#fff;border:none;border-radius:var(--radius-md);font-weight:600;font-size:0.9rem;cursor:pointer;white-space:nowrap;transition:background .15s}
.calc-gate-btn:hover{background:var(--color-accent-hover,var(--color-accent))}
.calc-gate-btn:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
.calc-gate-success{padding:0.75rem;text-align:center;font-weight:600;color:var(--color-success)}
.calc-gate-error{padding:0.75rem;text-align:center;font-weight:600;color:var(--color-danger,#c0392b)}
@media(max-width:600px){.calc-gate-form{flex-direction:column}.calc-gate-btn{width:100%}}

/* Amortization schedule table — BusyBusy style */
.amort-section{margin-top:3rem}
.amort-heading{font-size:1.35rem;font-weight:700;margin-bottom:1rem;text-align:center}
.amort-toolbar{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap}
.amort-dl-btn{display:inline-flex;align-items:center;gap:0.375rem;padding:0.5rem 1.25rem;border:none;border-radius:var(--radius-md,.375rem);font-size:0.875rem;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s}
.amort-dl-excel{background:var(--color-success,#16a34a);color:#fff}
.amort-dl-excel:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(22,163,74,.3)}
.amort-dl-csv{background:var(--color-error,#dc2626);color:#fff}
.amort-dl-csv:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(220,38,38,.3)}
.amort-page-limit{margin-left:auto;font-size:0.85rem;font-weight:500;color:var(--color-text-muted);display:flex;align-items:center;gap:0.5rem}
.amort-page-limit select{padding:0.375rem 0.5rem;border:1px solid var(--color-border-strong);border-radius:var(--radius-sm,.25rem);font-size:0.85rem;background:var(--color-bg)}
.amort-table-wrap{overflow-x:auto;border:1px solid var(--color-border);border-radius:var(--radius-md,.5rem)}
.amort-table{width:100%;border-collapse:collapse;font-size:0.875rem}
.amort-table th{background:var(--color-primary,#1e293b);color:#fff;padding:0.75rem 1rem;text-align:right;font-weight:600;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.03em;white-space:nowrap}
.amort-table th:first-child{text-align:center}
.amort-table td{padding:0.625rem 1rem;text-align:right;border-bottom:1px solid var(--color-border)}
.amort-table td:first-child{text-align:center;font-weight:600;color:var(--color-accent)}
.amort-table tr:nth-child(even){background:var(--color-bg-surface,#f8fafc)}
.amort-table tr:hover{background:color-mix(in srgb,var(--color-accent) 5%,var(--color-bg-surface,#f8fafc))}
.amort-table td:nth-child(3){color:var(--color-error,#dc2626)}
.amort-table td:nth-child(4){color:var(--color-success,#16a34a)}
.amort-pagination{display:flex;gap:0.25rem;justify-content:center;margin-top:1rem;flex-wrap:wrap}
.amort-page-btn{background:var(--color-bg-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm,.25rem);padding:0.375rem 0.75rem;font-size:0.8rem;cursor:pointer;transition:all .1s}
.amort-page-btn:hover{border-color:var(--color-accent);color:var(--color-accent)}
.amort-page-btn:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
.amort-page-btn.active{background:var(--color-accent);color:#fff;border-color:var(--color-accent)}
.amort-dl-btn:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}

/* Calculator breakdown line items */
.calc-breakdown{margin-top:1.25rem;border-top:1px solid var(--color-border);padding-top:1rem}
.calc-breakdown-row{display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;font-size:0.9rem;border-bottom:1px solid color-mix(in srgb,var(--color-border) 50%,transparent)}
.calc-breakdown-row span:first-child{color:var(--color-text-muted);font-size:0.85rem}
.calc-breakdown-row span:last-child{font-weight:600;color:var(--color-text);font-size:0.95rem}
.calc-breakdown-total{border-bottom:none;border-top:2px solid var(--color-border);margin-top:0.25rem;padding-top:0.625rem}
.calc-breakdown-total span:first-child{font-weight:700;color:var(--color-text);font-size:0.95rem}
.calc-breakdown-total span:last-child{font-weight:800;font-size:1.1rem;color:var(--color-accent)}

/* Amortization chart */
.amort-chart-wrap{position:relative;width:100%;height:320px;margin-bottom:2rem;background:var(--color-bg);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,.75rem);padding:1rem}
.amort-subheading{font-size:0.9rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-muted);margin:0 0 0.75rem}

/* ResourceGrid — BusyBusy-style "More Resources" icon card grid */
.resource-grid-section{margin:3rem 0}
.resource-grid-banner{background:var(--color-accent);color:#fff;padding:0.875rem 2rem;text-align:center;margin-bottom:2rem}
.resource-grid-banner h2{margin:0;font-size:1.1rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em}
.resource-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1.25rem}
.resource-card{
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  background:var(--color-bg);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.75rem 1.25rem;
  text-decoration:none;
  color:var(--color-text);
  transition:box-shadow .2s,transform .15s;
}
.resource-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08);transform:translateY(-3px)}
.resource-icon{font-size:2rem;margin-bottom:0.75rem;display:block}
.resource-title{font-size:0.95rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin:0 0 0.5rem;color:var(--color-text)}
.resource-desc{font-size:0.8rem;line-height:1.5;color:var(--color-text-muted);margin:0}
@media(max-width:640px){.resource-grid{grid-template-columns:repeat(2,1fr)}}

/* LatestArticles — card grid with image + title + excerpt */
.latest-articles-section{margin:3rem 0}
.latest-articles-banner{margin-bottom:1.5rem;border-left:4px solid var(--color-accent);padding-left:1rem}
.latest-articles-banner h2{margin:0;font-size:1.25rem;font-weight:800;text-transform:uppercase;letter-spacing:0.03em}
.latest-articles-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem}
.article-card{
  display:flex;
  flex-direction:column;
  background:var(--color-bg);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  overflow:hidden;
  text-decoration:none;
  color:var(--color-text);
  transition:box-shadow .2s,transform .15s;
}
.article-card:hover{box-shadow:0 8px 24px rgba(0,0,0,.1);transform:translateY(-3px)}
.article-card-img{height:180px;background-color:var(--color-bg-surface);background-size:cover;background-position:center}
.article-card-img--placeholder{background:linear-gradient(135deg,var(--color-bg-surface) 0%,var(--color-border) 100%)}
.article-card-body{padding:1.25rem}
.article-card-title{font-size:0.95rem;font-weight:800;text-transform:uppercase;letter-spacing:0.02em;line-height:1.3;margin:0 0 0.625rem;color:var(--color-text)}
.article-card-excerpt{font-size:0.85rem;line-height:1.6;color:var(--color-text-muted);margin:0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
@media(max-width:640px){.latest-articles-grid{grid-template-columns:1fr}}

/* Comparison components */
.comparison-table-wrapper{overflow-x:auto;margin:2rem 0}
.comparison-table{width:100%;border-collapse:collapse;font-size:0.9rem}
.comparison-table th{background:var(--color-bg-surface);padding:0.75rem;text-align:left;border-bottom:2px solid var(--color-border);white-space:nowrap;color:var(--color-text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em}
.comparison-table th[data-sort-key]{cursor:pointer;user-select:none}
.comparison-table th[data-sort-key]:hover{background:var(--color-border)}
.sort-indicator{color:var(--color-text-muted);margin-left:0.25rem}
.comparison-table td{padding:0.75rem;border-bottom:1px solid var(--color-border)}
.comparison-table tr:nth-child(even){background:var(--color-bg-surface,#f8fafc)}
.comparison-table tr:hover{background:color-mix(in srgb,var(--color-accent,#2563eb) 5%,var(--color-bg-surface,#f8fafc))}
.comparison-badge{background:var(--color-success);color:white;padding:0.125rem 0.5rem;border-radius:var(--radius-full);font-size:0.75rem;font-weight:600}
.comparison-winner{background:color-mix(in srgb,var(--color-success,#22c55e) 8%,var(--color-bg,#fff))!important;border-left:3px solid var(--color-success,#22c55e)}
.comparison-winner td:first-child{font-weight:700}
.comparison-crown{font-size:0.9rem}
.comparison-stars{color:var(--color-warning,#f59e0b);letter-spacing:0.03em}
.comparison-verdict{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-success);border-radius:var(--radius-md);padding:1.25rem;margin:1.5rem 0;display:flex;align-items:flex-start;gap:0.75rem}
.verdict-icon{font-size:1.25rem;flex-shrink:0;line-height:1.3}
/* CTA section + button */
.cta-section{padding:2.5rem 0;margin:2rem 0}
.cta-section .site-container{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap}
.cta-section--bar{background:var(--color-primary,#1e293b);color:#fff;border-radius:var(--radius-lg,.75rem);padding:2rem 2.5rem}
.cta-section--bar .cta-button{background:#fff;color:var(--color-primary,#1e293b)}
.cta-section--gradient{background:linear-gradient(135deg,var(--color-primary),var(--color-accent));color:#fff;border-radius:var(--radius-lg,.75rem);padding:2rem 2.5rem}
.cta-section--gradient .cta-button{background:#fff;color:var(--color-primary,#1e293b)}
.cta-section--card{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:2rem 2.5rem}
.cta-section--minimal{border-top:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-bottom:var(--border-width,1px) solid var(--color-border,#e2e8f0)}
.cta-content{flex:1;min-width:200px}
.cta-text{font-size:1.15rem;font-weight:600;margin:0;line-height:1.4}
.cta-subtext{font-size:0.9rem;opacity:0.85;margin:0.375rem 0 0;font-weight:400}
.cta-icon{font-size:1.3rem;vertical-align:middle;margin-right:0.25rem}
.cta-button{display:inline-block;background:var(--color-accent,#2563eb);color:#fff;padding:0.75rem 1.75rem;border-radius:var(--radius-md,.5rem);font-weight:600;font-size:0.95rem;text-decoration:none;white-space:nowrap;transition:transform .15s,box-shadow .15s;border:none;cursor:pointer}
.cta-button:hover{transform:translateY(-1px);box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.15));color:#fff}
.cta-button:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 40%,transparent);transform:translateY(-1px)}
@media(max-width:640px){.cta-section .site-container{flex-direction:column;text-align:center}.cta-button{width:100%;text-align:center}}

/* Lead form components — BusyBusy quality */
.lead-section{margin:2.5rem 0}
.lead-heading{font-size:clamp(1.5rem,3vw,2rem);font-weight:800;text-align:center;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:0.5rem;color:var(--color-text)}
.lead-subheading{text-align:center;color:var(--color-text-muted);font-size:0.95rem;margin-bottom:1.5rem;max-width:500px;margin-left:auto;margin-right:auto}
.disclosure-above{background:var(--color-warning-light,#fef3c7);border:2px solid var(--color-warning,#f59e0b);padding:1rem;border-radius:var(--radius-md,.5rem);margin-bottom:1.5rem;font-weight:600}
.lead-form{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);padding:2rem;margin:1.5rem auto;max-width:560px}
.lead-field{margin-bottom:0.875rem}
.lead-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem;color:var(--color-text)}
.lead-field input,.lead-field select{width:100%;padding:0.8rem 1rem;border:var(--border-width,1px) solid var(--color-border-strong);border-radius:var(--radius-md);font-size:1rem;background:var(--color-bg);color:var(--color-text);transition:border-color .15s}
.lead-field input::placeholder{color:var(--color-text-muted);font-weight:400}
.lead-field input:focus,.lead-field select:focus{border-color:var(--color-accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}
/* Two-column field row for First/Last name pairs */
.lead-field-row{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.875rem}
@media(max-width:480px){.lead-field-row{grid-template-columns:1fr}}
.lead-field--half{margin-bottom:0}
.consent{margin:1rem 0;font-size:0.8rem;color:var(--color-text-muted);line-height:1.5}
.consent label{display:flex;align-items:flex-start;gap:0.5rem}
.consent a{color:var(--color-accent);text-decoration:underline}
.lead-form button[type="submit"]{width:100%;background:var(--color-accent);color:white;padding:1rem 2rem;border:none;border-radius:var(--radius-md);font-size:1.1rem;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;transition:transform .15s,box-shadow .2s;box-shadow:0 2px 8px rgba(0,0,0,.08);margin-top:0.5rem}
.lead-form button[type="submit"]:disabled{opacity:0.5;cursor:not-allowed}
.lead-form button[type="submit"]:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.15)}
.lead-form button[type="submit"]:focus-visible:not(:disabled){outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 40%,transparent);transform:translateY(-2px)}
.lead-trust{text-align:center;font-size:0.78rem;color:var(--color-text-muted,#64748b);margin:0.75rem 0 0;font-weight:400}
.btn-lock{font-size:0.9rem;margin-right:0.25rem}
.success-msg{color:var(--color-success);font-weight:600;margin-top:0.75rem;text-align:center;font-size:1.1rem;padding:1.5rem;background:var(--color-success-light,#dcfce7);border-radius:var(--radius-md,.5rem)}
.success-icon{display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:var(--radius-full,999px);background:var(--color-success,#22c55e);color:#fff;font-size:1.25rem;font-weight:700;margin-bottom:0.5rem}
.success-msg strong{display:block;margin-top:0.5rem}
.error-msg{color:var(--color-error);font-weight:600;margin-top:0.75rem;text-align:center;padding:0.75rem;background:var(--color-error-light,#fef2f2);border-radius:var(--radius-md,.5rem)}

/* FAQ components — premium accordion style */
.faq-section h2{margin-bottom:1.5rem;font-size:clamp(1.5rem,3vw,2rem)}
.faq-list{margin:2rem 0}
.faq-item{border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,.75rem);margin-bottom:0.75rem;overflow:hidden;transition:border-color .2s,box-shadow .2s}
.faq-item[open]{border-color:var(--color-accent);box-shadow:0 2px 12px rgba(0,0,0,.05)}
.faq-question{padding:1.125rem 1.5rem;cursor:pointer;font-weight:600;font-size:1.025rem;background:var(--color-bg);list-style:none;color:var(--color-text);transition:background .15s;display:flex;align-items:center;gap:0.75rem}
.faq-question:hover{background:var(--color-bg-surface)}
.faq-question:focus-visible{outline:2px solid var(--color-accent);outline-offset:-2px;background:var(--color-bg-surface)}
.faq-question::-webkit-details-marker{display:none}
.faq-question::before{content:'';display:inline-block;width:0.5rem;height:0.5rem;border-right:2px solid var(--color-accent);border-bottom:2px solid var(--color-accent);transform:rotate(-45deg);transition:transform 0.2s;flex-shrink:0}
.faq-item[open] .faq-question::before{transform:rotate(45deg)}
.faq-answer{padding:1.25rem 1.5rem;border-top:1px solid var(--color-border);color:var(--color-text-muted);line-height:1.7;font-size:0.95rem}

/* Cost guide components */
.cost-section{margin:2rem 0}
.cost-ranges{margin:1.5rem 0}
.cost-range{background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1.5rem;margin-bottom:1rem;transition:box-shadow .15s}
.cost-range:hover{box-shadow:var(--shadow-sm)}
.cost-range-label{font-size:1rem;margin-bottom:0.75rem}
.cost-range-bar{display:flex;flex-direction:column;gap:0.75rem}
.cost-tier{display:grid;grid-template-columns:5rem 1fr auto;gap:0.75rem;align-items:center}
.cost-label{font-size:0.78rem;color:var(--color-text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.03em}
.cost-bar-track{height:8px;background:var(--color-bg-surface,#e2e8f0);border-radius:999px;overflow:hidden}
.cost-bar-fill{height:100%;border-radius:999px;transition:width .6s ease}
.cost-bar--low{background:var(--color-success,#22c55e)}
.cost-bar--avg{background:var(--color-accent,#2563eb)}
.cost-bar--high{background:var(--color-error,#ef4444)}
.cost-value{font-size:1.1rem;font-weight:700;color:var(--color-text);white-space:nowrap}
.cost-value--highlight{color:var(--color-accent,#2563eb);font-size:1.2rem}
.factors-grid{margin:2rem 0}
.factors-heading{font-size:1.1rem;margin-bottom:1rem}
.factors-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem}
.factor-card{padding:1.25rem;border-radius:var(--radius-md,.5rem);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);background:var(--color-bg);transition:box-shadow .15s,transform .15s}
.factor-card:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px)}
.factor-header{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.5rem}
.factor-card h4{margin:0;font-size:0.95rem}
.factor-impact{font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;white-space:nowrap}
.factor-card p{margin:0;font-size:0.88rem;color:var(--color-text-muted);line-height:1.5}
.impact-high{border-left:3px solid var(--color-error,#ef4444)}
.impact-medium{border-left:3px solid var(--color-warning,#f59e0b)}
.impact-low{border-left:3px solid var(--color-success,#22c55e)}
.impact-high .factor-impact{color:var(--color-error)}.impact-medium .factor-impact{color:var(--color-warning)}.impact-low .factor-impact{color:var(--color-success)}
@media(max-width:640px){.cost-tier{grid-template-columns:4rem 1fr auto}}

/* Data sources */
.data-sources{margin-top:2.5rem;padding:1.5rem;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-surface)}
.data-sources h2{font-size:1rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);margin-bottom:0.75rem}
.citation-list{list-style:none;padding:0;margin:0;counter-reset:citation}
.data-source-item{padding:0.625rem 0;font-size:0.875rem;border-bottom:1px solid var(--color-border);display:flex;align-items:flex-start;gap:0.5rem}
.data-source-item:last-child{border-bottom:none}
.citation-num{font-size:0.75rem;font-weight:700;color:var(--color-accent,#2563eb);flex-shrink:0;min-width:1.75rem}
.citation-detail{flex:1;min-width:0}
.citation-detail a{color:var(--color-link);font-weight:500}
.citation-ext{font-size:0.7rem;vertical-align:super;opacity:0.6}
.citation-publisher{display:inline-block;font-size:0.8rem;color:var(--color-text-muted);margin-left:0.375rem}
.citation-publisher::before{content:'— '}
.citation-date{display:inline-block;font-size:0.78rem;color:var(--color-text-muted);margin-left:0.375rem;font-style:italic}
.data-usage{display:block;font-size:0.8rem;color:var(--color-text-muted);font-style:italic;margin-top:0.125rem}

/* Wizard components */
.wizard-container{margin:2rem 0}
.wizard-progress{display:flex;gap:0;margin-bottom:2rem;overflow-x:auto;counter-reset:wiz-step}
.wizard-progress-segment{flex:1;text-align:center;padding:0.5rem 0.25rem;position:relative;opacity:0.4;transition:opacity 0.25s}
.wizard-progress-segment::after{content:'';position:absolute;top:1rem;left:calc(50% + 1.125rem);right:calc(-50% + 1.125rem);height:2px;background:var(--color-border);z-index:0}
.wizard-progress-segment:last-child::after{display:none}
.wizard-progress-segment.active{opacity:1}
.wizard-progress-segment.active::after{background:var(--color-accent)}
.wizard-progress-segment.completed .wizard-progress-dot{background:var(--color-success,#22c55e);color:#fff;border-color:var(--color-success,#22c55e)}
.wizard-progress-segment.completed .wizard-progress-dot::after{content:'✓';position:absolute;font-size:0.85rem}
.wizard-progress-segment.completed .wizard-progress-dot span{visibility:hidden}
.wizard-progress-segment.current .wizard-progress-dot{background:var(--color-accent);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 25%,transparent)}
.wizard-progress-dot{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:var(--color-border);font-size:0.8rem;font-weight:700;margin-bottom:0.25rem;position:relative;z-index:1;border:2px solid var(--color-border);transition:all 0.25s}
.wizard-progress-label{display:block;font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wizard-progress-segment.active .wizard-progress-label{color:var(--color-text);font-weight:600}
.wizard-progress-segment.completed .wizard-progress-label{color:var(--color-success,#22c55e)}
.wizard-step{background:var(--color-bg-surface);border:1px solid var(--color-border);border-radius:0.75rem;padding:1.5rem}
.wizard-step-title{font-size:1.25rem;margin-bottom:0.5rem}
.wizard-step-desc{color:var(--color-text-muted);margin-bottom:1rem}
.wizard-field{margin-bottom:1rem}
.wizard-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem}
.wizard-field input[type="text"],.wizard-field input[type="number"],.wizard-field select{width:100%;padding:0.5rem;border:1px solid var(--color-border-strong);border-radius:0.375rem;font-size:1rem}
.wizard-radio,.wizard-checkbox{display:flex;align-items:center;gap:0.5rem;padding:0.625rem 1rem;border:1px solid var(--color-border);border-radius:0.5rem;margin-bottom:0.375rem;cursor:pointer;transition:border-color 0.15s,background 0.15s}
.wizard-radio:hover,.wizard-checkbox:hover{border-color:var(--color-accent);background:var(--color-bg-surface)}
.wizard-radio input:checked+span,.wizard-checkbox input:checked+span{font-weight:600;color:var(--color-accent)}
.wizard-nav{display:flex;justify-content:space-between;margin-top:1.5rem}
.wizard-back{background:var(--color-bg-surface);color:var(--color-text-muted);border:1px solid var(--color-border);padding:0.625rem 1.5rem;border-radius:0.375rem;font-weight:600;cursor:pointer}
.wizard-back:hover{background:var(--color-border)}
.wizard-next{background:var(--color-accent);color:white;border:none;padding:0.625rem 1.5rem;border-radius:0.375rem;font-weight:600;cursor:pointer}
.wizard-next:hover{background:var(--color-accent-hover)}
.wizard-results{margin-top:1rem}
.wizard-results-title{font-size:1.5rem;margin-bottom:1rem;text-align:center}
.wizard-result-card{background:var(--color-bg-surface);border:1px solid var(--color-border);border-radius:0.75rem;padding:1.25rem;margin-bottom:1rem}
.wizard-result-card.result-eligibility{border-left:4px solid var(--color-success)}
.wizard-result-card.result-recommendation{border-left:4px solid var(--color-accent)}
.wizard-result-card.result-score{border-left:4px solid var(--color-warning)}
.wizard-result-card h4{font-size:1.1rem;margin-bottom:0.5rem}
.wizard-result-card p{color:var(--color-text-muted);margin-bottom:0.75rem}
.wizard-restart{display:block;margin:1.5rem auto 0;background:var(--color-bg-surface);color:var(--color-text-muted);border:1px solid var(--color-border);padding:0.5rem 1.5rem;border-radius:0.375rem;cursor:pointer}
.wizard-restart:hover{background:var(--color-border)}
.wizard-lead-form{background:var(--color-bg-surface);border:1px solid var(--color-border);border-radius:0.75rem;padding:1.5rem;margin-top:1.5rem}
.wizard-lead-form h4{margin-bottom:1rem}
.wizard-shake{animation:shake 0.4s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.wizard-answer-summary{margin-top:1rem;background:var(--color-bg-surface);border:1px solid var(--color-border);border-radius:0.75rem;padding:1rem}
.wizard-answer-summary h4{margin-bottom:0.5rem}
.wizard-answer-list{margin:0;padding-left:1.1rem}
.wizard-answer-list li{margin-bottom:0.35rem;color:var(--color-text-muted)}
.wizard-quiz-score{margin-bottom:1rem;padding:0.875rem 1rem;border-radius:0.75rem;background:var(--color-bg-surface);border:1px solid var(--color-border);font-weight:700;color:var(--color-accent);text-align:center}
.wizard-score-detail{display:block;margin-top:0.25rem;font-size:0.82rem;font-weight:500;color:var(--color-text-muted)}

/* Wizard mode variants */
.wizard-container[data-wizard-mode="configurator"] .wizard-step{background:var(--color-bg-surface);border-color:var(--color-border-strong)}
.wizard-container[data-wizard-mode="configurator"] .wizard-next{background:var(--color-accent)}
.wizard-container[data-wizard-mode="configurator"] .wizard-next:hover{background:var(--color-accent-hover)}
.wizard-container[data-wizard-mode="configurator"] .wizard-result-card{background:var(--color-bg-surface);border-color:var(--color-success)}

.wizard-container[data-wizard-mode="quiz"] .wizard-step{background:var(--color-bg-surface);border-color:var(--color-warning)}
.wizard-container[data-wizard-mode="quiz"] .wizard-progress-dot{background:var(--color-warning)}
.wizard-container[data-wizard-mode="quiz"] .wizard-progress-segment.current .wizard-progress-dot{background:var(--color-error)}
.wizard-container[data-wizard-mode="quiz"] .wizard-next{background:var(--color-error)}
.wizard-container[data-wizard-mode="quiz"] .wizard-next:hover{background:var(--color-error-hover)}
.wizard-container[data-wizard-mode="quiz"] .wizard-result-card{background:var(--color-bg-surface);border-color:var(--color-error)}

.wizard-container[data-wizard-mode="survey"] .wizard-step{background:var(--color-bg-surface);border-color:var(--color-success)}
.wizard-container[data-wizard-mode="survey"] .wizard-next{background:var(--color-success)}
.wizard-container[data-wizard-mode="survey"] .wizard-next:hover{background:var(--color-success-hover)}
.wizard-container[data-wizard-mode="survey"] .wizard-result-card{background:var(--color-bg-surface);border-color:var(--color-success)}

.wizard-container[data-wizard-mode="assessment"] .wizard-step{background:var(--color-bg-surface);border-color:var(--color-warning)}
.wizard-container[data-wizard-mode="assessment"] .wizard-next{background:var(--color-warning)}
.wizard-container[data-wizard-mode="assessment"] .wizard-next:hover{background:var(--color-warning-hover)}
.wizard-container[data-wizard-mode="assessment"] .wizard-result-card{background:var(--color-bg-surface);border-color:var(--color-warning)}

/* Freshness badges */
.freshness-badge{display:inline-flex;align-items:center;gap:0.375rem;font-size:0.8rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:1rem;margin-bottom:1rem}
.freshness-dot{width:0.5rem;height:0.5rem;border-radius:50%;display:inline-block}
.freshness-green{background:var(--color-success-light);color:var(--color-success);border:1px solid var(--color-success)}
.freshness-green .freshness-dot{background:var(--color-success)}
.freshness-yellow{background:var(--color-warning-light);color:var(--color-warning);border:1px solid var(--color-warning)}
.freshness-yellow .freshness-dot{background:var(--color-warning)}
.freshness-red{background:var(--color-error-light);color:var(--color-error);border:1px solid var(--color-error)}
.freshness-red .freshness-dot{background:var(--color-error)}

/* Print button */
.print-btn{background:var(--color-bg-surface,#f1f5f9);color:var(--color-text-muted,#475569);border:1px solid var(--color-border,#e2e8f0);padding:0.375rem 1rem;border-radius:var(--radius-md,.375rem);font-size:0.85rem;cursor:pointer;float:right;margin-bottom:1rem;transition:background var(--transition-speed,.2s)}
.print-btn:hover{background:var(--color-border,#e2e8f0)}

/* Scroll-triggered CTA */
.scroll-cta{position:fixed;bottom:0;left:0;right:0;z-index:100;transform:translateY(100%);transition:transform 0.3s ease;pointer-events:none}
.scroll-cta-visible{transform:translateY(0);pointer-events:auto}
.scroll-cta-inner{display:flex;align-items:center;justify-content:center;gap:1rem;padding:1rem 1.5rem;max-width:1100px;margin:0 auto}
.scroll-cta-bar{background:var(--color-primary,#1e293b);color:var(--color-badge-text,#f8fafc)}
.scroll-cta-card{background:var(--color-bg,#fff);border-top:2px solid var(--color-accent,#2563eb);box-shadow:0 -4px 16px rgba(0,0,0,0.12)}
.scroll-cta-card .scroll-cta-text{color:var(--color-text)}
.scroll-cta-banner{background:linear-gradient(135deg,var(--color-primary),var(--color-accent));color:#fff}
.scroll-cta-text{font-weight:500;font-size:0.95rem;flex:1}
.scroll-cta-btn{display:inline-block;background:var(--color-accent,#2563eb);color:#fff;padding:0.625rem 1.5rem;border-radius:var(--radius-md,.375rem);font-weight:600;text-decoration:none;white-space:nowrap;font-size:0.9rem;transition:transform var(--transition-speed,.15s)}
.scroll-cta-btn:hover{transform:translateY(-1px);color:#fff}
.scroll-cta-bar .scroll-cta-btn{background:#fff;color:var(--color-primary)}
.scroll-cta-bar .scroll-cta-btn:hover{opacity:0.9}
.scroll-cta-dismiss{background:none;border:none;color:inherit;font-size:1.5rem;cursor:pointer;padding:0 0.25rem;opacity:0.6;line-height:1}
.scroll-cta-dismiss:hover{opacity:1}
@media(max-width:640px){.scroll-cta-inner{flex-direction:column;gap:0.5rem;text-align:center}}

/* Geo-adaptive content */
.geo-adaptive{margin:1.5rem 0}
.geo-block{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);padding:1rem;margin-bottom:0.5rem}
.geo-label{display:inline-block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);margin-bottom:0.5rem;background:var(--color-border);padding:0.125rem 0.5rem;border-radius:var(--radius-sm)}
.geo-content{font-size:0.9rem;line-height:1.5;color:var(--color-text)}

/* Author bio */
.author-bio{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);padding:1.5rem;margin:2rem 0;display:flex;align-items:flex-start;gap:1.25rem}
.author-avatar{width:3.5rem;height:3.5rem;border-radius:var(--radius-full,999px);background:var(--color-accent,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.15rem;flex-shrink:0;letter-spacing:0.02em}
.author-info{flex:1;min-width:0}
.author-bio h3{margin-bottom:0.15rem;font-size:1.05rem}
.author-title{display:block;font-size:0.85rem;color:var(--color-text-muted);margin-bottom:0.5rem}
.author-credentials{display:flex;flex-wrap:wrap;gap:0.375rem;margin-bottom:0.625rem}
.author-credential{display:inline-block;background:var(--color-bg,#fff);border:1px solid var(--color-border);padding:0.125rem 0.5rem;border-radius:var(--radius-full,999px);font-size:0.72rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.03em}
.author-bio p{color:var(--color-text-muted);font-size:0.9rem;line-height:1.6;margin:0}
.author-social{display:flex;gap:0.5rem;margin-top:0.75rem}
.author-social-link{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:var(--radius-full,999px);background:var(--color-bg,#fff);border:1px solid var(--color-border);color:var(--color-text-muted);font-size:0.8rem;font-weight:700;text-decoration:none;transition:all .15s}
.author-social-link:hover{background:var(--color-accent);color:#fff;border-color:var(--color-accent)}
@media(max-width:480px){.author-bio{flex-direction:column;align-items:center;text-align:center}.author-credentials{justify-content:center}.author-social{justify-content:center}}

/* Trust badges — MoneyWell-style horizontal pills with icons */
.trust-badges{margin:2.5rem 0;padding:2.5rem 0}
.trust-badges-row{display:flex;flex-wrap:wrap;gap:1rem;justify-content:center}
.trust-badge{display:inline-flex;align-items:center;gap:0.625rem;background:var(--color-bg);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-full,999px);padding:0.625rem 1.25rem;font-size:0.9rem;font-weight:500;color:var(--color-text);transition:box-shadow .2s,border-color .2s,transform .15s}
.trust-badge:hover{box-shadow:0 2px 8px rgba(0,0,0,.06);border-color:var(--color-accent);transform:translateY(-1px)}
.trust-badge-icon{font-size:1.1rem;flex-shrink:0;line-height:1}
.trust-badge strong{color:var(--color-text);font-weight:600}
.trust-badge-desc{font-size:0.85rem;color:var(--color-text-muted);margin:0}
.trust-badge[title]{cursor:help}

/* Medical disclaimer */
.medical-disclaimer{background:var(--color-warning-light,#fef3c7);border:2px solid var(--color-warning,#f59e0b);padding:1.25rem;border-radius:var(--radius-md,.5rem);margin:1.5rem 0;font-size:0.9rem;line-height:1.6}
.medical-disclaimer strong{color:var(--color-text);display:block;margin-bottom:0.25rem}
.cta-doctor{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);padding:1.25rem;margin:1rem 0}
.cta-doctor h2{font-size:1.1rem;margin-bottom:0.5rem}
.cta-doctor p{color:var(--color-text-muted);font-size:0.9rem;margin:0}

/* Checklist / StepByStep */
.checklist-section{margin:2rem 0}
.checklist-progress{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.9rem;font-weight:600;color:var(--color-text-muted)}
.checklist-list{list-style:none;padding:0;margin:0;counter-reset:checklist}
.checklist-item{border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);margin-bottom:0.5rem;overflow:hidden;transition:border-color var(--transition-speed,.2s),box-shadow .15s;position:relative}
.checklist-item:hover{border-color:var(--color-accent);box-shadow:var(--shadow-sm)}
.checklist-item label{display:flex;align-items:flex-start;gap:0.75rem;padding:1rem 1.25rem;cursor:pointer}
.checklist-checkbox{width:1.25rem;height:1.25rem;margin-top:0.15rem;accent-color:var(--color-accent,#2563eb);flex-shrink:0}
.checklist-checkbox:checked~.checklist-content h3{text-decoration:line-through;color:var(--color-text-muted)}
.checklist-number{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:var(--color-accent,#2563eb);color:#fff;font-size:0.8rem;font-weight:700;flex-shrink:0;position:relative;z-index:1;border:2px solid var(--color-accent,#2563eb)}
.checklist-item:not(:last-child) .checklist-number::after{content:'';position:absolute;top:100%;left:50%;width:2px;height:calc(100% + 0.5rem);background:var(--color-border);transform:translateX(-50%)}
.checklist-content h3{font-size:1rem;margin-bottom:0.25rem}
.checklist-content div{font-size:0.9rem;color:var(--color-text-muted);line-height:1.55}

/* Stat grid */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:2rem 0}
.stat-card{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);padding:1.25rem;text-align:center}
.stat-value{display:block;font-size:1.75rem;font-weight:800;color:var(--color-accent,#2563eb);margin-bottom:0.25rem}
.stat-label{display:block;font-size:0.85rem;color:var(--color-text-muted);font-weight:500}

/* Pricing table */
.pricing-section{margin:2rem 0}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem}
.pricing-plan{background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1.5rem;text-align:center;transition:box-shadow var(--transition-speed,.15s),transform var(--transition-speed,.15s)}
.pricing-plan:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}
.pricing-plan.featured{border-color:var(--color-accent);box-shadow:var(--shadow-md)}
.pricing-plan h3{font-size:1.15rem;margin-bottom:0.5rem}
.pricing-price{font-size:2rem;font-weight:800;color:var(--color-accent);margin-bottom:0.75rem}
.pricing-features{list-style:none;padding:0;margin:0 0 1.25rem;text-align:left}
.pricing-features li{padding:0.375rem 0;border-bottom:1px solid var(--color-border);font-size:0.9rem;color:var(--color-text-muted)}
.pricing-features li:last-child{border-bottom:none}
.pricing-cta{display:inline-block;background:var(--color-accent);color:#fff;padding:0.625rem 1.5rem;border-radius:var(--radius-md,.375rem);font-weight:600;text-decoration:none;transition:transform var(--transition-speed,.15s)}
.pricing-cta:hover{transform:translateY(-1px);color:#fff}

/* Interactive infographic */
.infographic-shell{margin:2rem 0;padding:1.25rem;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-bg-surface)}
.infographic-toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.infographic-chips{display:flex;gap:0.5rem;flex-wrap:wrap}
.infographic-chip{background:var(--color-border,#e2e8f0);border:1px solid var(--color-border-strong,#cbd5e1);color:var(--color-text,#334155);padding:0.35rem 0.75rem;border-radius:var(--radius-full,999px);font-size:0.82rem;cursor:pointer;transition:all var(--transition-speed,.15s)}
.infographic-chip.active{background:var(--color-accent,#2563eb);color:#fff;border-color:var(--color-accent-hover)}
.infographic-toolbar select{margin-left:0.35rem;padding:0.35rem 0.5rem;border:1px solid var(--color-border-strong);border-radius:var(--radius-md,.375rem);background:var(--color-bg)}
.infographic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem}
.infographic-card{background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1.25rem;transition:box-shadow var(--transition-speed,.15s),transform .15s}
.infographic-card:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px)}
.stat-icon{display:block;font-size:1.5rem;margin-bottom:0.5rem;line-height:1}
.stat-trend{display:inline-flex;align-items:center;font-size:0.75rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:var(--radius-full,999px);margin-left:0.375rem;vertical-align:middle}
.stat-trend--up{background:var(--color-success-light,#dcfce7);color:var(--color-success,#22c55e)}
.stat-trend--down{background:var(--color-error-light,#fef2f2);color:var(--color-error,#ef4444)}
.stat-trend--flat{background:var(--color-bg-surface,#f1f5f9);color:var(--color-text-muted,#64748b)}
.infographic-card h3{font-size:1rem;margin-bottom:0.35rem;display:flex;align-items:center;flex-wrap:wrap}
.infographic-summary{font-size:0.9rem;color:var(--color-text-muted,#475569);min-height:2.2rem}
.infographic-meter{display:flex;justify-content:space-between;align-items:center;margin-top:0.65rem;margin-bottom:0.4rem}
.infographic-meter-label{font-size:0.78rem;color:var(--color-text-muted,#64748b);text-transform:uppercase;letter-spacing:0.03em}
.infographic-bar{height:0.5rem;background:var(--color-border,#e2e8f0);border-radius:var(--radius-full,999px);overflow:hidden}
.infographic-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--color-accent,#2563eb),var(--color-secondary,#60a5fa))}

/* DataTable */
.data-table-section{margin:2rem 0}
.data-table-wrapper{overflow-x:auto;border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);max-height:500px;overflow-y:auto}
.data-table{width:100%;border-collapse:collapse;font-size:0.9rem}
.data-table caption{padding:0.75rem;text-align:left;font-size:0.85rem;color:var(--color-text-muted);font-style:italic;caption-side:bottom}
.data-table thead{position:sticky;top:0;z-index:2}
.data-table th{background:var(--color-bg-surface,#f8fafc);padding:0.75rem;text-align:left;border-bottom:2px solid var(--color-border);white-space:nowrap;color:var(--color-text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em}
.data-table th[data-sort-col]{cursor:pointer;user-select:none;transition:background .15s}
.data-table th[data-sort-col]:hover{background:var(--color-border)}
.data-table td{padding:0.75rem;border-bottom:1px solid var(--color-border)}
.data-table tr:nth-child(even){background:var(--color-bg-surface,#f8fafc)}
.data-table tr:hover{background:color-mix(in srgb,var(--color-accent,#2563eb) 5%,var(--color-bg-surface,#f8fafc))}
@media(max-width:640px){.data-table-wrapper{max-height:400px}}

/* Interactive map */
.imap-shell{margin:2rem 0;padding:1.25rem;border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);background:var(--color-bg-surface,#f8fafc)}
.imap-controls{display:flex;gap:1rem;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;margin-bottom:1rem}
.imap-region-buttons{display:flex;gap:0.5rem;flex-wrap:wrap}
.imap-region-buttons button{background:var(--color-bg,#fff);border:1px solid var(--color-border-strong,#cbd5e1);color:var(--color-text,#334155);padding:0.4rem 0.75rem;border-radius:var(--radius-md,.5rem);cursor:pointer;transition:all var(--transition-speed,.15s)}
.imap-region-buttons button.active{background:var(--color-accent,#2563eb);border-color:var(--color-accent-hover);color:#fff}
.imap-controls select{margin-left:0.35rem;padding:0.4rem 0.5rem;border:1px solid var(--color-border-strong);border-radius:var(--radius-md,.375rem);background:var(--color-bg)}
.imap-map-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:0.35rem;max-width:560px;margin-bottom:1rem}
.imap-state-tile{background:var(--color-bg,#fff);border:1px solid var(--color-border-strong,#cbd5e1);color:var(--color-text,#334155);border-radius:var(--radius-md,.375rem);padding:0.45rem 0.2rem;font-size:0.72rem;font-weight:700;cursor:pointer;transition:all var(--transition-speed,.15s)}
.imap-state-tile:hover{border-color:var(--color-accent);background:var(--color-bg-surface)}
.imap-state-tile.active{background:var(--color-accent,#2563eb);border-color:var(--color-accent-hover);color:#fff}
.imap-panels{display:grid;grid-template-columns:1fr;gap:0.75rem}
.imap-panel,.imap-fallback{background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1rem}
.imap-panel h3,.imap-fallback h3{margin-bottom:0.5rem}
.imap-panel-content{line-height:1.55;color:var(--color-text)}
`;
