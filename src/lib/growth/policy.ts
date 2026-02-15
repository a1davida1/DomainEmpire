import type { GrowthPublishChannel } from '@/lib/growth/publishers';

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
}

const YOUTUBE_WARN_HASHTAGS = 6;
const YOUTUBE_BLOCK_HASHTAGS = 12;
const PINTEREST_WARN_HASHTAGS = 12;
const PINTEREST_BLOCK_HASHTAGS = 20;

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

function countHashtags(value: string): number {
    const matches = value.match(/(^|\s)#[A-Za-z0-9_]+/g);
    return matches ? matches.length : 0;
}

function isHttpsUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function evaluateGrowthPublishPolicy(
    input: GrowthPublishPolicyInput,
): GrowthPublishPolicyResult {
    const warnings: string[] = [];
    const blockReasons: string[] = [];
    const changes: string[] = [];

    const stripped = stripControlChars(input.copy || '');
    if (stripped !== input.copy) {
        changes.push('Removed control characters');
    }

    const normalized = normalizeWhitespace(stripped);
    if (normalized.length < 20) {
        warnings.push('Copy is very short and may underperform');
    }

    const punctuationNormalized = replaceForbiddenPunctuation(normalized);
    changes.push(...punctuationNormalized.changes);

    const hashtagCount = countHashtags(punctuationNormalized.output);
    if (input.channel === 'youtube_shorts') {
        if (hashtagCount > YOUTUBE_BLOCK_HASHTAGS) {
            blockReasons.push(`Too many hashtags for YouTube Shorts (${hashtagCount} > ${YOUTUBE_BLOCK_HASHTAGS})`);
        } else if (hashtagCount > YOUTUBE_WARN_HASHTAGS) {
            warnings.push(`High hashtag count for YouTube Shorts (${hashtagCount})`);
        }
    } else {
        if (hashtagCount > PINTEREST_BLOCK_HASHTAGS) {
            blockReasons.push(`Too many hashtags for Pinterest (${hashtagCount} > ${PINTEREST_BLOCK_HASHTAGS})`);
        } else if (hashtagCount > PINTEREST_WARN_HASHTAGS) {
            warnings.push(`High hashtag count for Pinterest (${hashtagCount})`);
        }
    }

    if (!isHttpsUrl(input.destinationUrl)) {
        blockReasons.push('Destination URL must be https');
    }

    const loweredCopy = punctuationNormalized.output.toLowerCase();
    for (const term of parseBannedTerms()) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
        if (pattern.test(loweredCopy)) {
            blockReasons.push(`Copy contains banned policy term: "${term}"`);
        }
    }

    return {
        allowed: blockReasons.length === 0,
        normalizedCopy: punctuationNormalized.output,
        warnings,
        blockReasons,
        changes,
    };
}

