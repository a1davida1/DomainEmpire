/**
 * Block Content Scanner — applies the banned-word / burstiness pipeline
 * from content-scanner.ts to individual block content fields.
 *
 * Extracts text from block content JSON, runs the scanner, and when
 * violations are found, makes a targeted AI call to rewrite just the
 * offending text while preserving structure.
 */

import { scanForBannedPatterns, measureBurstiness, type BannedPatternViolation } from '@/lib/ai/content-scanner';
import { getAIClient } from '@/lib/ai/openrouter';
import type { BlockEnvelope } from './blocks/schemas';

export interface BlockScanResult {
    violations: BannedPatternViolation[];
    lowBurstiness: boolean;
    extractedText: string;
}

export interface BlockRewriteResult {
    rewritten: boolean;
    block: BlockEnvelope;
    aiCalls: number;
    cost: number;
}

const TEXT_FIELDS = ['heading', 'subheading', 'description', 'bio', 'markdown', 'body', 'text', 'content', 'badge'] as const;
const ARRAY_TEXT_FIELDS = ['items', 'features', 'benefits', 'steps', 'testimonials', 'plans'] as const;

function extractTextFromBlock(block: BlockEnvelope): string {
    const content = (block.content || {}) as Record<string, unknown>;
    const parts: string[] = [];

    for (const field of TEXT_FIELDS) {
        const val = content[field];
        if (typeof val === 'string' && val.length > 3) {
            parts.push(val);
        }
    }

    for (const field of ARRAY_TEXT_FIELDS) {
        const arr = content[field];
        if (Array.isArray(arr)) {
            for (const item of arr) {
                if (typeof item === 'string') {
                    parts.push(item);
                } else if (item && typeof item === 'object') {
                    const obj = item as Record<string, unknown>;
                    for (const key of ['question', 'answer', 'text', 'description', 'title', 'name', 'body', 'content', 'label', 'detail']) {
                        if (typeof obj[key] === 'string') parts.push(obj[key] as string);
                    }
                }
            }
        }
    }

    // ComparisonTable rows
    const rows = content.rows;
    if (Array.isArray(rows)) {
        for (const row of rows) {
            if (row && typeof row === 'object') {
                const r = row as Record<string, unknown>;
                for (const v of Object.values(r)) {
                    if (typeof v === 'string' && v.length > 3) parts.push(v);
                }
            }
        }
    }

    return parts.join('\n');
}

/**
 * Scan a single block for banned patterns and burstiness issues.
 */
export function scanBlocksForBannedPatterns(block: BlockEnvelope): BlockScanResult {
    const text = extractTextFromBlock(block);
    if (text.length < 20) {
        return { violations: [], lowBurstiness: false, extractedText: text };
    }

    const violations = scanForBannedPatterns(text);

    let lowBurstiness = false;
    if (block.type === 'ArticleBody') {
        const burstiness = measureBurstiness(text);
        lowBurstiness = !burstiness.pass;
    }

    return { violations, lowBurstiness, extractedText: text };
}

/**
 * Rewrite block text to eliminate banned patterns.
 * Uses a targeted AI call that receives the block content JSON and the violations,
 * returning a cleaned version with the same structure.
 */
export async function rewriteBlockText(
    block: BlockEnvelope,
    violations: BannedPatternViolation[],
    niche: string,
): Promise<BlockRewriteResult> {
    const content = block.content as Record<string, unknown> | undefined;
    if (!content) return { rewritten: false, block, aiCalls: 0, cost: 0 };

    const violationList = violations
        .map(v => `- "${v.pattern}" (${v.category}, line ${v.line})`)
        .join('\n');

    const prompt = `You are editing JSON content for a ${niche} website block (type: ${block.type}).

The following AI-detection fingerprint patterns were found and MUST be replaced with natural alternatives:

${violationList}

RULES:
- Replace each flagged word/phrase with a natural, non-AI-sounding alternative
- Keep the EXACT same JSON structure and field names
- Do NOT add new fields or remove existing ones
- Do NOT change factual content, only rephrase the flagged patterns
- Write in a conversational, human tone
- Vary sentence lengths (mix short and long)
- Return ONLY valid JSON, no markdown fences

INPUT:
${JSON.stringify(content, null, 2)}`;

    try {
        const ai = getAIClient();
        const resp = await ai.generate('blockContent', prompt);

        let jsonStr = resp.content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const firstBrace = jsonStr.indexOf('{');
        if (firstBrace > 0 && firstBrace < 200) {
            jsonStr = jsonStr.slice(firstBrace);
        }

        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        const updatedBlock: BlockEnvelope = { ...block, content: parsed };

        // Verify the rewrite actually removed violations
        const recheck = scanBlocksForBannedPatterns(updatedBlock);
        if (recheck.violations.length < violations.length) {
            return { rewritten: true, block: updatedBlock, aiCalls: 1, cost: resp.cost };
        }

        // Rewrite didn't help enough — return original to avoid regression
        return { rewritten: false, block, aiCalls: 1, cost: resp.cost };
    } catch (err) {
        console.error(`[block-content-scanner] Rewrite failed for ${block.type}:`, err instanceof Error ? err.message : err);
        return { rewritten: false, block, aiCalls: 1, cost: 0 };
    }
}
