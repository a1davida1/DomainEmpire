
interface ScriptConfig {
    adNetwork: 'ezoic' | 'mediavine' | 'adsense' | 'none' | null;
    adNetworkId?: string | null;
    customHead?: string;
    customBody?: string;
}

/** Sanitize an ad network ID to prevent script injection — allow only alphanumeric, hyphens, and dashes. */
function sanitizeNetworkId(id: string): string {
    return id.replaceAll(/[^a-zA-Z0-9\-_:.]/g, '');
}

export function getMonetizationScripts(config: ScriptConfig) {
    const headScripts: string[] = [];
    const bodyScripts: string[] = [];

    const safeId = config.adNetworkId ? sanitizeNetworkId(config.adNetworkId) : '';

    // Google AdSense
    if (config.adNetwork === 'adsense' && safeId) {
        headScripts.push(`
            <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${safeId}"
             crossorigin="anonymous"></script>
        `);
    }

    // Ezoic
    if (config.adNetwork === 'ezoic' && safeId) {
        headScripts.push(`
            <script>var ezoicId = ${JSON.stringify(safeId)};</script>
            <script src="//go.ezoic.net/ezoic.js"></script>
        `);
    }

    // Mediavine
    if (config.adNetwork === 'mediavine' && safeId) {
        headScripts.push(`
            <script async src="https://scripts.mediavine.com/tags/${safeId}.js"></script>
        `);
    }

    // Google Analytics (Global Fallback via Env if not in profile)
    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    if (gaId) {
        const safeGaId = sanitizeNetworkId(gaId);
        headScripts.push(`
            <!-- Google tag (gtag.js) -->
            <script async src="https://www.googletagmanager.com/gtag/js?id=${safeGaId}"></script>
            <script>
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(safeGaId)});
            </script>
        `);
    }

    // Custom Scripts
    if (config.customHead) headScripts.push(config.customHead);
    if (config.customBody) bodyScripts.push(config.customBody);

    return {
        head: headScripts.join('\n'),
        body: bodyScripts.join('\n')
    };
}
