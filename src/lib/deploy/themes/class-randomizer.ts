/**
 * CSS class name randomization for anti-fingerprinting.
 * Generates a deterministic short prefix from the domain name and applies it
 * to identifiable class names in both CSS and HTML output.
 *
 * This prevents cross-domain fingerprinting where scrapers could detect
 * that multiple sites share the same builder by matching class names.
 */

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Generate a deterministic 3-character prefix from a domain name.
 * Returns something like 'kvm' or 'bqt' — always lowercase alpha.
 */
export function getDomainPrefix(domain: string): string {
    const seed = hashString(domain || 'default');
    const a = ALPHABET[seed % 26];
    const b = ALPHABET[Math.floor(seed / 26) % 26];
    const c = ALPHABET[Math.floor(seed / 676) % 26];
    return `${a}${b}${c}`;
}

/**
 * Class names that are identifiable as coming from our builder.
 * These get prefixed with the domain-specific prefix.
 * Order matters: longer names must come before shorter ones to avoid
 * partial replacement (e.g., 'hero-cta-row' before 'hero-cta').
 */
const FINGERPRINT_CLASSES = [
    // Hero system
    'hero-cta--secondary', 'hero-cta-row', 'hero-trust-item', 'hero-trust',
    'hero-rating-stars', 'hero-rating', 'hero-badge', 'hero-sub', 'hero-cta',
    // Header
    'header-scrolled', 'header-phone-icon', 'header-phone', 'header-nav',
    'header--topbar', 'header--centered', 'header--minimal', 'header--simple',
    // Nav
    'nav-dropdown-trigger', 'nav-dropdown-menu', 'nav-dropdown-open',
    'nav-dropdown--active', 'nav-dropdown', 'nav-active', 'nav-arrow', 'nav-open',
    'hamburger-active', 'hamburger',
    // Footer
    'footer-columns', 'footer-col', 'footer-disclaimer', 'footer-newsletter',
    // Page layout
    'page-layout', 'page-sidebar', 'page-main',
    'site-container',
    // Breadcrumbs / TOC
    'breadcrumb-current', 'breadcrumb-link', 'breadcrumb-sep', 'breadcrumbs',
    'toc-title', 'toc-list', 'toc-item--h3', 'toc-item', 'toc-active',
    // Related pages
    'related-pages', 'related-heading', 'related-grid',
    'related-card', 'related-icon', 'related-info',
    // Lead form
    'lead-heading', 'lead-subheading', 'lead-field-row', 'lead-field--half',
    'lead-field', 'lead-form', 'lead-section', 'lead-trust',
    'disclosure-above', 'consent', 'success-msg', 'success-icon', 'error-msg',
    'btn-lock',
    // CTA
    'cta-section--bar', 'cta-section--gradient', 'cta-section--card', 'cta-section--minimal',
    'cta-section', 'cta-content', 'cta-text', 'cta-subtext', 'cta-icon', 'cta-button',
    // Scroll CTA
    'scroll-cta-sentinel', 'scroll-cta-visible', 'scroll-cta-inner',
    'scroll-cta-bar', 'scroll-cta-card', 'scroll-cta-banner',
    'scroll-cta-text', 'scroll-cta-btn', 'scroll-cta-dismiss', 'scroll-cta',
    // Review / ProsConsCard
    'review-card-header', 'review-card', 'review-badge', 'review-rating',
    'review-stars', 'review-score', 'review-summary', 'review-cta',
    'pros-heading', 'cons-heading', 'pros-cons', 'pro-icon', 'con-icon',
    // Testimonial
    'testimonial-section', 'testimonial-grid', 'testimonial-card',
    'testimonial-rating', 'testimonial-quote', 'testimonial-mark',
    'testimonial-author', 'testimonial-avatar', 'testimonial-info',
    'testimonial-verified', 'testimonial-title',
    // Pricing
    'pricing-section', 'pricing-grid', 'pricing-card', 'pricing-highlighted',
    'pricing-badge', 'pricing-price', 'pricing-period', 'pricing-desc',
    'pricing-features', 'pricing-feature--excluded', 'pricing-check', 'pricing-cta',
    // Ranking
    'ranking-section', 'ranking-list', 'ranking-item',
    'ranking-gold', 'ranking-silver', 'ranking-bronze',
    'ranking-number', 'ranking-content', 'ranking-header',
    'ranking-badge', 'ranking-rating', 'ranking-stars',
    'ranking-score-text', 'ranking-score-bar', 'ranking-score-fill', 'ranking-cta',
    // FAQ
    'faq-section', 'faq-list', 'faq-item', 'faq-question', 'faq-answer',
    // Comparison upgrade
    'comparison-winner', 'comparison-crown', 'comparison-stars', 'comparison-verdict',
    'comparison-badge', 'comparison-section', 'comparison-table', 'comparison-table-wrapper',
    'verdict-icon', 'sort-indicator',
    // VsCard upgrade
    'vs-card', 'vs-grid', 'vs-side', 'vs-side--winner', 'vs-side-header',
    'vs-winner-badge', 'vs-rating', 'vs-stars', 'vs-score',
    'vs-section', 'vs-section-label', 'vs-section-pros', 'vs-section-cons',
    'vs-pros', 'vs-cons', 'vs-cta', 'vs-divider',
    // AuthorBio upgrade
    'author-bio', 'author-avatar', 'author-info', 'author-title',
    'author-credentials', 'author-credential', 'author-social', 'author-social-link',
    // CostBreakdown upgrade
    'cost-section', 'cost-ranges', 'cost-range', 'cost-range-label', 'cost-range-bar',
    'cost-tier', 'cost-bar-track', 'cost-bar-fill', 'cost-bar--low', 'cost-bar--avg', 'cost-bar--high',
    'cost-label', 'cost-value', 'cost-value--highlight',
    'factors-grid', 'factors-heading', 'factors-cards', 'factor-card', 'factor-header', 'factor-impact',
    'impact-high', 'impact-medium', 'impact-low',
    // StatGrid upgrade
    'stat-icon', 'stat-trend', 'stat-trend--up', 'stat-trend--down', 'stat-trend--flat',
    'stat-ring-wrap', 'stat-ring', 'stat-ring-fill', 'stat-ring-value',
    'infographic-shell', 'infographic-toolbar', 'infographic-chips', 'infographic-chip',
    'infographic-grid', 'infographic-card', 'infographic-summary',
    'infographic-meter', 'infographic-meter-label', 'infographic-bar',
    // DataTable upgrade
    'data-table-section', 'data-table-wrapper', 'data-table',
    // PdfDownload upgrade
    'pdf-download', 'pdf-download-btn', 'pdf-icon', 'pdf-content', 'pdf-desc',
    'pdf-btn-icon', 'pdf-gate-text', 'pdf-gate-form',
    // CitationBlock upgrade
    'data-sources', 'citation-list', 'data-source-item', 'citation-num',
    'citation-detail', 'citation-ext', 'citation-publisher', 'citation-date', 'data-usage',
    // TrustBadges upgrade
    'trust-badges', 'trust-badges-row', 'trust-badge', 'trust-badge-icon', 'trust-badge-desc',
    // EmbedWidget upgrade
    'embed-widget', 'embed-title', 'embed-container', 'embed-placeholder',
    // ResourceGrid
    'resource-grid-section', 'resource-grid-banner', 'resource-grid', 'resource-card',
    'resource-icon', 'resource-title', 'resource-desc',
    // LatestArticles
    'latest-articles-section', 'latest-articles-banner', 'latest-articles-grid',
    'article-card', 'article-card-img', 'article-card-img--placeholder',
    'article-card-body', 'article-card-title', 'article-card-excerpt',
    // AmortizationTable
    'amort-section', 'amort-heading', 'amort-subheading', 'amort-toolbar',
    'amort-table-wrap', 'amort-table', 'amort-chart-wrap',
    'amort-pagination', 'amort-page-limit',
    'amort-dl-btn', 'amort-dl-csv', 'amort-dl-excel',
    // QuoteCalculator / Calculator
    'calculator-section', 'calc-inputs', 'calc-input', 'calc-field',
    'calc-range', 'calc-unit', 'calc-unit--prefix', 'calc-split',
    'calc-results', 'calc-results-heading', 'calc-result-card',
    'calc-result-label', 'calc-result-value',
    'calc-breakdown', 'calc-breakdown-row', 'calc-breakdown-total',
    'calc-methodology', 'calc-input-group',
    // Checklist / StepByStep
    'checklist-section', 'checklist-list', 'checklist-item',
    'checklist-number', 'checklist-checkbox', 'checklist-content', 'checklist-progress',
    // Wizard
    'wizard-section', 'wizard-container', 'wizard-step', 'wizard-step-title', 'wizard-step-desc',
    'wizard-field', 'wizard-radio', 'wizard-checkbox', 'wizard-answer-list', 'wizard-answer-summary',
    'wizard-nav', 'wizard-back', 'wizard-next',
    'wizard-progress', 'wizard-progress-dot', 'wizard-progress-label',
    'wizard-results', 'wizard-results-title', 'wizard-results-cards', 'wizard-result-card',
    'wizard-quiz-score', 'wizard-restart', 'wizard-lead-form',
    // Sidebar
    'sidebar', 'sidebar--categories', 'sidebar-heading', 'sidebar-section',
    'sidebar-cat--active', 'sidebar-cat-nav', 'sidebar-cat-icon', 'sidebar-cat-label', 'sidebar-cat',
    'sidebar-search', 'sidebar-search-input',
    // Structural (avoid 'header','footer','hero' — conflict with HTML tags/test patterns)
    'footer-bottom', 'footer-legal',
    'footer-social', 'footer-social-icon', 'newsletter-form',
    'hero-stars', 'hero-rating-text',
    'has-sidebar',
    // Content blocks
    'article-body', 'article-featured-img',
    'freshness-badge', 'freshness-dot', 'reviewed-by',
    'medical-disclaimer', 'cta-doctor', 'print-btn',
    'pros', 'cons',
    // Geo
    'geo-adaptive', 'geo-block', 'geo-content', 'geo-fallback', 'geo-label',
    // Interactive map
    'imap-shell', 'imap-controls', 'imap-map-grid',
    'imap-panels', 'imap-panel', 'imap-panel-content',
    // Cost tiers
    'cost-low', 'cost-avg', 'cost-high',
    // Misc components
    'cookie-consent', 'cookie-ok',
    'back-to-top', 'btt-visible', 'reading-progress',
    'section-heading', 'section-subheading',
    'skip-nav', 'reveal', 'is-visible',
];

/**
 * Build a class name replacement map: original → prefixed.
 */
export function buildClassMap(domain: string): Map<string, string> {
    const prefix = getDomainPrefix(domain);
    const map = new Map<string, string>();
    for (const cls of FINGERPRINT_CLASSES) {
        map.set(cls, `${prefix}-${cls}`);
    }
    return map;
}

/**
 * Apply class name randomization to a CSS string.
 * Replaces `.original-class` with `.prefix-original-class` in selectors.
 */
export function randomizeCSS(css: string, domain: string): string {
    const prefix = getDomainPrefix(domain);
    let result = css;
    // Replace longer class names first to avoid partial matches
    for (const cls of FINGERPRINT_CLASSES) {
        const prefixed = `${prefix}-${cls}`;
        // Replace in CSS selectors: .class-name → .prefix-class-name
        result = result.replaceAll(`.${cls}`, `.${prefixed}`);
    }
    return result;
}

/**
 * Apply class name randomization to an HTML string.
 * Replaces class="original" and class="... original ..." patterns.
 */
export function randomizeHTML(html: string, domain: string): string {
    const prefix = getDomainPrefix(domain);
    let result = html;
    // Replace class names using word-boundary regex to prevent cascading
    // double-prefixing. Without \b, replacing 'pros' after 'pros-heading'
    // would turn 'xyz-pros-heading' into 'xyz-xyz-pros-heading'.
    for (const cls of FINGERPRINT_CLASSES) {
        const prefixed = `${prefix}-${cls}`;
        // Escape regex special characters in class name (e.g. '--')
        const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?<![a-zA-Z0-9_-])${escaped}(?![a-zA-Z0-9_])`, 'g');
        result = result.replace(re, prefixed);
    }
    return result;
}
