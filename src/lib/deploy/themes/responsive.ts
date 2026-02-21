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
/* Tablet — interactive blocks */
@media(max-width:768px){
  .pricing-grid{grid-template-columns:1fr 1fr;gap:1rem}
  .pricing-highlighted{transform:none}
  .pricing-card{padding:1.5rem 1rem}
  .pricing-price{font-size:1.75rem}
  .testimonial-grid{grid-template-columns:1fr 1fr;gap:1rem}
  .stat-grid{grid-template-columns:1fr 1fr}
  .lead-form-row{grid-template-columns:1fr}
  .ranking-item{padding:1rem}
  .ranking-header{gap:0.5rem}
  .vs-grid{gap:1rem}
  .vs-side{padding:1.25rem}
  .comparison-cards{grid-template-columns:1fr}
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
  .toc{padding:1rem}
  .toc-details{border:none}
  .toc-details:not([open]) .toc-list{display:none}
  .toc-details .toc-list{max-height:80vh;overflow-y:auto}
  .toc-title{cursor:pointer;margin-bottom:0;list-style:none}
  .toc-title::-webkit-details-marker{display:none}
  .toc-title::after{content:' ▾';font-size:0.7em;opacity:0.5}
  .toc-details[open] .toc-title::after{content:' ▴'}
  /* Pricing — single column on small screens */
  .pricing-grid{grid-template-columns:1fr;gap:1rem}
  .pricing-highlighted{transform:none;box-shadow:var(--shadow-sm)}
  .pricing-badge{font-size:0.7rem;padding:0.2rem 0.75rem}
  .pricing-price{font-size:1.5rem}
  /* Testimonials — single column */
  .testimonial-grid{grid-template-columns:1fr}
  .testimonial-card{padding:1.25rem}
  /* Stat grid — 2-col on mobile */
  .stat-grid{grid-template-columns:1fr 1fr;gap:0.75rem}
  .stat-card{padding:1rem}
  .stat-ring-value{font-size:0.9rem}
  /* Ranking — compact */
  .ranking-item{padding:0.875rem;gap:0.75rem}
  .ranking-number{width:2rem;height:2rem;font-size:0.85rem}
  .ranking-header h3{font-size:0.95rem}
  .ranking-badge{font-size:0.65rem;padding:0.1rem 0.4rem}
  .ranking-score-bar{margin-bottom:0.25rem}
  /* Review/ProsConsCard — full width columns */
  .pros-cons{grid-template-columns:1fr;gap:0.75rem}
  .review-card{padding:1.25rem}
  /* Vs card — stack vertically */
  .vs-grid{grid-template-columns:1fr;gap:0.75rem}
  .vs-side{padding:1rem}
  .vs-divider span{width:2rem;height:2rem;font-size:0.75rem}
  /* Lead form half-width fields stack */
  .lead-field--half{grid-column:span 1}
  /* Comparison cards — single column */
  .comparison-cards{grid-template-columns:1fr}
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
