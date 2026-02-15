import type { GrowthPublishChannel } from '@/lib/growth/publishers';
import { evaluateDestinationQuality } from '@/lib/growth/destination-quality';

export interface GrowthPublishPolicyInput {
    channel: GrowthPublishChannel;
    copy: string;
    destinationUrl: string;
}

export interface GrowthPublishPolicyResult {
    allowed: boolean;
    normalizedCopy: string;
    warnings: string[];
    blockReasons: string[];
    changes: string[];
    policyPackId: string;
    policyPackVersion: string;
    checksApplied: string[];
    destinationHost: string | null;
    destinationRiskScore: number;
}

interface PolicyPack {
    id: string;
    version: string;
    channel: GrowthPublishChannel;
    minCopyChars: number;
    warnCopyCharsAbove: number;
    blockCopyCharsAbove: number;
    warnHashtags: number;
    blockHashtags: number;
}

const DEFAULT_POLICY_PACK_VERSION = process.env.GROWTH_POLICY_PACK_VERSION?.trim() || '2026-02-15';

const POLICY_PACKS: Record<GrowthPublishChannel, PolicyPack> = {
    youtube_shorts: {
        id: 'youtube_shorts_core',
        version: DEFAULT_POLICY_PACK_VERSION,
        channel: 'youtube_shorts',
        minCopyChars: 20,
        warnCopyCharsAbove: 180,
        blockCopyCharsAbove: 320,
        warnHashtags: 6,
        blockHashtags: 12,
    },
    pinterest: {
        id: 'pinterest_core',
        version: DEFAULT_POLICY_PACK_VERSION,
        channel: 'pinterest',
        minCopyChars: 20,
        warnCopyCharsAbove: 350,
        blockCopyCharsAbove: 700,
        warnHashtags: 12,
        blockHashtags: 20,
    },
};

const DEFAULT_DISCLOSURE_TOKENS = ['#ad', '#sponsored', '(affiliate)', 'affiliate disclosure'];
const MONETIZATION_CUE_TERMS = [
    'affiliate',
    'commission',
    'sponsor',
    'sponsored',
    'paid partnership',
    'partner link',
];

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function stripControlChars(value: string): string {
    return value.replace(/[\u0000-\u001F\u007F]/g, '');
}

function replaceForbiddenPunctuation(value: string): { output: string; changes: string[] } {
    let output = value;
    const changes: string[] = [];

    if (output.includes('—')) {
        output = output.replace(/—/g, '-');
        changes.push('Replaced em dashes with hyphens');
    }
    if (output.includes('–')) {
        output = output.replace(/–/g, '-');
        changes.push('Replaced en dashes with hyphens');
    }

    return { output, changes };
}

function parseBannedTerms(): string[] {
    const raw = process.env.GROWTH_POLICY_BANNED_TERMS;
    if (!raw) return [];
    return raw
        .split(',')
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length > 0);
}

function parseDisclosureTokens(): string[] {
    const raw = process.env.GROWTH_POLICY_DISCLOSURE_TOKENS;
    if (!raw) return DEFAULT_DISCLOSURE_TOKENS;
    const tokens = raw
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0);
    return tokens.length > 0 ? tokens : DEFAULT_DISCLOSURE_TOKENS;
}

function countHashtags(value: string): number {
    const matches = value.match(/(^|\s)#[A-Za-z0-9_]+/g);
    return matches ? matches.length : 0;
}

function requiresDisclosure(loweredCopy: string): boolean {
    return MONETIZATION_CUE_TERMS.some((term) => loweredCopy.includes(term));
}

function hasDisclosureToken(loweredCopy: string, tokens: string[]): boolean {
    return tokens.some((token) => loweredCopy.includes(token));
}

function hasRequiredUtmParams(destinationUrl: string): boolean {
    try {
        const parsed = new URL(destinationUrl);
        return parsed.searchParams.has('utm_source') && parsed.searchParams.has('utm_medium');
    } catch {
        return false;
    }
}

function resolvePolicyPack(channel: GrowthPublishChannel): PolicyPack {
    return POLICY_PACKS[channel];
}

export function evaluateGrowthPublishPolicy(
    input: GrowthPublishPolicyInput,
): GrowthPublishPolicyResult {
    const warnings: string[] = [];
    const blockReasons: string[] = [];
    const changes: string[] = [];
    const checksApplied: string[] = [];
    const policyPack = resolvePolicyPack(input.channel);

    const stripped = stripControlChars(input.copy || '');
    if (stripped !== input.copy) {
        changes.push('Removed control characters');
    }
    checksApplied.push('control_character_sanitization');

    const normalized = normalizeWhitespace(stripped);
    if (normalized.length < policyPack.minCopyChars) {
        warnings.push('Copy is very short and may underperform');
    }
    if (normalized.length > policyPack.blockCopyCharsAbove) {
        blockReasons.push(
            `Copy exceeds ${input.channel === 'youtube_shorts' ? 'YouTube Shorts' : 'Pinterest'} policy-pack max length `
            + `(${normalized.length} > ${policyPack.blockCopyCharsAbove})`,
        );
    } else if (normalized.length > policyPack.warnCopyCharsAbove) {
        warnings.push(
            `Copy is long for ${input.channel === 'youtube_shorts' ? 'YouTube Shorts' : 'Pinterest'} `
            + `(${normalized.length} chars)`,
        );
    }
    checksApplied.push('copy_length');

    const punctuationNormalized = replaceForbiddenPunctuation(normalized);
    changes.push(...punctuationNormalized.changes);
    checksApplied.push('punctuation_normalization');

    const hashtagCount = countHashtags(punctuationNormalized.output);
    if (hashtagCount > policyPack.blockHashtags) {
        blockReasons.push(
            `Too many hashtags for ${input.channel === 'youtube_shorts' ? 'YouTube Shorts' : 'Pinterest'} `
            + `(${hashtagCount} > ${policyPack.blockHashtags})`,
        );
    } else if (hashtagCount > policyPack.warnHashtags) {
        warnings.push(
            `High hashtag count for ${input.channel === 'youtube_shorts' ? 'YouTube Shorts' : 'Pinterest'} `
            + `(${hashtagCount})`,
        );
    }
    checksApplied.push('hashtag_limits');

    const destinationQuality = evaluateDestinationQuality(input.destinationUrl);
    warnings.push(...destinationQuality.warnings);
    blockReasons.push(...destinationQuality.blockReasons);
    checksApplied.push(...destinationQuality.checksApplied);

    if (destinationQuality.blockReasons.length === 0 && !hasRequiredUtmParams(input.destinationUrl)) {
        warnings.push('Destination URL is missing recommended UTM params (utm_source, utm_medium)');
    }
    checksApplied.push('destination_utm_params');

    const loweredCopy = punctuationNormalized.output.toLowerCase();
    for (const term of parseBannedTerms()) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
        if (pattern.test(loweredCopy)) {
            blockReasons.push(`Copy contains banned policy term: "${term}"`);
        }
    }
    checksApplied.push('banned_terms');

    if (requiresDisclosure(loweredCopy)) {
        const disclosureTokens = parseDisclosureTokens();
        const disclosurePresent = hasDisclosureToken(loweredCopy, disclosureTokens);
        if (!disclosurePresent) {
            const requireDisclosure = process.env.GROWTH_POLICY_REQUIRE_DISCLOSURE === 'true';
            const message = 'Copy appears monetized but lacks explicit disclosure token';
            if (requireDisclosure) {
                blockReasons.push(message);
            } else {
                warnings.push(message);
            }
        }
    }
    checksApplied.push('monetization_disclosure');

    return {
        allowed: blockReasons.length === 0,
        normalizedCopy: punctuationNormalized.output,
        warnings,
        blockReasons,
        changes,
        policyPackId: policyPack.id,
        policyPackVersion: policyPack.version,
        checksApplied,
        destinationHost: destinationQuality.host,
        destinationRiskScore: destinationQuality.riskScore,
    };
}
