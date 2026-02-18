/**
 * AI Image Generator — generates real images for deployed sites using Gemini via OpenRouter.
 *
 * Image types:
 *   1. Hero backgrounds  — niche-appropriate photographic hero images
 *   2. Article featured   — topic-specific featured images for articles
 *   3. OG social cards    — kept as SVG (text overlays work better as vector)
 *
 * Falls back to SVG placeholders when AI generation fails or is disabled.
 */

import { getAIClient } from './openrouter';

// ============================================================
// Prompt templates
// ============================================================

function heroPrompt(niche: string, domain: string): string {
    return `Generate a high-quality, professional hero background image for a ${niche} website (${domain}).

Requirements:
- Photographic style, modern and clean
- Suitable as a website hero banner background (wide aspect ratio, ~1440x600)
- Subtle, not too busy — text will be overlaid on top
- Professional color palette appropriate for the ${niche} industry
- No text, logos, or watermarks in the image
- Slight gradient or vignette toward edges for text readability
- High production value, looks like a premium stock photo`;
}

function articlePrompt(title: string, niche: string): string {
    return `Generate a high-quality featured image for a ${niche} article titled: "${title}"

Requirements:
- Photographic style, editorially appropriate for the topic
- Wide aspect ratio (~1200x630), suitable as an article header image
- Visually represents the topic without being literal or clichéd
- Professional, modern aesthetic
- No text, logos, or watermarks in the image
- Clean composition with good lighting
- Looks like a premium editorial photograph`;
}

// ============================================================
// Core generation functions
// ============================================================

export interface AIImageResult {
    base64: string;
    mimeType: string;
    model: string;
    cost: number;
    durationMs: number;
}

/**
 * Generate a hero background image using Gemini.
 * Returns base64 image data or null on failure.
 */
export async function generateHeroImageAI(
    niche: string,
    domain: string,
    quality: 'fast' | 'quality' = 'fast',
): Promise<AIImageResult | null> {
    const client = getAIClient();
    const task = quality === 'quality' ? 'imageGenQuality' : 'imageGenFast';
    const prompt = heroPrompt(niche, domain);

    const result = await client.generateImage(task, prompt, {
        width: 1440,
        height: 600,
        temperature: 0.9,
    });

    if (!result) return null;

    return {
        base64: result.base64,
        mimeType: result.mimeType,
        model: result.model,
        cost: result.cost,
        durationMs: result.durationMs,
    };
}

/**
 * Generate an article featured image using Gemini.
 * Returns base64 image data or null on failure.
 */
export async function generateArticleImageAI(
    title: string,
    niche: string,
    quality: 'fast' | 'quality' = 'fast',
): Promise<AIImageResult | null> {
    const client = getAIClient();
    const task = quality === 'quality' ? 'imageGenQuality' : 'imageGenFast';
    const prompt = articlePrompt(title, niche);

    const result = await client.generateImage(task, prompt, {
        width: 1200,
        height: 630,
        temperature: 0.85,
    });

    if (!result) return null;

    return {
        base64: result.base64,
        mimeType: result.mimeType,
        model: result.model,
        cost: result.cost,
        durationMs: result.durationMs,
    };
}

// ============================================================
// Batch generation for deploy pipeline
// ============================================================

export interface AIImageSet {
    path: string;
    content: string; // base64 for binary, raw SVG for fallback
    isBinary: boolean;
    mimeType: string;
}

export interface GenerateAIImagesOpts {
    domain: string;
    siteTitle: string;
    niche: string;
    skin: string;
    quality: 'fast' | 'quality';
    pages: Array<{
        route: string;
        title: string;
    }>;
}

/**
 * Generate AI images for a full site deploy.
 * Returns generated images with metadata. Items that fail AI generation
 * are excluded — the caller should fall back to SVG for missing paths.
 */
export async function generateAISiteImages(
    opts: GenerateAIImagesOpts,
): Promise<AIImageSet[]> {
    const images: AIImageSet[] = [];
    let totalCost = 0;

    // 1. Hero background (one per site)
    console.log(`[ImageGen] Generating hero image for ${opts.domain}...`);
    const hero = await generateHeroImageAI(opts.niche, opts.domain, opts.quality);
    if (hero) {
        images.push({
            path: 'images/hero-bg.png',
            content: hero.base64,
            isBinary: true,
            mimeType: hero.mimeType,
        });
        totalCost += hero.cost;
        console.log(`[ImageGen] Hero: ${hero.model} (${hero.durationMs}ms, $${hero.cost.toFixed(4)})`);
    } else {
        console.log(`[ImageGen] Hero: AI generation failed, will use SVG fallback`);
    }

    // 2. Article featured images (one per non-home page, limited to avoid cost blowup)
    const articlePages = opts.pages.filter(p => p.route !== '/').slice(0, 20);
    for (const page of articlePages) {
        const slug = page.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
        console.log(`[ImageGen] Generating featured image for /${slug}...`);

        const article = await generateArticleImageAI(page.title, opts.niche, opts.quality);
        if (article) {
            images.push({
                path: `images/featured/${slug}.png`,
                content: article.base64,
                isBinary: true,
                mimeType: article.mimeType,
            });
            totalCost += article.cost;
            console.log(`[ImageGen]   ${slug}: ${article.model} (${article.durationMs}ms, $${article.cost.toFixed(4)})`);
        } else {
            console.log(`[ImageGen]   ${slug}: AI generation failed, will use SVG fallback`);
        }
    }

    console.log(`[ImageGen] Done: ${images.length} AI images generated, total cost: $${totalCost.toFixed(4)}`);
    return images;
}
