/**
 * Image Generation Pipeline — produces SVG images at deploy time.
 *
 * Generates three categories of images per site:
 *   1. OG social cards  — branded cards for link sharing (og:image)
 *   2. Hero backgrounds  — decorative niche-aware patterns for hero sections
 *   3. Article headers   — decorative banners for article/page tops
 *
 * All output is pure SVG (no raster deps). SVGs are resolution-independent,
 * tiny in file size, and supported by all modern browsers + most social platforms.
 */

import { skins, type SkinTokens } from './themes/skin-definitions';

// ============================================================
// Niche visual identity
// ============================================================

interface NicheVisual {
    emoji: string;
    label: string;
    accentGrad: [string, string];
    patternShape: 'circles' | 'diamonds' | 'waves' | 'hexagons' | 'crosses' | 'dots';
}

const NICHE_VISUALS: Record<string, NicheVisual> = {
    health:      { emoji: '⚕️', label: 'Health',      accentGrad: ['#10b981', '#059669'], patternShape: 'crosses' },
    medical:     { emoji: '⚕️', label: 'Medical',     accentGrad: ['#10b981', '#047857'], patternShape: 'crosses' },
    finance:     { emoji: '💰', label: 'Finance',     accentGrad: ['#2563eb', '#1d4ed8'], patternShape: 'diamonds' },
    insurance:   { emoji: '🛡️', label: 'Insurance',   accentGrad: ['#3b82f6', '#1e40af'], patternShape: 'diamonds' },
    home:        { emoji: '🏠', label: 'Home',        accentGrad: ['#f59e0b', '#d97706'], patternShape: 'hexagons' },
    real_estate: { emoji: '🏠', label: 'Real Estate', accentGrad: ['#f59e0b', '#b45309'], patternShape: 'hexagons' },
    technology:  { emoji: '💻', label: 'Technology',  accentGrad: ['#6366f1', '#4f46e5'], patternShape: 'circles' },
    tech:        { emoji: '💻', label: 'Tech',        accentGrad: ['#6366f1', '#4338ca'], patternShape: 'circles' },
    education:   { emoji: '🎓', label: 'Education',   accentGrad: ['#8b5cf6', '#7c3aed'], patternShape: 'dots' },
    travel:      { emoji: '✈️', label: 'Travel',      accentGrad: ['#0ea5e9', '#0284c7'], patternShape: 'waves' },
    food:        { emoji: '🍽️', label: 'Food',        accentGrad: ['#ef4444', '#dc2626'], patternShape: 'circles' },
    fitness:     { emoji: '🏋️', label: 'Fitness',     accentGrad: ['#f97316', '#ea580c'], patternShape: 'waves' },
    pets:        { emoji: '🐾', label: 'Pets',        accentGrad: ['#a855f7', '#9333ea'], patternShape: 'dots' },
    automotive:  { emoji: '🚗', label: 'Automotive',  accentGrad: ['#64748b', '#475569'], patternShape: 'hexagons' },
    legal:       { emoji: '⚖️', label: 'Legal',       accentGrad: ['#1e293b', '#334155'], patternShape: 'diamonds' },
    beauty:      { emoji: '✨', label: 'Beauty',      accentGrad: ['#ec4899', '#db2777'], patternShape: 'circles' },
    gaming:      { emoji: '🎮', label: 'Gaming',      accentGrad: ['#8b5cf6', '#6d28d9'], patternShape: 'hexagons' },
    sports:      { emoji: '⚽', label: 'Sports',      accentGrad: ['#22c55e', '#16a34a'], patternShape: 'waves' },
    gardening:   { emoji: '🌱', label: 'Gardening',   accentGrad: ['#22c55e', '#15803d'], patternShape: 'dots' },
    diy:         { emoji: '🔧', label: 'DIY',         accentGrad: ['#f97316', '#c2410c'], patternShape: 'hexagons' },
};

const DEFAULT_VISUAL: NicheVisual = {
    emoji: '🌐', label: 'General', accentGrad: ['#2563eb', '#1d4ed8'], patternShape: 'circles',
};

function getNicheVisual(niche: string): NicheVisual {
    return NICHE_VISUALS[niche.toLowerCase()] || DEFAULT_VISUAL;
}

function getSkinTokens(skinName: string): SkinTokens {
    return skins[skinName] || skins.slate;
}

// ============================================================
// SVG pattern generators
// ============================================================

function generatePattern(shape: NicheVisual['patternShape'], color: string, opacity: number = 0.06): string {
    const o = opacity;
    switch (shape) {
        case 'circles':
            return `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
  <circle cx="20" cy="20" r="8" fill="${color}" opacity="${o}"/>
</pattern>`;
        case 'diamonds':
            return `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
  <polygon points="20,4 36,20 20,36 4,20" fill="${color}" opacity="${o}"/>
</pattern>`;
        case 'waves':
            return `<pattern id="p" width="60" height="30" patternUnits="userSpaceOnUse">
  <path d="M0 15 Q15 0 30 15 Q45 30 60 15" fill="none" stroke="${color}" stroke-width="2" opacity="${o}"/>
</pattern>`;
        case 'hexagons':
            return `<pattern id="p" width="56" height="48" patternUnits="userSpaceOnUse">
  <polygon points="28,2 50,14 50,38 28,50 6,38 6,14" fill="none" stroke="${color}" stroke-width="1.5" opacity="${o}"/>
</pattern>`;
        case 'crosses':
            return `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
  <line x1="14" y1="20" x2="26" y2="20" stroke="${color}" stroke-width="2" opacity="${o}"/>
  <line x1="20" y1="14" x2="20" y2="26" stroke="${color}" stroke-width="2" opacity="${o}"/>
</pattern>`;
        case 'dots':
            return `<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse">
  <circle cx="10" cy="10" r="2.5" fill="${color}" opacity="${o}"/>
</pattern>`;
    }
}

// ============================================================
// 1. OG Social Card
// ============================================================

export interface OgImageOptions {
    title: string;
    siteName: string;
    domain: string;
    niche: string;
    skin: string;
    route?: string;
}

/**
 * Generate an SVG social sharing card (1200×630 — standard OG size).
 */
export function generateOgImage(opts: OgImageOptions): string {
    const vis = getNicheVisual(opts.niche);
    const _skin = getSkinTokens(opts.skin);
    const [gradA, gradB] = vis.accentGrad;

    // Truncate title to fit
    const title = opts.title.length > 70 ? opts.title.slice(0, 67) + '…' : opts.title;
    // Split title into lines (~35 chars each)
    const lines = wrapText(title, 35);
    const titleY = lines.length === 1 ? 320 : 290;

    const pattern = generatePattern(vis.patternShape, '#ffffff', 0.08);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradA}"/>
      <stop offset="100%" stop-color="${gradB}"/>
    </linearGradient>
    ${pattern}
    <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(255,255,255,0)" />
      <stop offset="50%" stop-color="rgba(255,255,255,0.03)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#p)"/>
  <rect width="1200" height="630" fill="url(#shine)"/>

  <!-- Bottom bar -->
  <rect y="570" width="1200" height="60" fill="rgba(0,0,0,0.25)"/>

  <!-- Accent line -->
  <rect x="80" y="200" width="80" height="5" rx="2.5" fill="rgba(255,255,255,0.6)"/>

  <!-- Niche badge -->
  <rect x="80" y="160" width="${vis.label.length * 12 + 40}" height="30" rx="15" fill="rgba(255,255,255,0.15)"/>
  <text x="100" y="181" fill="white" font-family="system-ui,sans-serif" font-size="14" font-weight="600">${escSvg(vis.label.toUpperCase())}</text>

  <!-- Title -->
${lines.map((line, i) => `  <text x="80" y="${titleY + i * 58}" fill="white" font-family="system-ui,sans-serif" font-size="48" font-weight="800" letter-spacing="-0.03em">${escSvg(line)}</text>`).join('\n')}

  <!-- Domain -->
  <text x="80" y="590" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" font-size="18" font-weight="500">${escSvg(opts.domain)}</text>

  <!-- Site name -->
  <text x="1120" y="590" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif" font-size="16" font-weight="400" text-anchor="end">${escSvg(opts.siteName)}</text>

  <!-- Corner accent -->
  <circle cx="1120" cy="100" r="60" fill="rgba(255,255,255,0.04)"/>
  <circle cx="1120" cy="100" r="30" fill="rgba(255,255,255,0.06)"/>
</svg>`;
}

// ============================================================
// 2. Hero Background Image
// ============================================================

export interface HeroImageOptions {
    niche: string;
    skin: string;
    width?: number;
    height?: number;
}

/**
 * Generate a decorative SVG hero background image.
 */
export function generateHeroImage(opts: HeroImageOptions): string {
    const vis = getNicheVisual(opts.niche);
    const skin = getSkinTokens(opts.skin);
    const w = opts.width || 1440;
    const h = opts.height || 600;
    const [gradA, _gradB] = vis.accentGrad;

    const pattern = generatePattern(vis.patternShape, skin.text, 0.04);

    // Decorative floating shapes
    const shapes = generateFloatingShapes(w, h, vis.accentGrad[0], opts.niche);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${skin.bg}"/>
      <stop offset="50%" stop-color="${skin.bgSurface}"/>
      <stop offset="100%" stop-color="${skin.bg}"/>
    </linearGradient>
    ${pattern}
    <radialGradient id="glow" cx="70%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${gradA}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${gradA}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#hg)"/>
  <rect width="${w}" height="${h}" fill="url(#p)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
${shapes}
  <!-- Bottom fade -->
  <rect y="${h - 80}" width="${w}" height="80" fill="url(#bottomFade)"/>
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${skin.bg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${skin.bg}" stop-opacity="0.8"/>
    </linearGradient>
  </defs>
</svg>`;
}

// ============================================================
// 3. Article Featured Image
// ============================================================

export interface ArticleImageOptions {
    title: string;
    niche: string;
    skin: string;
    width?: number;
    height?: number;
}

/**
 * Generate a decorative article featured image / banner.
 */
export function generateArticleImage(opts: ArticleImageOptions): string {
    const vis = getNicheVisual(opts.niche);
    const _skin = getSkinTokens(opts.skin);
    const w = opts.width || 1200;
    const h = opts.height || 400;
    const [gradA, gradB] = vis.accentGrad;

    const pattern = generatePattern(vis.patternShape, '#ffffff', 0.07);
    const title = opts.title.length > 55 ? opts.title.slice(0, 52) + '…' : opts.title;
    const lines = wrapText(title, 40);
    const textY = lines.length === 1 ? 220 : 195;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="abg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradA}"/>
      <stop offset="100%" stop-color="${gradB}"/>
    </linearGradient>
    ${pattern}
  </defs>

  <rect width="${w}" height="${h}" fill="url(#abg)"/>
  <rect width="${w}" height="${h}" fill="url(#p)"/>

  <!-- Decorative accent -->
  <rect x="60" y="${textY - 60}" width="60" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>

  <!-- Niche label -->
  <text x="60" y="${textY - 75}" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif" font-size="13" font-weight="600" letter-spacing="0.08em">${escSvg(vis.label.toUpperCase())}</text>

  <!-- Title -->
${lines.map((line, i) => `  <text x="60" y="${textY + i * 46}" fill="white" font-family="system-ui,sans-serif" font-size="38" font-weight="800" letter-spacing="-0.02em">${escSvg(line)}</text>`).join('\n')}

  <!-- Corner accents -->
  <circle cx="${w - 80}" cy="80" r="120" fill="rgba(255,255,255,0.04)"/>
  <circle cx="${w - 80}" cy="80" r="60" fill="rgba(255,255,255,0.03)"/>
  <circle cx="100" cy="${h - 40}" r="80" fill="rgba(255,255,255,0.03)"/>
</svg>`;
}

// ============================================================
// Deploy-time image set generator
// ============================================================

export interface PageImageSet {
    /** Path relative to site root → SVG content */
    path: string;
    content: string;
}

export interface GenerateImagesOpts {
    domain: string;
    siteTitle: string;
    niche: string;
    skin: string;
    pages: Array<{
        route: string;
        title: string;
    }>;
}

/**
 * Generate the full image set for a site deploy.
 * Returns an array of { path, content } to be included in GeneratedFile[].
 */
export function generateSiteImages(opts: GenerateImagesOpts): PageImageSet[] {
    const images: PageImageSet[] = [];

    // 1. One shared hero background
    images.push({
        path: 'images/hero-bg.svg',
        content: generateHeroImage({ niche: opts.niche, skin: opts.skin }),
    });

    // 2. OG image per page
    for (const page of opts.pages) {
        const slug = page.route === '/' ? 'home' : page.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
        images.push({
            path: `images/og/${slug}.svg`,
            content: generateOgImage({
                title: page.title || opts.siteTitle,
                siteName: opts.siteTitle,
                domain: opts.domain,
                niche: opts.niche,
                skin: opts.skin,
                route: page.route,
            }),
        });
    }

    // 3. Article featured images per non-home page
    for (const page of opts.pages) {
        if (page.route === '/') continue;
        const slug = page.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
        images.push({
            path: `images/featured/${slug}.svg`,
            content: generateArticleImage({
                title: page.title || opts.siteTitle,
                niche: opts.niche,
                skin: opts.skin,
            }),
        });
    }

    return images;
}

/**
 * Get the OG image path for a given route.
 */
export function getOgImagePath(route: string): string {
    const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    return `/images/og/${slug}.svg`;
}

/**
 * Get the article featured image path for a given route.
 */
export function getFeaturedImagePath(route: string): string {
    const slug = route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    return `/images/featured/${slug}.svg`;
}

// ============================================================
// Helpers
// ============================================================

function escSvg(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if (current.length + word.length + 1 > maxChars && current.length > 0) {
            lines.push(current);
            current = word;
        } else {
            current = current ? current + ' ' + word : word;
        }
    }
    if (current) lines.push(current);
    return lines.slice(0, 3); // max 3 lines
}

function generateFloatingShapes(w: number, h: number, color: string, niche: string): string {
    // Deterministic "random" positions based on niche string hash
    let hash = 0;
    for (let i = 0; i < niche.length; i++) {
        hash = ((hash << 5) - hash) + niche.charCodeAt(i);
        hash |= 0;
    }
    const pseudo = (n: number) => {
        hash = ((hash << 5) - hash) + n;
        hash |= 0;
        return Math.abs(hash % 1000) / 1000;
    };

    const shapes: string[] = [];
    for (let i = 0; i < 5; i++) {
        const cx = Math.round(pseudo(i * 7) * w);
        const cy = Math.round(pseudo(i * 13) * h);
        const r = Math.round(20 + pseudo(i * 19) * 60);
        const opacity = 0.02 + pseudo(i * 23) * 0.04;
        shapes.push(`  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`);
    }
    return shapes.join('\n');
}
