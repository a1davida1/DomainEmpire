import { withRetry } from '@/lib/tpilot/core/retry';

const GPTZERO_API_URL = 'https://api.gptzero.me/v2/predict/text';
const GPTZERO_TIMEOUT_MS = 30_000;

// Thresholds for AI detection scoring
const PASS_THRESHOLD = 0.30;
const MARGINAL_THRESHOLD = 0.50;

export type DetectionVerdict = 'pass' | 'marginal' | 'fail';

export interface AIDetectionResult {
    averageGeneratedProb: number;
    overallBurstiness: number;
    sentences: Array<{
        sentence: string;
        generatedProb: number;
        perplexity: number;
    }>;
    verdict: DetectionVerdict;
    raw: unknown;
}

/**
 * Check content for AI-generated probability via GPTZero API.
 */
export async function checkAIDetection(text: string): Promise<AIDetectionResult> {
    const apiKey = process.env.GPTZERO_API_KEY?.trim() || '';
    if (apiKey.length === 0) {
        throw new Error('GPTZERO_API_KEY environment variable is not set');
    }

    const result = await withRetry(
        async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), GPTZERO_TIMEOUT_MS);

            try {
                const response = await fetch(GPTZERO_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                    },
                    body: JSON.stringify({ document: text }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const err = new Error(`GPTZero API error: ${response.status} - ${errorText}`);
                    (err as Error & { status?: number }).status = response.status;
                    throw err;
                }

                return await response.json();
            } finally {
                clearTimeout(timeout);
            }
        },
        {
            maxRetries: 2,
            baseDelayMs: 2000,
            maxDelayMs: 10_000,
            label: 'gptzero',
            retryOn: (error: unknown) => {
                if (error instanceof Error) {
                    const status = (error as Error & { status?: number }).status;
                    if (status === 429 || (status && status >= 500)) return true;
                    const msg = error.message.toLowerCase();
                    return msg.includes('fetch failed') || msg.includes('timeout') || msg.includes('aborted');
                }
                return false;
            },
        },
    );

    const avgProb: number = typeof result?.documents?.[0]?.average_generated_prob === 'number'
        ? result.documents[0].average_generated_prob
        : 0;

    const burstiness: number = typeof result?.documents?.[0]?.overall_burstiness === 'number'
        ? result.documents[0].overall_burstiness
        : 0;

    const sentences: AIDetectionResult['sentences'] = Array.isArray(result?.documents?.[0]?.sentences)
        ? result.documents[0].sentences.map((s: { sentence?: string; generated_prob?: number; perplexity?: number }) => ({
            sentence: s.sentence || '',
            generatedProb: s.generated_prob || 0,
            perplexity: s.perplexity || 0,
        }))
        : [];

    return {
        averageGeneratedProb: avgProb,
        overallBurstiness: burstiness,
        sentences,
        verdict: getVerdict(avgProb),
        raw: result,
    };
}

function getVerdict(score: number): DetectionVerdict {
    if (score < PASS_THRESHOLD) return 'pass';
    if (score < MARGINAL_THRESHOLD) return 'marginal';
    return 'fail';
}

/**
 * Determine if GPTZero API key is configured.
 */
export function isAIDetectionEnabled(): boolean {
    return typeof process.env.GPTZERO_API_KEY === 'string' && process.env.GPTZERO_API_KEY.trim().length > 0;
}
