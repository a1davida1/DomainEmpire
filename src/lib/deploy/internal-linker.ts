/**
 * Post-assembly Internal Linking — scans generated HTML for keyword mentions
 * that match other pages on the same site, and injects contextual links.
 *
 * Runs after all page HTMLs are generated so we have the full sitemap available.
 * Limits to 3-5 links per page to avoid over-optimization penalties.
 */

interface PageInfo {
    route: string;
    title: string;
    keywords: string[];
}

interface GeneratedFile {
    path: string;
    content: string;
    isBase64?: boolean;
}

const MAX_LINKS_PER_PAGE = 8;

function routeToFilePath(route: string): string {
    return route === '/' ? 'index.html' : `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
}

/**
 * Extract linkable keywords from a page title and route.
 * These are the phrases we'll search for in other pages' content.
 */
function extractKeywords(title: string, route: string): string[] {
    const words: string[] = [];
    if (title) {
        words.push(title.toLowerCase());
        const cleaned = title
            .replace(/\(\d{4}\)/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim()
            .toLowerCase();
        if (cleaned.length > 5 && cleaned !== title.toLowerCase()) {
            words.push(cleaned);
        }
    }
    const slug = route.replace(/^\//, '').replace(/\/$/, '').split('/').pop() || '';
    const fromSlug = slug.replace(/-/g, ' ').toLowerCase();
    if (fromSlug.length > 3) {
        words.push(fromSlug);
    }
    return words;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inject internal links into an HTML file.
 *
 * Only links text inside <p> and <li> elements (not headings, anchors, etc.).
 * Each target page is linked at most once. Returns the modified HTML.
 */
function injectLinks(
    html: string,
    currentRoute: string,
    pages: PageInfo[],
    _domain: string,
): string {
    const otherPages = pages.filter(p => p.route !== currentRoute);
    if (otherPages.length === 0) return html;

    let linksAdded = 0;
    const linkedRoutes = new Set<string>();
    let result = html;

    for (const page of otherPages) {
        if (linksAdded >= MAX_LINKS_PER_PAGE) break;
        if (linkedRoutes.has(page.route)) continue;

        for (const keyword of page.keywords) {
            if (linksAdded >= MAX_LINKS_PER_PAGE) break;
            if (keyword.length < 4) continue;

            const escaped = escapeRegex(keyword);
            const pattern = new RegExp(
                `(<(?:p|li)[^>]*>[^<]*?)\\b(${escaped})\\b([^<]*?<\\/(?:p|li)>)`,
                'i',
            );

            const match = result.match(pattern);
            if (match && match.index !== undefined) {
                const before = match[1];
                const text = match[2];
                const after = match[3];

                if (before.includes('<a ') || before.includes('href=')) continue;

                const link = `<a href="${page.route}">${text}</a>`;
                result = result.slice(0, match.index) + before + link + after + result.slice(match.index + match[0].length);
                linksAdded++;
                linkedRoutes.add(page.route);
                break;
            }
        }
    }

    return result;
}

/**
 * Run the internal linking pass on all generated HTML files.
 * Modifies files in-place within the array.
 */
export function applyInternalLinking(
    files: GeneratedFile[],
    pages: Array<{ route: string; title: string }>,
    domain: string,
): void {
    const pageInfos: PageInfo[] = pages.map(p => ({
        route: p.route,
        title: p.title,
        keywords: extractKeywords(p.title, p.route),
    }));

    for (const file of files) {
        if (file.isBase64) continue;
        if (!file.path.endsWith('.html')) continue;

        const matchingPage = pages.find(p => routeToFilePath(p.route) === file.path);
        if (!matchingPage) continue;

        file.content = injectLinks(file.content, matchingPage.route, pageInfos, domain);
    }
}
