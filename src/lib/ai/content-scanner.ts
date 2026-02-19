/**
 * Content Scanner — post-generation quality checks.
 *
 * Provides three scanning capabilities:
 * 1. Banned word/phrase detection with line numbers
 * 2. Sentence burstiness measurement (length variance)
 * 3. Content fingerprinting for cross-domain duplicate detection
 */

import { createHash } from 'node:crypto';
import { db, articles } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { BANNED_WORDS, BANNED_TRANSITIONS } from './banned-words';

// ─── Task 1: Banned Pattern Scanner ─────────────────────────────────────────

export interface BannedPatternViolation {
    pattern: string;
    line: number;
    category: 'banned_word' | 'banned_transition' | 'em_dash';
}

/** Pre-compiled regexes for banned words — built once at module load. */
const BANNED_WORD_REGEXES: Array<{ pattern: string; regex: RegExp }> = BANNED_WORDS.map(word => ({
    pattern: word,
    regex: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}));

/** Pre-lowercased transition phrases for fast comparison. */
const BANNED_TRANSITION_LOWER: Array<{ pattern: string; lower: string }> = BANNED_TRANSITIONS.map(phrase => ({
    pattern: phrase,
    lower: phrase.toLowerCase(),
}));

/** Pre-compiled regex for em/en dash variants. */
const EM_DASH_REGEX = /[\u2012\u2013\u2014\u2015\uFE58\uFF0D]/;

/**
 * Scan markdown content for banned words, transition phrases, and em dashes.
 * Returns an array of violations with the offending pattern and line number.
 */
export function scanForBannedPatterns(markdown: string): BannedPatternViolation[] {
    const violations: BannedPatternViolation[] = [];
    const lines = markdown.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const lineLower = line.toLowerCase();

        // Check banned words (pre-compiled word-boundary regex)
        for (const { pattern, regex } of BANNED_WORD_REGEXES) {
            if (regex.test(line)) {
                violations.push({ pattern, line: lineNum, category: 'banned_word' });
            }
        }

        // Check banned transitions (pre-lowercased substring match)
        for (const { pattern, lower } of BANNED_TRANSITION_LOWER) {
            if (lineLower.includes(lower)) {
                violations.push({ pattern, line: lineNum, category: 'banned_transition' });
            }
        }

        // Check em dashes and unicode dash variants
        if (EM_DASH_REGEX.test(line)) {
            violations.push({ pattern: 'em/en dash', line: lineNum, category: 'em_dash' });
        }
    }

    return violations;
}

/**
 * Format violations into a concise string for re-humanization prompts.
 */
export function formatViolationsForPrompt(violations: BannedPatternViolation[]): string {
    if (violations.length === 0) return '';

    const grouped = new Map<string, number[]>();
    for (const v of violations) {
        const key = v.pattern;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(v.line);
    }

    const parts: string[] = [];
    for (const [pattern, lines] of grouped) {
        parts.push(`"${pattern}" on line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}`);
    }

    return `The following banned AI patterns were found and MUST be replaced with natural alternatives:\n${parts.join('\n')}`;
}

// ─── Task 2: Sentence Burstiness Validator ──────────────────────────────────

export interface BurstinessResult {
    avgLength: number;
    stdDev: number;
    score: number;
    pass: boolean;
    sentenceCount: number;
}

// Pre-compiled patterns for sentence splitting
const ABBREVIATION_REGEX = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|approx|dept|govt|inc|corp|ltd|assn|est|vol|no|gen|sgt|pvt|cpl|fig|ed|rev|tr|univ)\./gi;
const ACRONYM_DOTS_REGEX = /\b([A-Z]\.){2,}/g;          // U.S.A., D.C., etc.
const DECIMAL_REGEX = /(\d+)\.(\d)/g;                     // 3.5, 100.0, etc.
const URL_REGEX = /https?:\/\/[^\s]+/g;                   // URLs with dots
const ELLIPSIS_REGEX = /\.{2,}/g;                         // .. or ...
const SENTENCE_BOUNDARY_REGEX = /(?<=[.!?])\s+(?=[A-Z"])/g; // Split after .!? followed by space + capital

/**
 * Measure sentence length burstiness (variance in sentence length).
 *
 * High burstiness (score >= 0.35) indicates human-like writing with varied
 * sentence lengths. Low burstiness suggests robotic, uniform cadence.
 *
 * Score = stdDev / avgLength
 */
export function measureBurstiness(markdown: string): BurstinessResult {
    // Strip markdown formatting for cleaner sentence detection
    let plain = markdown
        .replace(/^#{1,6}\s+.*$/gm, '')       // Remove headings
        .replace(/!\[.*?\]\(.*?\)/g, '')       // Remove images
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // Keep link text
        .replace(/[*_~`]+/g, '')               // Remove formatting
        .replace(/^\s*[-*+]\s+/gm, '')         // Remove list markers
        .replace(/^\s*\d+\.\s+/gm, '')         // Remove numbered list markers
        .replace(/\n{2,}/g, '\n')              // Collapse blank lines
        .trim();

    // Protect non-sentence-ending dots by replacing with placeholder
    const PLACEHOLDER = '\u0000';
    plain = plain
        .replace(URL_REGEX, match => match.replace(/\./g, PLACEHOLDER))           // URLs
        .replace(DECIMAL_REGEX, `$1${PLACEHOLDER}$2`)                              // Decimals
        .replace(ACRONYM_DOTS_REGEX, match => match.replace(/\./g, PLACEHOLDER))  // Acronyms
        .replace(ABBREVIATION_REGEX, (match) => match.replace('.', PLACEHOLDER))  // Abbreviations
        .replace(ELLIPSIS_REGEX, match => match.replace(/\./g, PLACEHOLDER));     // Ellipsis

    // Split on sentence boundaries: .!? followed by whitespace and uppercase
    const sentences = plain
        .split(SENTENCE_BOUNDARY_REGEX)
        .map(s => s.replace(new RegExp(PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '.').trim())
        .filter(s => s.length > 0 && s.split(/\s+/).length >= 3); // Min 3 words to count

    if (sentences.length < 5) {
        // Not enough sentences to meaningfully measure
        return { avgLength: 0, stdDev: 0, score: 1, pass: true, sentenceCount: sentences.length };
    }

    const lengths = sentences.map(s => s.split(/\s+/).length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    const variance = lengths.reduce((sum, len) => sum + (len - avgLength) ** 2, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    const score = avgLength > 0 ? stdDev / avgLength : 0;
    const pass = score >= 0.35;

    return { avgLength, stdDev, score, pass, sentenceCount: sentences.length };
}

// ─── Shared: Markdown → plain text normalization ────────────────────────────

function normalizeMarkdownToPlain(markdown: string): string {
    return markdown
        .toLowerCase()
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
        .replace(/[*_~`]+/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Task 3: Content Fingerprinting ─────────────────────────────────────────

/**
 * Build sorted top-100 3-gram hash array from markdown content.
 * This is the canonical representation stored in the DB and used for comparison.
 */
function buildNgramHashArray(markdown: string): string[] {
    const plain = normalizeMarkdownToPlain(markdown);
    const words = plain.split(' ').filter(Boolean);

    if (words.length < 3) return [];

    // Build 3-gram frequency map
    const ngramCounts = new Map<string, number>();
    for (let i = 0; i <= words.length - 3; i++) {
        const ngram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        ngramCounts.set(ngram, (ngramCounts.get(ngram) || 0) + 1);
    }

    // Take top 100 by frequency, then alphabetical for stability
    const sorted = [...ngramCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 100);

    // Hash each ngram and sort for stable comparison
    return sorted
        .map(([ngram]) => createHash('sha256').update(ngram).digest('hex').slice(0, 16))
        .sort();
}

/**
 * Generate a content fingerprint from the top 100 most-frequent 3-grams.
 *
 * The fingerprint is a hex string that can be stored in the DB and later
 * compared across articles for cross-domain duplication detection.
 */
export function generateContentFingerprint(markdown: string): string {
    const hashes = buildNgramHashArray(markdown);

    if (hashes.length === 0) {
        return createHash('sha256').update(normalizeMarkdownToPlain(markdown)).digest('hex');
    }

    return createHash('sha256').update(hashes.join('')).digest('hex');
}

/**
 * Extract the top-100 3-gram hashes as a sorted string array.
 * This is stored in articles.contentNgramHashes for efficient Jaccard comparison
 * without needing to load the full article content.
 */
export function extractNgramHashes(markdown: string): string[] {
    return buildNgramHashArray(markdown);
}

/**
 * Compute Jaccard similarity between two sorted ngram hash arrays.
 * Uses a merge-intersection approach since both arrays are sorted.
 */
export function computeJaccardSimilarity(hashesA: string[], hashesB: string[]): number {
    if (hashesA.length === 0 && hashesB.length === 0) return 0;

    // Merge-intersection on sorted arrays — O(n + m)
    let i = 0;
    let j = 0;
    let intersection = 0;

    while (i < hashesA.length && j < hashesB.length) {
        const cmp = hashesA[i].localeCompare(hashesB[j]);
        if (cmp === 0) {
            intersection++;
            i++;
            j++;
        } else if (cmp < 0) {
            i++;
        } else {
            j++;
        }
    }

    const union = hashesA.length + hashesB.length - intersection;
    return union > 0 ? intersection / union : 0;
}

// ─── Cross-Domain Duplication Check ─────────────────────────────────────────

export interface DuplicationResult {
    articleId: string;
    domainId: string;
    similarity: number;
}

/**
 * Check an article's content against other domains' articles for duplication.
 *
 * Uses pre-computed contentNgramHashes stored in the DB instead of loading
 * full article content. Falls back to contentFingerprint exact-match if
 * ngram hashes aren't available.
 *
 * Flags any pair with Jaccard similarity > 40%.
 * This is log-only — does not block the pipeline.
 */
export async function checkCrossDomainDuplication(
    articleId: string,
    domainId: string,
    sourceNgramHashes: string[],
): Promise<DuplicationResult[]> {
    if (sourceNgramHashes.length === 0) return [];

    // Query pre-computed ngram hashes from other domains (limit to last 500)
    const candidates = await db
        .select({
            id: articles.id,
            domainId: articles.domainId,
            contentNgramHashes: articles.contentNgramHashes,
        })
        .from(articles)
        .where(
            sql`${articles.domainId} != ${domainId} AND ${articles.contentNgramHashes} IS NOT NULL`,
        )
        .orderBy(sql`${articles.createdAt} DESC`)
        .limit(500);

    const duplicates: DuplicationResult[] = [];

    for (const candidate of candidates) {
        const candidateHashes = candidate.contentNgramHashes;
        if (!candidateHashes || candidateHashes.length === 0) continue;

        const similarity = computeJaccardSimilarity(sourceNgramHashes, candidateHashes);

        if (similarity > 0.4) {
            duplicates.push({
                articleId: candidate.id,
                domainId: candidate.domainId,
                similarity,
            });
            console.warn(
                `[ContentScanner] Cross-domain duplication detected: article ${articleId} `
                + `has ${(similarity * 100).toFixed(1)}% similarity with article ${candidate.id} `
                + `(domain ${candidate.domainId})`,
            );
        }
    }

    return duplicates;
}
