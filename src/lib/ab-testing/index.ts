/**
 * A/B testing framework.
 * Create tests, record events, evaluate significance.
 */

import { db, abTests } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import type { NewAbTest } from '@/lib/db/schema';

interface Variant {
    id: string;
    value: string;
    impressions: number;
    clicks: number;
    conversions: number;
}

/**
 * Create a new A/B test for an article.
 */
export async function createTest(
    articleId: string,
    testType: 'title' | 'meta_description' | 'cta',
    variantValues: string[],
) {
    if (variantValues.length < 2) throw new Error('Need at least 2 variants');

    const variants: Variant[] = variantValues.map((value, i) => ({
        id: `v${i}`,
        value,
        impressions: 0,
        clicks: 0,
        conversions: 0,
    }));

    const record: NewAbTest = {
        articleId,
        testType,
        variants,
        status: 'active',
    };

    const result = await db.insert(abTests).values(record).returning();
    return result[0];
}

/**
 * Record an impression for a variant.
 */
export async function recordImpression(testId: string, variantId: string) {
    return updateVariantStat(testId, variantId, 'impressions');
}

/**
 * Record a click for a variant.
 */
export async function recordClick(testId: string, variantId: string) {
    return updateVariantStat(testId, variantId, 'clicks');
}

/**
 * Record a conversion for a variant.
 */
export async function recordConversion(testId: string, variantId: string) {
    return updateVariantStat(testId, variantId, 'conversions');
}

async function updateVariantStat(testId: string, variantId: string, stat: 'impressions' | 'clicks' | 'conversions') {
    return await db.transaction(async (tx) => {
        // Lock the row for update
        const test = await tx.select().from(abTests)
            .where(and(eq(abTests.id, testId), eq(abTests.status, 'active')))
            .for('update')
            .limit(1);

        if (test.length === 0) return null;

        const variants = test[0].variants as Variant[];
        const variantIndex = variants.findIndex(v => v.id === variantId);
        if (variantIndex === -1) return null;

        // Clone to avoid mutation issues if cached (though Drizzle returns fresh objects)
        const updatedVariants = [...variants];
        const updatedVariant = { ...updatedVariants[variantIndex] };

        updatedVariant[stat]++;
        updatedVariants[variantIndex] = updatedVariant;

        await tx.update(abTests)
            .set({ variants: updatedVariants })
            .where(eq(abTests.id, testId));

        return updatedVariant;
    });
}

/**
 * Evaluate test for statistical significance.
 * Uses chi-squared test approximation.
 * If confidence > 95%, declares a winner.
 */
export async function evaluateTest(testId: string) {
    const test = await db.select().from(abTests).where(eq(abTests.id, testId)).limit(1);
    if (test.length === 0) return null;

    const variants = test[0].variants as Variant[];
    if (variants.length < 2) return null;

    const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
    const totalClicks = variants.reduce((s, v) => s + v.clicks, 0);

    if (totalImpressions < 100) {
        return { significant: false, confidence: 0, message: 'Not enough data (need 100+ impressions)' };
    }

    // Chi-squared test for click rates
    const expectedRate = totalClicks / totalImpressions;
    let chiSquared = 0;

    for (const variant of variants) {
        if (variant.impressions === 0) continue;
        const expectedClicks = variant.impressions * expectedRate;
        const expectedNonClicks = variant.impressions * (1 - expectedRate);
        if (expectedClicks > 0) {
            chiSquared += Math.pow(variant.clicks - expectedClicks, 2) / expectedClicks;
        }
        if (expectedNonClicks > 0) {
            const nonClicks = variant.impressions - variant.clicks;
            chiSquared += Math.pow(nonClicks - expectedNonClicks, 2) / expectedNonClicks;
        }
    }

    // With df=1 (2 variants), chi-squared > 3.84 = p < 0.05
    const df = variants.length - 1;
    const criticalValue = df === 1 ? 3.84 : df === 2 ? 5.99 : 7.81; // 95% for 1-3 df
    const confidence = Math.min(99, (chiSquared / criticalValue) * 95);
    const significant = chiSquared > criticalValue;

    if (significant) {
        // Find winner (highest CTR)
        let bestVariant = variants[0];
        let bestCtr = 0;
        for (const v of variants) {
            const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
            if (ctr > bestCtr) {
                bestCtr = ctr;
                bestVariant = v;
            }
        }

        await db.update(abTests).set({
            status: 'completed',
            winnerId: bestVariant.id,
            confidenceLevel: Math.round(confidence),
            completedAt: new Date(),
        }).where(eq(abTests.id, testId));

        return {
            significant: true,
            confidence: Math.round(confidence),
            winnerId: bestVariant.id,
            winnerValue: bestVariant.value,
            winnerCtr: bestCtr,
        };
    }

    return { significant: false, confidence: Math.round(confidence), message: 'Not yet significant' };
}

/**
 * Get active variant for a test using epsilon-greedy strategy.
 * 90% exploit (best performer), 10% explore (random).
 */
export function getActiveVariant(variants: Variant[]): Variant {
    if (variants.length === 0) throw new Error('No variants');

    const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);

    // Explore phase: random for first 50 impressions
    if (totalImpressions < 50) {
        return variants[Math.floor(Math.random() * variants.length)];
    }

    // Epsilon-greedy: 10% random, 90% best
    if (Math.random() < 0.1) {
        return variants[Math.floor(Math.random() * variants.length)];
    }

    // Best CTR
    let best = variants[0];
    let bestCtr = 0;
    for (const v of variants) {
        const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
        if (ctr > bestCtr) {
            bestCtr = ctr;
            best = v;
        }
    }
    return best;
}
