
interface ScriptConfig {
    adNetwork: 'ezoic' | 'mediavine' | 'adsense' | 'none' | null;
    adNetworkId?: string | null;
    customHead?: string;
    customBody?: string;
}

export function getMonetizationScripts(config: ScriptConfig) {
    const headScripts: string[] = [];
    const bodyScripts: string[] = [];

    // Google AdSense
    if (config.adNetwork === 'adsense' && config.adNetworkId) {
        headScripts.push(`
            <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.adNetworkId}"
             crossorigin="anonymous"></script>
        `);
    }

    // Ezoic (Placeholder)
    if (config.adNetwork === 'ezoic' && config.adNetworkId) {
        headScripts.push(`
            <script>var ezoicId = ${config.adNetworkId};</script>
            <script src="//go.ezoic.net/ezoic.js"></script>
        `);
    }

    // Google Analytics (Global Fallback via Env if not in profile, can be added here)
    if (process.env.NEXT_PUBLIC_GA_ID) {
        headScripts.push(`
            <!-- Google tag (gtag.js) -->
            <script async src="https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}"></script>
            <script>
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
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
