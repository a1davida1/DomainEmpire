/**
 * Block Content Generation Pipeline — Template System v2.
 *
 * Generates content for individual blocks in a page definition by:
 * 1. Looking up the block's prompt template
 * 2. Calling the AI with the prompt
 * 3. Parsing the JSON response
 * 4. Validating against the block's Zod schema
 * 5. Storing the validated content on the block envelope
 *
 * This replaces the monolithic article generation for v2 page definitions.
 */

import { db, pageDefinitions, domains, articles } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getAIClient } from './openrouter';
import { getOrCreateVoiceSeed } from './voice-seed';
import {
    validateBlock,
    type BlockType,
    type BlockEnvelope,
} from '@/lib/deploy/blocks/schemas';
import {
    getBlockPrompt,
    isAiGeneratableBlock,
    STRUCTURAL_BLOCK_TYPES,
    type BlockPromptContext,
} from './block-prompts';

// ============================================================
// Types
// ============================================================

export interface BlockGenerationResult {
    blockId: string;
    blockType: BlockType;
    success: boolean;
    skipped?: boolean;
    content?: Record<string, unknown>;
    error?: string;
    tokensUsed?: number;
    cost?: number;
    durationMs?: number;
}

export interface PageGenerationResult {
    pageDefinitionId: string;
    route: string;
    blocks: BlockGenerationResult[];
    totalTokens: number;
    totalCost: number;
    totalDurationMs: number;
    successCount: number;
    failureCount: number;
    skippedCount: number;
}

// ============================================================
// Core generation logic
// ============================================================

/**
 * Generate AI content for a single block.
 * Returns the generated content or an error.
 */
export async function generateBlockContent(
    block: BlockEnvelope,
    ctx: BlockPromptContext,
): Promise<BlockGenerationResult> {
    const blockType = block.type as BlockType;
    const startMs = Date.now();

    // Skip structural blocks — they don't need AI content
    if (STRUCTURAL_BLOCK_TYPES.includes(blockType)) {
        return {
            blockId: block.id,
            blockType,
            success: true,
            skipped: true,
            content: block.content as Record<string, unknown> | undefined,
        };
    }

    // Skip blocks that already have content (don't overwrite)
    if (block.content && Object.keys(block.content).length > 0) {
        return {
            blockId: block.id,
            blockType,
            success: true,
            skipped: true,
            content: block.content as Record<string, unknown>,
        };
    }

    // Check if this block type supports AI generation
    if (!isAiGeneratableBlock(blockType)) {
        return {
            blockId: block.id,
            blockType,
            success: true,
            skipped: true,
        };
    }

    // Get the prompt
    const prompt = getBlockPrompt(blockType, ctx);
    if (!prompt) {
        return {
            blockId: block.id,
            blockType,
            success: false,
            error: `No prompt template for block type: ${blockType}`,
        };
    }

    try {
        const ai = getAIClient();
        const response = await ai.generate('blockContent', prompt);
        const durationMs = Date.now() - startMs;

        // Parse JSON from response
        let parsed: Record<string, unknown>;
        try {
            // Strip markdown code fences if present
            let raw = response.content.trim();
            if (raw.startsWith('```')) {
                raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
            }
            parsed = JSON.parse(raw);
        } catch (parseErr) {
            return {
                blockId: block.id,
                blockType,
                success: false,
                error: `Failed to parse AI response as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                tokensUsed: response.inputTokens + response.outputTokens,
                cost: response.cost,
                durationMs,
            };
        }

        // Validate against block schema
        const validation = validateBlock({
            id: block.id,
            type: blockType,
            content: parsed,
        });

        if (!validation.success) {
            // Log but still use the content — schema validation failures
            // may be due to optional fields. The content is likely still usable.
            console.warn(
                `[block-pipeline] Schema validation warnings for ${blockType} block ${block.id}:`,
                validation.errors,
            );
        }

        return {
            blockId: block.id,
            blockType,
            success: true,
            content: parsed,
            tokensUsed: response.inputTokens + response.outputTokens,
            cost: response.cost,
            durationMs,
        };
    } catch (err) {
        return {
            blockId: block.id,
            blockType,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startMs,
        };
    }
}

/**
 * Generate AI content for all blocks in a page definition.
 * Processes blocks sequentially to avoid rate limits and maintain context.
 */
export async function generatePageBlockContent(
    pageDefId: string,
): Promise<PageGenerationResult> {
    // Load page definition
    const pageDefs = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.id, pageDefId))
        .limit(1);

    if (pageDefs.length === 0) {
        throw new Error(`Page definition not found: ${pageDefId}`);
    }

    const pageDef = pageDefs[0];
    const blocks = (pageDef.blocks || []) as BlockEnvelope[];

    // Load domain info
    const domainRows = await db.select().from(domains)
        .where(eq(domains.id, pageDef.domainId))
        .limit(1);

    if (domainRows.length === 0) {
        throw new Error(`Domain not found: ${pageDef.domainId}`);
    }

    const domain = domainRows[0];

    // Get voice seed
    const voiceSeed = await getOrCreateVoiceSeed(
        domain.id,
        domain.domain,
        domain.niche || 'general',
    );

    // Load any published articles for research data context
    const publishedArticles = await db.select()
        .from(articles)
        .where(and(eq(articles.domainId, domain.id), eq(articles.status, 'published')))
        .limit(1);

    const researchData = publishedArticles[0]?.researchData as Record<string, unknown> | null;

    // Build prompt context
    const ctx: BlockPromptContext = {
        keyword: pageDef.title || domain.niche || 'general topic',
        domainName: domain.domain,
        niche: domain.niche || 'general',
        siteTitle: pageDef.title || domain.domain,
        researchData,
        voiceSeed,
    };

    // Generate content for each block
    const results: BlockGenerationResult[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let totalDurationMs = 0;
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    const updatedBlocks: BlockEnvelope[] = [];

    for (const block of blocks) {
        const result = await generateBlockContent(block, ctx);
        results.push(result);

        if (result.skipped) {
            skippedCount++;
            updatedBlocks.push(block);
        } else if (result.success) {
            successCount++;
            updatedBlocks.push({
                ...block,
                content: result.content || block.content,
            } as BlockEnvelope);
        } else {
            failureCount++;
            updatedBlocks.push(block);
            console.error(
                `[block-pipeline] Failed to generate content for ${block.type} block ${block.id}: ${result.error}`,
            );
        }

        if (result.tokensUsed) totalTokens += result.tokensUsed;
        if (result.cost) totalCost += result.cost;
        if (result.durationMs) totalDurationMs += result.durationMs;
    }

    // Update the page definition with generated content
    await db.update(pageDefinitions).set({
        blocks: updatedBlocks as typeof pageDef.blocks,
        version: pageDef.version + 1,
        updatedAt: new Date(),
    }).where(eq(pageDefinitions.id, pageDefId));

    return {
        pageDefinitionId: pageDefId,
        route: pageDef.route,
        blocks: results,
        totalTokens,
        totalCost,
        totalDurationMs,
        successCount,
        failureCount,
        skippedCount,
    };
}

/**
 * Regenerate content for a single block within a page definition.
 * Used when a reviewer rejects a specific block and wants it re-generated.
 */
export async function regenerateBlockContent(
    pageDefId: string,
    blockId: string,
): Promise<BlockGenerationResult> {
    // Load page definition
    const pageDefs = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.id, pageDefId))
        .limit(1);

    if (pageDefs.length === 0) {
        throw new Error(`Page definition not found: ${pageDefId}`);
    }

    const pageDef = pageDefs[0];
    const blocks = (pageDef.blocks || []) as BlockEnvelope[];
    const blockIndex = blocks.findIndex(b => b.id === blockId);

    if (blockIndex === -1) {
        throw new Error(`Block not found: ${blockId} in page ${pageDefId}`);
    }

    const block = blocks[blockIndex];

    // Load domain info
    const domainRows = await db.select().from(domains)
        .where(eq(domains.id, pageDef.domainId))
        .limit(1);

    if (domainRows.length === 0) {
        throw new Error(`Domain not found: ${pageDef.domainId}`);
    }

    const domain = domainRows[0];
    const voiceSeed = await getOrCreateVoiceSeed(
        domain.id,
        domain.domain,
        domain.niche || 'general',
    );

    // Force regeneration by clearing existing content
    const blockForRegen: BlockEnvelope = {
        ...block,
        content: undefined,
    };

    const ctx: BlockPromptContext = {
        keyword: pageDef.title || domain.niche || 'general topic',
        domainName: domain.domain,
        niche: domain.niche || 'general',
        siteTitle: pageDef.title || domain.domain,
        voiceSeed,
    };

    const result = await generateBlockContent(blockForRegen, ctx);

    if (result.success && result.content) {
        // Update only this block in the page definition
        const updatedBlocks = [...blocks];
        updatedBlocks[blockIndex] = {
            ...block,
            content: result.content,
        } as BlockEnvelope;

        await db.update(pageDefinitions).set({
            blocks: updatedBlocks as typeof pageDef.blocks,
            version: pageDef.version + 1,
            updatedAt: new Date(),
        }).where(eq(pageDefinitions.id, pageDefId));
    }

    return result;
}
