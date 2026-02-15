/**
 * Global link policy controls.
 *
 * This project defaults to no automated interlinking to avoid portfolio-wide
 * linking patterns. Enable only when intentionally needed.
 */

export function isInternalLinkingEnabled(): boolean {
    return process.env.ENABLE_INTERNAL_LINKING === 'true';
}

export function isPortfolioCrossDomainLinkBlockingEnabled(): boolean {
    const value = process.env.ENFORCE_NO_PORTFOLIO_CROSSLINKS;
    if (value === undefined) return true;
    return value === 'true';
}
