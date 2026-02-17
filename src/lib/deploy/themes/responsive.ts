/**
 * Responsive breakpoints and print styles.
 * Applied after all theme-specific styles.
 */
export const responsiveStyles = `
/* Tablet */
@media(max-width:768px){
  .site-container{padding:0 1rem}
  .hero{padding:2.5rem 1rem}
  .hero h1{font-size:1.75rem}
  article h1{font-size:1.5rem}
  .cost-range-bar{grid-template-columns:1fr}
  .factors-cards{grid-template-columns:1fr}
  .comparison-table-wrapper{margin:1rem -1rem;padding:0 1rem}
  .comparison-table{font-size:0.8rem;min-width:600px}
  .wizard-progress-label{display:none}
  .wizard-progress-dot{width:1.5rem;height:1.5rem;font-size:0.7rem}
  .infographic-grid{grid-template-columns:1fr 1fr}
  .imap-map-grid{grid-template-columns:repeat(auto-fill,minmax(36px,1fr))}
  .author-bio{padding:1.25rem}
  .data-sources{padding:1rem}
}
/* Mobile */
@media(max-width:480px){
  body{font-size:0.95rem}
  .site-container{padding:0 0.75rem}
  .hero{padding:2rem 0.75rem}
  .hero h1{font-size:1.5rem}
  .calc-form,.lead-form,.wizard-step{padding:1rem}
  .calc-input,.lead-field input,.lead-field select,.wizard-field input,.wizard-field select{font-size:16px}
  .lead-form button[type="submit"],.wizard-next{width:100%;padding:0.875rem}
  .faq-question{padding:0.75rem}
  .cta-button{display:block;text-align:center;padding:0.75rem}
  .wizard-radio,.wizard-checkbox{padding:0.75rem}
  .infographic-grid{grid-template-columns:1fr}
  .infographic-toolbar,.imap-controls{display:block}
  .infographic-toolbar label,.imap-controls label{display:block;margin-top:0.5rem}
  .imap-region-buttons{margin-bottom:0.5rem}
  .imap-map-grid{grid-template-columns:repeat(auto-fill,minmax(34px,1fr))}
  .trust-badges-row{flex-direction:column}
  .trust-badge{max-width:100%}
}
/* Print */
@media print{
  header,footer,.cta-button,.lead-form,.print-btn,.scroll-cta,.wizard-nav,.wizard-progress,.geo-adaptive,.infographic-toolbar,.imap-controls{display:none!important}
  body{max-width:100%;padding:0;color:#000;background:#fff}
  .site-container{max-width:100%;padding:0}
  .layout-wrap{display:block}.sidebar{display:none}
  .checklist-item{page-break-inside:avoid}
  .faq-item{break-inside:avoid}
  .faq-item[open] .faq-answer{display:block}
  .comparison-table-wrapper{overflow:visible}
  .comparison-table{min-width:0;font-size:0.8rem}
  .cost-range-bar{grid-template-columns:1fr 1fr 1fr}
  a[href]::after{content:" (" attr(href) ")";font-size:0.75rem;color:#666}
  a[href^="/"]::after{content:""}
  a[href^="/"]{display:inline}
  .freshness-badge{border:1px solid #999;background:none}
}
`;
