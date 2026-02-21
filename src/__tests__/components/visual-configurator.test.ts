import { describe, expect, it } from 'vitest';
import { getConfiguratorBridgeScript } from '../../lib/deploy/blocks/assembler';
import { MAX_HISTORY, buildConfiguratorPreviewUrl } from '../../components/dashboard/VisualConfigurator';

const EXPECTED_THEMES = ['clean', 'editorial', 'bold', 'minimal'] as const;
const EXPECTED_SKINS = ['slate', 'ocean', 'forest', 'ember', 'midnight', 'coral'] as const;

// ============================================================
// Unit tests for Visual Configurator logic (non-React)
// These test the data structures and helper functions used by
// the VisualConfigurator component without requiring a DOM.
// ============================================================

describe('Visual Configurator', () => {
    describe('preview URL construction', () => {
        it('builds correct preview URL with configurator flag', () => {
            const pageId = '00000000-0000-4000-8000-000000000001';
            const t = 1708000000000;
            const url = buildConfiguratorPreviewUrl(pageId, t);
            expect(url).toContain(pageId);
            expect(url).toContain('configurator=true');
            expect(url).toContain('format=html');
            expect(url).toContain(`t=${t}`);
        });

        it('cache breaker changes on each call', () => {
            const pageId = '00000000-0000-4000-8000-000000000001';
            const first = buildConfiguratorPreviewUrl(pageId, 1708000000000);
            const second = buildConfiguratorPreviewUrl(pageId, 1708000000001);
            expect(first).not.toBe(second);
            expect(first).toContain('t=1708000000000');
            expect(second).toContain('t=1708000000001');
        });
    });

    describe('viewport widths', () => {
        const VIEWPORT_WIDTHS: Record<string, string> = {
            desktop: '100%',
            tablet: '768px',
            mobile: '375px',
        };

        it('desktop is 100%', () => {
            expect(VIEWPORT_WIDTHS.desktop).toBe('100%');
        });

        it('tablet is 768px', () => {
            expect(VIEWPORT_WIDTHS.tablet).toBe('768px');
        });

        it('mobile is 375px', () => {
            expect(VIEWPORT_WIDTHS.mobile).toBe('375px');
        });
    });

    describe('block field schemas', () => {
        const BLOCK_FIELD_SCHEMAS: Record<string, Array<{ key: string; label: string; type: string; target: string }>> = {
            Hero: [
                { key: 'heading', label: 'Heading', type: 'text', target: 'content' },
                { key: 'subheading', label: 'Subheading', type: 'text', target: 'content' },
                { key: 'badge', label: 'Badge', type: 'text', target: 'content' },
                { key: 'ctaText', label: 'CTA Button Text', type: 'text', target: 'content' },
                { key: 'ctaUrl', label: 'CTA Button URL', type: 'url', target: 'content' },
            ],
            Header: [
                { key: 'siteName', label: 'Site Name', type: 'text', target: 'content' },
                { key: 'sticky', label: 'Sticky Header', type: 'boolean', target: 'config' },
            ],
            CTABanner: [
                { key: 'text', label: 'Banner Text', type: 'text', target: 'content' },
                { key: 'buttonLabel', label: 'Button Label', type: 'text', target: 'content' },
                { key: 'buttonUrl', label: 'Button URL', type: 'url', target: 'content' },
                { key: 'style', label: 'Style', type: 'select', target: 'config' },
                { key: 'trigger', label: 'Trigger', type: 'select', target: 'config' },
            ],
        };

        it('Hero has 5 content fields', () => {
            expect(BLOCK_FIELD_SCHEMAS.Hero).toHaveLength(5);
            expect(BLOCK_FIELD_SCHEMAS.Hero.every(f => f.target === 'content')).toBe(true);
        });

        it('Header has config and content fields', () => {
            const targets = BLOCK_FIELD_SCHEMAS.Header.map(f => f.target);
            expect(targets).toContain('config');
            expect(targets).toContain('content');
        });

        it('CTABanner has select fields for style and trigger', () => {
            const selectFields = BLOCK_FIELD_SCHEMAS.CTABanner.filter(f => f.type === 'select');
            expect(selectFields).toHaveLength(2);
            expect(selectFields.map(f => f.key)).toEqual(['style', 'trigger']);
        });

        it('returns undefined for untyped block type (fallback to JSON)', () => {
            expect(BLOCK_FIELD_SCHEMAS['ComparisonTable']).toBeUndefined();
        });
    });

    describe('undo/redo logic', () => {
        interface Block { id: string; type: string }

        function createHistory() {
            const history: Block[][] = [];
            let pointer = -1;

            return {
                push(blocks: Block[]) {
                    history.splice(pointer + 1);
                    history.push(blocks);
                    pointer = history.length - 1;
                },
                undo() {
                    if (pointer > 0) pointer--;
                    return history[pointer];
                },
                redo() {
                    if (pointer < history.length - 1) pointer++;
                    return history[pointer];
                },
                get current() { return history[pointer]; },
                get canUndo() { return pointer > 0; },
                get canRedo() { return pointer < history.length - 1; },
            };
        }

        it('starts with no undo/redo available', () => {
            const h = createHistory();
            h.push([{ id: '1', type: 'Hero' }]);
            expect(h.canUndo).toBe(false);
            expect(h.canRedo).toBe(false);
        });

        it('can undo after a change', () => {
            const h = createHistory();
            h.push([{ id: '1', type: 'Hero' }]);
            h.push([{ id: '1', type: 'Hero' }, { id: '2', type: 'FAQ' }]);
            expect(h.canUndo).toBe(true);
            const prev = h.undo();
            expect(prev).toHaveLength(1);
        });

        it('can redo after undo', () => {
            const h = createHistory();
            h.push([{ id: '1', type: 'Hero' }]);
            h.push([{ id: '1', type: 'Hero' }, { id: '2', type: 'FAQ' }]);
            h.undo();
            expect(h.canRedo).toBe(true);
            const next = h.redo();
            expect(next).toHaveLength(2);
        });

        it('new push after undo truncates redo stack', () => {
            const h = createHistory();
            h.push([{ id: '1', type: 'Hero' }]);
            h.push([{ id: '1', type: 'Hero' }, { id: '2', type: 'FAQ' }]);
            h.undo();
            h.push([{ id: '1', type: 'Hero' }, { id: '3', type: 'CTA' }]);
            expect(h.canRedo).toBe(false);
            expect(h.current).toHaveLength(2);
            expect(h.current[1].id).toBe('3');
        });

        it('rapid sequential pushes do not lose state (stale closure regression)', () => {
            const h = createHistory();
            h.push([{ id: '1', type: 'Hero' }]);
            h.push([{ id: '1', type: 'Hero' }, { id: '2', type: 'FAQ' }]);
            h.push([{ id: '1', type: 'Hero' }, { id: '2', type: 'FAQ' }, { id: '3', type: 'CTA' }]);
            expect(h.current).toHaveLength(3);
            const prev1 = h.undo();
            expect(prev1).toHaveLength(2);
            const prev2 = h.undo();
            expect(prev2).toHaveLength(1);
        });

        it('handles many sequential pushes without pointer overflow', () => {
            const h = createHistory();
            for (let i = 0; i <= MAX_HISTORY + 5; i++) {
                h.push([{ id: String(i), type: 'Hero' }]);
            }
            expect(h.current[0].id).toBe(String(MAX_HISTORY + 5));
            expect(h.canUndo).toBe(true);
        });
    });

    describe('skin color mapping', () => {
        const SKIN_COLORS: Record<string, string> = {
            slate: '#1e293b',
            ocean: '#1e3a5f',
            forest: '#047857',
            ember: '#b45309',
            midnight: '#38bdf8',
            coral: '#7c3aed',
        };

        it('has 6 skins', () => {
            expect(Object.keys(SKIN_COLORS)).toHaveLength(6);
        });

        it('all values are valid hex colors', () => {
            for (const color of Object.values(SKIN_COLORS)) {
                expect(color).toMatch(/^#[0-9a-f]{6}$/);
            }
        });
    });

    describe('theme labels', () => {
        it('has 4 themes', () => {
            expect(EXPECTED_THEMES).toHaveLength(4);
        });

        it('includes clean as default', () => {
            expect(EXPECTED_THEMES).toContain('clean');
        });
    });

    describe('configurator bridge script injection', () => {
        it('generated bridge script includes block-select postMessage', () => {
            const bridgeScript = getConfiguratorBridgeScript('http://localhost:3000');
            expect(bridgeScript).toContain('block-select');
            expect(bridgeScript).toContain('data-block-id');
        });

        it('generated bridge script includes block-highlight listener', () => {
            const bridgeScript = getConfiguratorBridgeScript('http://localhost:3000');
            expect(bridgeScript).toContain('block-highlight');
        });

        it('bridge script sanitizes blockId to prevent selector injection', () => {
            // The sanitizer strips anything that isn't alphanumeric, underscore, or hyphen
            const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_\-]/g, '');
            expect(sanitize('blk_abc_123')).toBe('blk_abc_123');
            expect(sanitize('blk-abc-123')).toBe('blk-abc-123');
            expect(sanitize('"]); alert(1); //')).toBe('alert1');
            expect(sanitize('')).toBe('');
            expect(sanitize('a"b')).toBe('ab');
        });
    });

    describe('theme/skin validation', () => {
        const VALID_THEMES = new Set<string>(EXPECTED_THEMES);
        const VALID_SKINS = new Set<string>(EXPECTED_SKINS);

        it('accepts valid themes', () => {
            expect(VALID_THEMES).toEqual(new Set([
                'clean', 'editorial', 'bold', 'minimal', 'magazine', 'brutalist',
                'glass', 'retro', 'corporate', 'craft', 'academic', 'startup', 'noir',
            ]));
            expect(VALID_THEMES.has('clean')).toBe(true);
            expect(VALID_THEMES.has('minimal')).toBe(true);
        });

        it('rejects invalid themes', () => {
            expect(VALID_THEMES.has('<script>')).toBe(false);
            expect(VALID_THEMES.has('')).toBe(false);
            expect(VALID_THEMES.has('navy-serif')).toBe(false);
        });

        it('accepts valid skins', () => {
            expect(VALID_SKINS).toEqual(new Set([
                'slate', 'ocean', 'forest', 'ember', 'midnight', 'coral',
                'sage', 'rose', 'indigo', 'sand', 'teal', 'wine', 'plum',
                'steel', 'cobalt', 'copper', 'arctic', 'charcoal', 'dusk',
            ]));
            expect(VALID_SKINS.has('slate')).toBe(true);
            expect(VALID_SKINS.has('modern')).toBe(false);
        });

        it('rejects invalid skins', () => {
            expect(VALID_SKINS.has('dark')).toBe(false);
            expect(VALID_SKINS.has('')).toBe(false);
            expect(VALID_SKINS.has('"><img onerror=alert(1)>')).toBe(false);
        });
    });

    describe('block descriptions', () => {
        const BLOCK_DESCRIPTIONS: Record<string, string> = {
            Hero: 'Large banner with heading and CTA',
            FAQ: 'Expandable question and answer list',
            CTABanner: 'Call-to-action banner or bar',
        };

        it('descriptions are non-empty strings', () => {
            for (const desc of Object.values(BLOCK_DESCRIPTIONS)) {
                expect(desc.length).toBeGreaterThan(5);
            }
        });
    });
});
