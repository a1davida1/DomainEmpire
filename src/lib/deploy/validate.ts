/**
 * Domain Site Validation — programmatic readiness checks.
 *
 * Scans all page definitions for a domain and reports issues:
 *   - Broken internal links (nav links and CTA URLs pointing to non-existent pages)
 *   - Empty/missing content on key blocks
 *   - Calculators with no inputs
 *   - FAQs with no items
 *   - Citations with no sources
 *   - Placeholder text ("Lorem ipsum", "TODO", "Home Services" on non-home-services domains)
 *   - LeadForm with no endpoint
 *   - Missing compliance pages
 *   - Generic site names (unhumanized)
 */

import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { BlockEnvelope } from './blocks/schemas';

export interface ValidationIssue {
    page: string;
    block?: string;
    blockType?: string;
    severity: 'error' | 'warning';
    code: string;
    detail: string;
}

export interface ValidationReport {
    domain: string;
    pageCount: number;
    blockCount: number;
    issues: ValidationIssue[];
    errorCount: number;
    warningCount: number;
    ready: boolean;
}

export async function validateDomain(domainId: string): Promise<ValidationReport> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) throw new Error('Domain not found');

    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));
    const allRoutes = new Set(pages.map(p => p.route));
    const rawDomainSlug = domain.domain.replace(/\.[a-z]+$/i, '');
    const niche = domain.niche || 'general';
    const issues: ValidationIssue[] = [];
    let blockCount = 0;

    for (const page of pages) {
        const blocks = (page.blocks || []) as BlockEnvelope[];
        blockCount += blocks.length;

        for (const block of blocks) {
            const content = (block.content || {}) as Record<string, unknown>;
            const config = (block.config || {}) as Record<string, unknown>;
            const contentStr = JSON.stringify(content);

            // Broken nav links
            if (block.type === 'Header') {
                const navLinks = (content.navLinks || []) as Array<{ label: string; href: string; children?: Array<{ label: string; href: string }> }>;
                for (const link of navLinks) {
                    if (link.href?.startsWith('/') && !allRoutes.has(link.href)) {
                        issues.push({ page: page.route, block: block.id, blockType: 'Header', severity: 'error', code: 'broken_nav', detail: `Nav "${link.label}" → ${link.href} (page doesn't exist)` });
                    }
                    for (const child of link.children || []) {
                        if (child.href?.startsWith('/') && !allRoutes.has(child.href)) {
                            issues.push({ page: page.route, block: block.id, blockType: 'Header', severity: 'error', code: 'broken_nav', detail: `Dropdown "${child.label}" → ${child.href} (page doesn't exist)` });
                        }
                    }
                }
                if (content.siteName === rawDomainSlug || (content.siteName as string)?.length < 3) {
                    issues.push({ page: page.route, block: block.id, blockType: 'Header', severity: 'warning', code: 'generic_name', detail: `Site name "${content.siteName}" looks unhumanized` });
                }
            }

            // Broken CTA/button URLs
            for (const field of ['ctaUrl', 'buttonUrl']) {
                const url = content[field] as string;
                if (url?.startsWith('/') && url !== '#' && !allRoutes.has(url)) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'error', code: 'broken_link', detail: `${field} → ${url} (page doesn't exist)` });
                }
            }

            // Empty calculator inputs
            if (block.type === 'QuoteCalculator') {
                const inputs = content.inputs as unknown[];
                if (!inputs || inputs.length === 0) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'error', code: 'empty_calculator', detail: 'Calculator has no inputs defined' });
                }
            }

            // Empty cost breakdown ranges
            if (block.type === 'CostBreakdown') {
                const ranges = content.ranges as unknown[];
                if (!ranges || ranges.length === 0) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'error', code: 'empty_costs', detail: 'Cost breakdown has no ranges' });
                }
            }

            // Empty FAQ
            if (block.type === 'FAQ') {
                const items = content.items as unknown[];
                if (!items || items.length === 0) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'error', code: 'empty_faq', detail: 'FAQ has no items' });
                }
            }

            // Empty citations
            if (block.type === 'CitationBlock') {
                const sources = content.sources as unknown[];
                if (!sources || sources.length === 0) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'warning', code: 'empty_citations', detail: 'Citation block has no sources' });
                }
            }

            // LeadForm endpoint
            if (block.type === 'LeadForm' && (config.endpoint === '#' || config.endpoint === '')) {
                const hasFields = (content.fields as unknown[])?.length > 0;
                if (hasFields) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'warning', code: 'no_endpoint', detail: 'LeadForm has fields but no endpoint (will use collectUrl fallback)' });
                }
            }

            // Generic "Home Services" text on non-home-services domains
            if (!niche.toLowerCase().includes('home services') && !niche.toLowerCase().includes('home improvement')) {
                if (contentStr.includes('Home Services') || contentStr.includes('home services')) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'warning', code: 'generic_niche', detail: `Block contains "Home Services" but niche is "${niche}"` });
                }
            }

            // Placeholder text
            for (const marker of ['Lorem ipsum', 'TODO', 'REPLACE', '[insert', '[your']) {
                if (contentStr.includes(marker)) {
                    issues.push({ page: page.route, block: block.id, blockType: block.type, severity: 'warning', code: 'placeholder', detail: `Contains "${marker}"` });
                }
            }

            // Empty Hero heading
            if (block.type === 'Hero' && (!(content.heading as string) || (content.heading as string).length < 5)) {
                issues.push({ page: page.route, block: block.id, blockType: 'Hero', severity: 'error', code: 'empty_hero', detail: 'Hero has no heading' });
            }
        }

        // Missing meta description
        if (!page.metaDescription || page.metaDescription.length < 20) {
            issues.push({ page: page.route, severity: 'warning', code: 'missing_meta', detail: 'Page has no/short meta description' });
        }
    }

    // Site-level checks
    if (!allRoutes.has('/')) {
        issues.push({ page: '(site)', severity: 'error', code: 'no_homepage', detail: 'No homepage (/) found' });
    }

    // Compliance checks
    const hasPrivacy = allRoutes.has('/privacy-policy') || allRoutes.has('/privacy');
    const hasTerms = allRoutes.has('/terms');
    if (!hasPrivacy) issues.push({ page: '(site)', severity: 'error', code: 'missing_compliance', detail: 'No privacy policy page' });
    if (!hasTerms) issues.push({ page: '(site)', severity: 'error', code: 'missing_compliance', detail: 'No terms of service page' });

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    return {
        domain: domain.domain,
        pageCount: pages.length,
        blockCount,
        issues,
        errorCount,
        warningCount,
        ready: errorCount === 0,
    };
}
