/**
 * Component CSS styles shared across all themes.
 * Covers interactive components: calculators, comparisons, lead forms, FAQs, cost guides, etc.
 */
export const componentStyles = `
/* Trust elements */
.disclaimer{background:#fef3c7;border:1px solid #f59e0b;padding:1rem;border-radius:0.5rem;margin-bottom:1.5rem;font-size:0.9rem}
.disclosure{background:#f1f5f9;padding:0.75rem;border-radius:0.25rem;margin:1rem 0}
.sources{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0}
.sources ol{padding-left:1.5rem}.sources li{margin-bottom:0.5rem;font-size:0.875rem}
.reviewed-by,.last-updated{color:#64748b;font-size:0.875rem;margin-top:0.5rem}

/* Calculator components */
.calc-form{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin:2rem 0}
.calc-field{margin-bottom:1rem}
.calc-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem}
.calc-input{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
.calc-results{background:#eff6ff;border:1px solid #bfdbfe;border-radius:0.5rem;padding:1rem;margin-top:1rem}
.calc-result-item{display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid #dbeafe}
.calc-result-item:last-child{border-bottom:none}
.calc-result-label{font-weight:500}.calc-result-value{font-size:1.25rem;font-weight:700;color:#1d4ed8}
.calc-methodology{margin-top:1.5rem;border:1px solid #e2e8f0;border-radius:0.5rem}
.calc-methodology summary{padding:0.75rem 1rem;cursor:pointer;font-weight:600;background:#f1f5f9}
.calc-methodology ul,.calc-methodology p{padding:1rem}

/* Comparison components */
.comparison-table-wrapper{overflow-x:auto;margin:2rem 0}
.comparison-table{width:100%;border-collapse:collapse;font-size:0.9rem}
.comparison-table th{background:#f1f5f9;padding:0.75rem;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap}
.comparison-table th[data-sort-key]{cursor:pointer;user-select:none}
.comparison-table th[data-sort-key]:hover{background:#e2e8f0}
.sort-indicator{color:#94a3b8;margin-left:0.25rem}
.comparison-table td{padding:0.75rem;border-bottom:1px solid #f1f5f9}
.comparison-table tr:hover{background:#f8fafc}
.comparison-badge{background:#22c55e;color:white;padding:0.125rem 0.5rem;border-radius:1rem;font-size:0.75rem;font-weight:600}
.comparison-verdict{background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem;padding:1rem;margin:1rem 0}
.cta-button{display:inline-block;background:#2563eb;color:white;padding:0.375rem 1rem;border-radius:0.375rem;text-decoration:none;font-size:0.8rem;font-weight:600}
.cta-button:hover{background:#1d4ed8}

/* Lead form components */
.disclosure-above{background:#fef3c7;border:2px solid #f59e0b;padding:1rem;border-radius:0.5rem;margin-bottom:1.5rem;font-weight:600}
.lead-form{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin:2rem 0}
.lead-field{margin-bottom:1rem}
.lead-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem}
.lead-field input,.lead-field select{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
.consent{margin:1rem 0;font-size:0.875rem}.consent label{display:flex;align-items:flex-start;gap:0.5rem}
.lead-form button[type="submit"]{background:#2563eb;color:white;padding:0.75rem 2rem;border:none;border-radius:0.375rem;font-size:1rem;font-weight:600;cursor:pointer}
.lead-form button[type="submit"]:disabled{opacity:0.5;cursor:not-allowed}
.lead-form button[type="submit"]:hover:not(:disabled){background:#1d4ed8}
.success-msg{color:#16a34a;font-weight:600;margin-top:0.75rem}.error-msg{color:#dc2626;font-weight:600;margin-top:0.75rem}

/* FAQ components */
.faq-list{margin:2rem 0}
.faq-item{border:1px solid #e2e8f0;border-radius:0.5rem;margin-bottom:0.5rem;overflow:hidden}
.faq-item[open]{border-color:#cbd5e1}
.faq-question{padding:1rem;cursor:pointer;font-weight:600;background:#f8fafc;list-style:none}
.faq-question::-webkit-details-marker{display:none}
.faq-question::before{content:'▸';margin-right:0.5rem;transition:transform 0.2s}
.faq-item[open] .faq-question::before{transform:rotate(90deg)}
.faq-answer{padding:1rem;border-top:1px solid #e2e8f0}

/* Cost guide components */
.cost-ranges{margin:2rem 0}
.cost-range{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem}
.cost-range-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;text-align:center;margin-top:1rem}
.cost-low,.cost-avg,.cost-high{padding:1rem;border-radius:0.5rem}
.cost-low{background:#f0fdf4}.cost-avg{background:#eff6ff}.cost-high{background:#fef2f2}
.cost-label{display:block;font-size:0.8rem;color:#64748b;font-weight:600;text-transform:uppercase}
.cost-value{display:block;font-size:1.5rem;font-weight:700;margin-top:0.25rem}
.factors-grid{margin:2rem 0}.factors-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-top:1rem}
.factor-card{padding:1rem;border-radius:0.5rem;border:1px solid #e2e8f0}
.factor-card h4{margin-bottom:0.25rem}.factor-impact{font-size:0.75rem;font-weight:600;text-transform:uppercase}
.impact-high .factor-impact{color:#dc2626}.impact-medium .factor-impact{color:#f59e0b}.impact-low .factor-impact{color:#22c55e}

/* Data sources */
.data-sources{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0}
.data-sources ul{list-style:none;padding:0}.data-source-item{padding:0.375rem 0;font-size:0.875rem}
.data-usage{color:#64748b;font-style:italic}

/* Wizard components */
.wizard-container{margin:2rem 0}
.wizard-progress{display:flex;gap:0.25rem;margin-bottom:2rem;overflow-x:auto}
.wizard-progress-segment{flex:1;text-align:center;padding:0.5rem 0.25rem;position:relative;opacity:0.4;transition:opacity 0.2s}
.wizard-progress-segment.active{opacity:1}
.wizard-progress-segment.current .wizard-progress-dot{background:#2563eb;color:#fff}
.wizard-progress-dot{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:#e2e8f0;font-size:0.8rem;font-weight:700;margin-bottom:0.25rem}
.wizard-progress-label{display:block;font-size:0.7rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wizard-step{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem}
.wizard-step-title{font-size:1.25rem;margin-bottom:0.5rem}
.wizard-step-desc{color:#64748b;margin-bottom:1rem}
.wizard-field{margin-bottom:1rem}
.wizard-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem}
.wizard-field input[type="text"],.wizard-field input[type="number"],.wizard-field select{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
.wizard-radio,.wizard-checkbox{display:flex;align-items:center;gap:0.5rem;padding:0.625rem 1rem;border:1px solid #e2e8f0;border-radius:0.5rem;margin-bottom:0.375rem;cursor:pointer;transition:border-color 0.15s,background 0.15s}
.wizard-radio:hover,.wizard-checkbox:hover{border-color:#93c5fd;background:#eff6ff}
.wizard-radio input:checked+span,.wizard-checkbox input:checked+span{font-weight:600;color:#1d4ed8}
.wizard-nav{display:flex;justify-content:space-between;margin-top:1.5rem}
.wizard-back{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:0.625rem 1.5rem;border-radius:0.375rem;font-weight:600;cursor:pointer}
.wizard-back:hover{background:#e2e8f0}
.wizard-next{background:#2563eb;color:#fff;border:none;padding:0.625rem 1.5rem;border-radius:0.375rem;font-weight:600;cursor:pointer}
.wizard-next:hover{background:#1d4ed8}
.wizard-results{margin-top:1rem}
.wizard-results-title{font-size:1.5rem;margin-bottom:1rem;text-align:center}
.wizard-result-card{background:#f0fdf4;border:1px solid #86efac;border-radius:0.75rem;padding:1.25rem;margin-bottom:1rem}
.wizard-result-card.result-eligibility{border-left:4px solid #22c55e}
.wizard-result-card.result-recommendation{border-left:4px solid #3b82f6}
.wizard-result-card.result-score{border-left:4px solid #f59e0b}
.wizard-result-card h4{font-size:1.1rem;margin-bottom:0.5rem}
.wizard-result-card p{color:#475569;margin-bottom:0.75rem}
.wizard-restart{display:block;margin:1.5rem auto 0;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:0.5rem 1.5rem;border-radius:0.375rem;cursor:pointer}
.wizard-restart:hover{background:#e2e8f0}
.wizard-lead-form{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin-top:1.5rem}
.wizard-lead-form h4{margin-bottom:1rem}
.wizard-shake{animation:shake 0.4s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.wizard-answer-summary{margin-top:1rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1rem}
.wizard-answer-summary h4{margin-bottom:0.5rem}
.wizard-answer-list{margin:0;padding-left:1.1rem}
.wizard-answer-list li{margin-bottom:0.35rem;color:#475569}
.wizard-quiz-score{margin-bottom:1rem;padding:0.875rem 1rem;border-radius:0.75rem;background:#eff6ff;border:1px solid #bfdbfe;font-weight:700;color:#1e40af;text-align:center}
.wizard-score-detail{display:block;margin-top:0.25rem;font-size:0.82rem;font-weight:500;color:#1e3a8a}

/* Wizard mode variants */
.wizard-container[data-wizard-mode="configurator"] .wizard-step{background:#f8fafc;border-color:#cbd5e1}
.wizard-container[data-wizard-mode="configurator"] .wizard-next{background:#0f766e}
.wizard-container[data-wizard-mode="configurator"] .wizard-next:hover{background:#115e59}
.wizard-container[data-wizard-mode="configurator"] .wizard-result-card{background:#ecfeff;border-color:#99f6e4}

.wizard-container[data-wizard-mode="quiz"] .wizard-step{background:#fefce8;border-color:#fde047}
.wizard-container[data-wizard-mode="quiz"] .wizard-progress-dot{background:#fde68a}
.wizard-container[data-wizard-mode="quiz"] .wizard-progress-segment.current .wizard-progress-dot{background:#f59e0b}
.wizard-container[data-wizard-mode="quiz"] .wizard-next{background:#b45309}
.wizard-container[data-wizard-mode="quiz"] .wizard-next:hover{background:#92400e}
.wizard-container[data-wizard-mode="quiz"] .wizard-result-card{background:#fffbeb;border-color:#fcd34d}

.wizard-container[data-wizard-mode="survey"] .wizard-step{background:#f0fdf4;border-color:#86efac}
.wizard-container[data-wizard-mode="survey"] .wizard-next{background:#15803d}
.wizard-container[data-wizard-mode="survey"] .wizard-next:hover{background:#166534}
.wizard-container[data-wizard-mode="survey"] .wizard-result-card{background:#f7fee7;border-color:#bef264}

.wizard-container[data-wizard-mode="assessment"] .wizard-step{background:#fff7ed;border-color:#fdba74}
.wizard-container[data-wizard-mode="assessment"] .wizard-next{background:#c2410c}
.wizard-container[data-wizard-mode="assessment"] .wizard-next:hover{background:#9a3412}
.wizard-container[data-wizard-mode="assessment"] .wizard-result-card{background:#fff7ed;border-color:#fdba74}

/* Freshness badges */
.freshness-badge{display:inline-flex;align-items:center;gap:0.375rem;font-size:0.8rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:1rem;margin-bottom:1rem}
.freshness-dot{width:0.5rem;height:0.5rem;border-radius:50%;display:inline-block}
.freshness-green{background:#f0fdf4;color:#15803d;border:1px solid #86efac}
.freshness-green .freshness-dot{background:#22c55e}
.freshness-yellow{background:#fefce8;color:#a16207;border:1px solid #fde047}
.freshness-yellow .freshness-dot{background:#eab308}
.freshness-red{background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5}
.freshness-red .freshness-dot{background:#ef4444}

/* Print button */
.print-btn{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:0.375rem 1rem;border-radius:0.375rem;font-size:0.85rem;cursor:pointer;float:right;margin-bottom:1rem}
.print-btn:hover{background:#e2e8f0}

/* Scroll-triggered CTA */
.scroll-cta{position:fixed;bottom:0;left:0;right:0;z-index:100;transform:translateY(100%);transition:transform 0.3s ease;pointer-events:none}
.scroll-cta-visible{transform:translateY(0);pointer-events:auto}
.scroll-cta-inner{display:flex;align-items:center;justify-content:center;gap:1rem;padding:1rem 1.5rem;max-width:1100px;margin:0 auto}
.scroll-cta-bar{background:#1e293b;color:#f8fafc}
.scroll-cta-card{background:#fff;border-top:2px solid #2563eb;box-shadow:0 -4px 12px rgba(0,0,0,0.1)}
.scroll-cta-card .scroll-cta-text{color:#1e293b}
.scroll-cta-banner{background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff}
.scroll-cta-text{font-weight:500;font-size:0.95rem;flex:1}
.scroll-cta-btn{display:inline-block;background:#2563eb;color:#fff;padding:0.5rem 1.25rem;border-radius:0.375rem;font-weight:600;text-decoration:none;white-space:nowrap;font-size:0.9rem}
.scroll-cta-bar .scroll-cta-btn{background:#fff;color:#1e293b}
.scroll-cta-btn:hover{opacity:0.9}
.scroll-cta-dismiss{background:none;border:none;color:inherit;font-size:1.5rem;cursor:pointer;padding:0 0.25rem;opacity:0.6;line-height:1}
.scroll-cta-dismiss:hover{opacity:1}
@media(max-width:640px){.scroll-cta-inner{flex-direction:column;gap:0.5rem;text-align:center}}

/* Geo-adaptive content */
.geo-adaptive{margin:1.5rem 0}
.geo-block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:1rem;margin-bottom:0.5rem}
.geo-label{display:inline-block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:0.5rem;background:#e2e8f0;padding:0.125rem 0.5rem;border-radius:0.25rem}
.geo-content{font-size:0.9rem;line-height:1.5}

/* Interactive infographic */
.infographic-shell{margin:2rem 0;padding:1rem;border:1px solid #e2e8f0;border-radius:0.75rem;background:#f8fafc}
.infographic-toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.infographic-chips{display:flex;gap:0.5rem;flex-wrap:wrap}
.infographic-chip{background:#e2e8f0;border:1px solid #cbd5e1;color:#334155;padding:0.35rem 0.75rem;border-radius:999px;font-size:0.82rem;cursor:pointer}
.infographic-chip.active{background:#2563eb;color:#fff;border-color:#1d4ed8}
.infographic-toolbar select{margin-left:0.35rem;padding:0.35rem 0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;background:#fff}
.infographic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem}
.infographic-card{background:#fff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1rem}
.infographic-card h3{font-size:1rem;margin-bottom:0.35rem}
.infographic-summary{font-size:0.9rem;color:#475569;min-height:2.2rem}
.infographic-meter{display:flex;justify-content:space-between;align-items:center;margin-top:0.65rem;margin-bottom:0.4rem}
.infographic-meter-label{font-size:0.78rem;color:#64748b;text-transform:uppercase;letter-spacing:0.03em}
.infographic-bar{height:0.5rem;background:#e2e8f0;border-radius:999px;overflow:hidden}
.infographic-bar span{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#60a5fa)}

/* Interactive map */
.imap-shell{margin:2rem 0;padding:1rem;border:1px solid #e2e8f0;border-radius:0.75rem;background:#f8fafc}
.imap-controls{display:flex;gap:1rem;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;margin-bottom:1rem}
.imap-region-buttons{display:flex;gap:0.5rem;flex-wrap:wrap}
.imap-region-buttons button{background:#fff;border:1px solid #cbd5e1;color:#334155;padding:0.4rem 0.75rem;border-radius:0.5rem;cursor:pointer}
.imap-region-buttons button.active{background:#2563eb;border-color:#1d4ed8;color:#fff}
.imap-controls select{margin-left:0.35rem;padding:0.4rem 0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;background:#fff}
.imap-map-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:0.35rem;max-width:560px;margin-bottom:1rem}
.imap-state-tile{background:#fff;border:1px solid #cbd5e1;color:#334155;border-radius:0.375rem;padding:0.45rem 0.2rem;font-size:0.72rem;font-weight:700;cursor:pointer}
.imap-state-tile:hover{border-color:#93c5fd;background:#eff6ff}
.imap-state-tile.active{background:#2563eb;border-color:#1d4ed8;color:#fff}
.imap-panels{display:grid;grid-template-columns:1fr;gap:0.75rem}
.imap-panel,.imap-fallback{background:#fff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1rem}
.imap-panel h3,.imap-fallback h3{margin-bottom:0.5rem}
.imap-panel-content{line-height:1.55}
`;
