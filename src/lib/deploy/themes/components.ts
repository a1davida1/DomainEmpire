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

/* Calculator components */
.calc-form{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);padding:1.5rem;margin:2rem 0}
.calc-field{margin-bottom:1rem}
.calc-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem;color:var(--color-text)}
.calc-input{width:100%;padding:0.625rem;border:var(--border-width) solid var(--color-border-strong);border-radius:var(--radius-md);font-size:1rem;background:var(--color-bg);color:var(--color-text);transition:border-color var(--transition-speed)}
.calc-input:focus{border-color:var(--color-accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}
.calc-results{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);padding:1.25rem;margin-top:1rem}
.calc-result-item{display:flex;justify-content:space-between;align-items:center;padding:0.625rem 0;border-bottom:1px solid var(--color-border)}
.calc-result-item:last-child{border-bottom:none}
.calc-result-label{font-weight:500;color:var(--color-text-muted)}.calc-result-value{font-size:1.25rem;font-weight:700;color:var(--color-accent)}
.calc-methodology{margin-top:1.5rem;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);overflow:hidden}
.calc-methodology summary{padding:0.75rem 1rem;cursor:pointer;font-weight:600;background:var(--color-bg-surface)}
.calc-methodology ul,.calc-methodology p{padding:1rem}

/* Comparison components */
.comparison-table-wrapper{overflow-x:auto;margin:2rem 0}
.comparison-table{width:100%;border-collapse:collapse;font-size:0.9rem}
.comparison-table th{background:var(--color-bg-surface);padding:0.75rem;text-align:left;border-bottom:2px solid var(--color-border);white-space:nowrap;color:var(--color-text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em}
.comparison-table th[data-sort-key]{cursor:pointer;user-select:none}
.comparison-table th[data-sort-key]:hover{background:var(--color-border)}
.sort-indicator{color:var(--color-text-muted);margin-left:0.25rem}
.comparison-table td{padding:0.75rem;border-bottom:1px solid var(--color-border)}
.comparison-table tr:hover{background:var(--color-bg-surface)}
.comparison-badge{background:var(--color-success);color:white;padding:0.125rem 0.5rem;border-radius:var(--radius-full);font-size:0.75rem;font-weight:600}
.comparison-verdict{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-success);border-radius:var(--radius-md);padding:1.25rem;margin:1.5rem 0}
.cta-button{display:inline-block;background:var(--color-accent);color:white;padding:0.625rem 1.5rem;border-radius:var(--radius-md);text-decoration:none;font-size:0.9rem;font-weight:600;transition:transform var(--transition-speed),box-shadow var(--transition-speed)}
.cta-button:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm);color:white}

/* Lead form components */
.disclosure-above{background:var(--color-warning-light,#fef3c7);border:2px solid var(--color-warning,#f59e0b);padding:1rem;border-radius:var(--radius-md,.5rem);margin-bottom:1.5rem;font-weight:600}
.lead-form{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);padding:1.5rem;margin:2rem 0}
.lead-field{margin-bottom:1rem}
.lead-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem;color:var(--color-text)}
.lead-field input,.lead-field select{width:100%;padding:0.625rem;border:var(--border-width) solid var(--color-border-strong);border-radius:var(--radius-md);font-size:1rem;background:var(--color-bg);color:var(--color-text);transition:border-color var(--transition-speed)}
.lead-field input:focus,.lead-field select:focus{border-color:var(--color-accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}
.consent{margin:1rem 0;font-size:0.875rem;color:var(--color-text-muted)}.consent label{display:flex;align-items:flex-start;gap:0.5rem}
.lead-form button[type="submit"]{background:var(--color-accent);color:white;padding:0.75rem 2rem;border:none;border-radius:var(--radius-md);font-size:1rem;font-weight:600;cursor:pointer;transition:transform var(--transition-speed),box-shadow var(--transition-speed)}
.lead-form button[type="submit"]:disabled{opacity:0.5;cursor:not-allowed}
.lead-form button[type="submit"]:hover:not(:disabled){transform:translateY(-1px);box-shadow:var(--shadow-sm)}
.success-msg{color:var(--color-success);font-weight:600;margin-top:0.75rem}.error-msg{color:var(--color-error);font-weight:600;margin-top:0.75rem}

/* FAQ components */
.faq-section h2{margin-bottom:1rem}
.faq-list{margin:1.5rem 0}
.faq-item{border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);margin-bottom:0.5rem;overflow:hidden;transition:border-color var(--transition-speed)}
.faq-item[open]{border-color:var(--color-border-strong)}
.faq-question{padding:1rem 1.25rem;cursor:pointer;font-weight:600;background:var(--color-bg-surface);list-style:none;color:var(--color-text);transition:background var(--transition-speed)}
.faq-question:hover{background:var(--color-border)}
.faq-question::-webkit-details-marker{display:none}
.faq-question::before{content:'▸';margin-right:0.75rem;transition:transform 0.2s;color:var(--color-accent)}
.faq-item[open] .faq-question::before{transform:rotate(90deg)}
.faq-answer{padding:1.25rem;border-top:1px solid var(--color-border);color:var(--color-text);line-height:1.65}

/* Cost guide components */
.cost-ranges{margin:2rem 0}
.cost-range{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1.5rem;margin-bottom:1rem}
.cost-range-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;text-align:center;margin-top:1rem}
.cost-low,.cost-avg,.cost-high{padding:1rem;border-radius:var(--radius-md,.5rem)}
.cost-low{background:var(--color-success-light,#f0fdf4);color:var(--color-success)}.cost-avg{background:var(--color-bg-surface,#eff6ff);color:var(--color-text)}.cost-high{background:var(--color-error-light,#fef2f2);color:var(--color-error)}
.cost-label{display:block;font-size:0.8rem;color:var(--color-text-muted);font-weight:600;text-transform:uppercase}
.cost-value{display:block;font-size:1.5rem;font-weight:700;margin-top:0.25rem}
.factors-grid{margin:2rem 0}.factors-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-top:1rem}
.factor-card{padding:1rem;border-radius:var(--radius-md,.5rem);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);background:var(--color-bg)}
.factor-card h4{margin-bottom:0.25rem}.factor-impact{font-size:0.75rem;font-weight:600;text-transform:uppercase}
.impact-high .factor-impact{color:var(--color-error)}.impact-medium .factor-impact{color:var(--color-warning)}.impact-low .factor-impact{color:var(--color-success)}

/* Data sources */
.data-sources{margin-top:2.5rem;padding:1.5rem;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-surface)}
.data-sources h2{font-size:1rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);margin-bottom:0.75rem}
.data-sources ul{list-style:none;padding:0}.data-source-item{padding:0.5rem 0;font-size:0.875rem;border-bottom:1px solid var(--color-border)}
.data-source-item:last-child{border-bottom:none}
.data-source-item a{color:var(--color-link)}
.data-usage{color:var(--color-text-muted);font-style:italic}

/* Wizard components */
.wizard-container{margin:2rem 0}
.wizard-progress{display:flex;gap:0.25rem;margin-bottom:2rem;overflow-x:auto}
.wizard-progress-segment{flex:1;text-align:center;padding:0.5rem 0.25rem;position:relative;opacity:0.4;transition:opacity 0.2s}
.wizard-progress-segment.active{opacity:1}
.wizard-progress-segment.current .wizard-progress-dot{background:var(--color-accent);color:white}
.wizard-progress-dot{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:var(--color-border);font-size:0.8rem;font-weight:700;margin-bottom:0.25rem}
.wizard-progress-label{display:block;font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.author-bio{background:var(--color-bg-surface);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-lg);padding:1.5rem;margin:2rem 0}
.author-bio h3{margin-bottom:0.25rem}
.author-title{display:block;font-size:0.85rem;color:var(--color-text-muted);margin-bottom:0.75rem}
.author-bio p{color:var(--color-text-muted);font-size:0.9rem;line-height:1.6;margin:0}

/* Trust badges */
.trust-badges{margin:2rem 0}
.trust-badges-row{display:flex;flex-wrap:wrap;gap:1rem;justify-content:center}
.trust-badge{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);padding:1rem 1.25rem;text-align:center;flex:1;min-width:140px;max-width:220px}
.trust-badge strong{display:block;color:var(--color-text);margin-bottom:0.25rem}
.trust-badge p{font-size:0.85rem;color:var(--color-text-muted);margin:0}

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
.checklist-item{border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);margin-bottom:0.5rem;overflow:hidden;transition:border-color var(--transition-speed,.2s)}
.checklist-item:hover{border-color:var(--color-border-strong)}
.checklist-item label{display:flex;align-items:flex-start;gap:0.75rem;padding:1rem 1.25rem;cursor:pointer}
.checklist-checkbox{width:1.25rem;height:1.25rem;margin-top:0.15rem;accent-color:var(--color-accent,#2563eb);flex-shrink:0}
.checklist-number{display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border-radius:50%;background:var(--color-accent,#2563eb);color:#fff;font-size:0.8rem;font-weight:700;flex-shrink:0}
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
.infographic-card{background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1rem;transition:box-shadow var(--transition-speed,.15s)}
.infographic-card:hover{box-shadow:var(--shadow-sm)}
.infographic-card h3{font-size:1rem;margin-bottom:0.35rem}
.infographic-summary{font-size:0.9rem;color:var(--color-text-muted,#475569);min-height:2.2rem}
.infographic-meter{display:flex;justify-content:space-between;align-items:center;margin-top:0.65rem;margin-bottom:0.4rem}
.infographic-meter-label{font-size:0.78rem;color:var(--color-text-muted,#64748b);text-transform:uppercase;letter-spacing:0.03em}
.infographic-bar{height:0.5rem;background:var(--color-border,#e2e8f0);border-radius:var(--radius-full,999px);overflow:hidden}
.infographic-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--color-accent,#2563eb),var(--color-secondary,#60a5fa))}

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
