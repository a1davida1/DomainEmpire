/**
 * Block Renderer Registry — shared registry that breaks the circular dependency
 * between assembler.ts (which uses renderers) and renderers-interactive.ts
 * (which registers renderers).
 *
 * Both modules import from this file instead of from each other.
 */

import type { BlockEnvelope, BlockType } from './schemas';
import type { RenderContext } from './assembler';

export type BlockRenderer = (block: BlockEnvelope, ctx: RenderContext) => string;

const renderers: Partial<Record<BlockType, BlockRenderer>> = {};

/**
 * Register a renderer for a block type. Called by renderer modules at import time.
 */
export function registerBlockRenderer(type: BlockType, renderer: BlockRenderer): void {
    renderers[type] = renderer;
}

/**
 * Get the renderer for a block type. Returns undefined if not registered.
 */
export function getBlockRenderer(type: BlockType): BlockRenderer | undefined {
    return renderers[type];
}

/**
 * Get all registered renderer type names (for debugging).
 */
export function getRegisteredBlockTypes(): BlockType[] {
    return Object.keys(renderers) as BlockType[];
}
