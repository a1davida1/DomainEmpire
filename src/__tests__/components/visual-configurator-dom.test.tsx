// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisualConfigurator } from '@/components/dashboard/VisualConfigurator';

// ============================================================
// Mocks
// ============================================================

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location.origin for postMessage checks
Object.defineProperty(window, 'location', {
    value: { origin: 'http://localhost:3000', href: 'http://localhost:3000' },
    writable: true,
});

// ============================================================
// Helpers
// ============================================================

const PAGE_ID = '00000000-0000-4000-8000-000000000001';
const DOMAIN_ID = 'd-test-001';

function makeBlocks(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        id: `blk_${i}`,
        type: i === 0 ? 'Hero' : i === 1 ? 'FAQ' : 'Footer',
        variant: i === 0 ? 'centered' : undefined,
        config: {},
        content: i === 0 ? { heading: 'Hello World' } : {},
    }));
}

function renderConfigurator(overrides = {}) {
    const defaults = {
        pageId: PAGE_ID,
        domainId: DOMAIN_ID,
        initialBlocks: makeBlocks(3),
        initialTheme: 'clean',
        initialSkin: 'slate',
        onSave: vi.fn(),
        onCancel: vi.fn(),
    };
    return render(<VisualConfigurator {...defaults} {...overrides} />);
}

// ============================================================
// Tests
// ============================================================

describe('VisualConfigurator DOM tests', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        // Default: return OK for any fetch
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });
    });

    afterEach(() => {
        cleanup();
    });

    describe('rendering', () => {
        it('renders the editor panel with block list', () => {
            renderConfigurator();
            // Should show block types in the list
            expect(screen.getByText('Hero')).toBeTruthy();
            expect(screen.getByText('FAQ')).toBeTruthy();
            expect(screen.getByText('Footer')).toBeTruthy();
        });

        it('renders the preview iframe with correct src', () => {
            renderConfigurator();
            const iframe = screen.getByTitle('Page preview') as HTMLIFrameElement;
            expect(iframe.src).toContain(`/api/pages/${PAGE_ID}/preview`);
            expect(iframe.src).toContain('configurator=true');
            expect(iframe.src).toContain('format=html');
        });

        it('renders theme and skin selectors', () => {
            renderConfigurator();
            const themeSelect = screen.getByTitle('Page theme') as HTMLSelectElement;
            const skinSelect = screen.getByTitle('Page skin') as HTMLSelectElement;
            expect(themeSelect.value).toBe('clean');
            expect(skinSelect.value).toBe('slate');
        });

        it('renders viewport toggle buttons', () => {
            renderConfigurator();
            expect(screen.getByText(/desktop/i)).toBeTruthy();
            expect(screen.getByText(/tablet/i)).toBeTruthy();
            expect(screen.getByText(/mobile/i)).toBeTruthy();
        });

        it('renders undo/redo buttons', () => {
            renderConfigurator();
            const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
            const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
            // Initially both should be disabled
            expect(undoBtn).toHaveProperty('disabled', true);
            expect(redoBtn).toHaveProperty('disabled', true);
        });

        it('renders Back button when onCancel provided', () => {
            renderConfigurator();
            expect(screen.getByText(/Back/)).toBeTruthy();
        });

        it('does not render Back button when onCancel is undefined', () => {
            renderConfigurator({ onCancel: undefined });
            expect(screen.queryByText(/Back/)).toBeNull();
        });

        it('renders + Add Block button', () => {
            renderConfigurator();
            expect(screen.getByText('+ Add Block')).toBeTruthy();
        });

        it('renders loading spinner initially for iframe', () => {
            renderConfigurator();
            expect(screen.getByText(/Loading preview/)).toBeTruthy();
        });
    });

    describe('block selection', () => {
        it('selects a block when clicked in the list', async () => {
            renderConfigurator();
            // Click the Hero block badge
            const heroBadges = screen.getAllByText('Hero');
            fireEvent.click(heroBadges[0].closest('[class*="cursor-pointer"]')!);
            // Config panel should appear with the block type
            await waitFor(() => {
                expect(screen.getByText('Regenerate Hero')).toBeTruthy();
            });
        });

        it('shows structured fields for Hero block', async () => {
            renderConfigurator();
            const heroBadges = screen.getAllByText('Hero');
            fireEvent.click(heroBadges[0].closest('[class*="cursor-pointer"]')!);
            await waitFor(() => {
                expect(screen.getByText('Heading')).toBeTruthy();
                expect(screen.getByText('Subheading')).toBeTruthy();
                expect(screen.getByText('CTA Button Text')).toBeTruthy();
            });
        });

        it('closes config panel when close button clicked', async () => {
            renderConfigurator();
            const heroBadges = screen.getAllByText('Hero');
            fireEvent.click(heroBadges[0].closest('[class*="cursor-pointer"]')!);
            await waitFor(() => {
                expect(screen.getByText('Regenerate Hero')).toBeTruthy();
            });
            // Click close
            fireEvent.click(screen.getByText(/Close/));
            await waitFor(() => {
                expect(screen.queryByText('Regenerate Hero')).toBeNull();
            });
        });
    });

    describe('theme/skin changes', () => {
        it('calls PATCH when theme is changed', async () => {
            renderConfigurator();
            const themeSelect = screen.getByTitle('Page theme') as HTMLSelectElement;
            fireEvent.change(themeSelect, { target: { value: 'bold' } });
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledWith(
                    `/api/pages/${PAGE_ID}`,
                    expect.objectContaining({
                        method: 'PATCH',
                        body: JSON.stringify({ theme: 'bold' }),
                    }),
                );
            });
        });

        it('calls PATCH when skin is changed', async () => {
            renderConfigurator();
            const skinSelect = screen.getByTitle('Page skin') as HTMLSelectElement;
            fireEvent.change(skinSelect, { target: { value: 'ocean' } });
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledWith(
                    `/api/pages/${PAGE_ID}`,
                    expect.objectContaining({
                        method: 'PATCH',
                        body: JSON.stringify({ skin: 'ocean' }),
                    }),
                );
            });
        });

        it('shows error when theme PATCH fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'Invalid theme' }),
            });
            renderConfigurator();
            const themeSelect = screen.getByTitle('Page theme') as HTMLSelectElement;
            fireEvent.change(themeSelect, { target: { value: 'bold' } });
            await waitFor(() => {
                expect(screen.getByText('Invalid theme')).toBeTruthy();
            });
        });
    });

    describe('save', () => {
        it('Save button is disabled when not dirty', () => {
            renderConfigurator();
            const saveBtn = screen.getByText('Save');
            expect(saveBtn.closest('button')).toHaveProperty('disabled', true);
        });

        it('Save button becomes enabled after editing', async () => {
            renderConfigurator();
            // Change theme to make dirty
            const themeSelect = screen.getByTitle('Page theme') as HTMLSelectElement;
            fireEvent.change(themeSelect, { target: { value: 'bold' } });
            await waitFor(() => {
                const saveBtn = screen.getByText('Save');
                expect(saveBtn.closest('button')).toHaveProperty('disabled', false);
            });
        });

        it('Ctrl+S triggers save when dirty', async () => {
            renderConfigurator();
            // Make dirty first
            const themeSelect = screen.getByTitle('Page theme') as HTMLSelectElement;
            fireEvent.change(themeSelect, { target: { value: 'editorial' } });
            await waitFor(() => {
                expect(screen.getByText('Save').closest('button')).toHaveProperty('disabled', false);
            });
            // Clear previous fetch calls
            mockFetch.mockClear();
            mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

            // Simulate Ctrl+S
            fireEvent.keyDown(window, { key: 's', ctrlKey: true });
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalledWith(
                    `/api/pages/${PAGE_ID}`,
                    expect.objectContaining({ method: 'PATCH' }),
                );
            });
        });
    });

    describe('block palette', () => {
        it('opens palette modal when + Add Block clicked', async () => {
            renderConfigurator();
            fireEvent.click(screen.getByText('+ Add Block'));
            await waitFor(() => {
                expect(screen.getByText('Add Block')).toBeTruthy();
                expect(screen.getByPlaceholderText('Search blocks...')).toBeTruthy();
            });
        });

        it('palette search filters block types', async () => {
            const user = userEvent.setup();
            renderConfigurator();
            fireEvent.click(screen.getByText('+ Add Block'));
            await waitFor(() => {
                expect(screen.getByPlaceholderText('Search blocks...')).toBeTruthy();
            });
            const searchInput = screen.getByPlaceholderText('Search blocks...');
            await user.type(searchInput, 'pricing');
            await waitFor(() => {
                expect(screen.getByText('PricingTable')).toBeTruthy();
                // FAQ should be filtered out
                expect(screen.queryByText('Expandable question and answer list')).toBeNull();
            });
        });

        it('adds a block when palette item clicked', async () => {
            renderConfigurator();
            // Start with 3 blocks
            const _initialFooters = screen.getAllByText('Footer');

            fireEvent.click(screen.getByText('+ Add Block'));
            await waitFor(() => {
                expect(screen.getByText('Add Block')).toBeTruthy();
            });

            // Click the DataTable block in palette
            const dtButtons = screen.getAllByText('DataTable');
            fireEvent.click(dtButtons[0].closest('button')!);

            await waitFor(() => {
                // Palette should close
                expect(screen.queryByText('Add Block')).toBeNull();
                // DataTable should appear in block list
                expect(screen.getAllByText('DataTable').length).toBeGreaterThan(0);
            });
        });
    });

    describe('block operations', () => {
        it('removes a block when remove button clicked', async () => {
            renderConfigurator();
            // We have Hero, FAQ, Footer — count initial FAQ appearances
            const initialFaqCount = screen.getAllByText('FAQ').length;

            // Find and click the remove button for the FAQ block
            const removeButtons = screen.getAllByTitle('Remove');
            // The second remove button should be for FAQ (index 1)
            fireEvent.click(removeButtons[1]);

            await waitFor(() => {
                // Should have fewer FAQ text nodes after removal
                const currentFaqCount = screen.queryAllByText('FAQ').length;
                expect(currentFaqCount).toBeLessThan(initialFaqCount);
            });
        });
    });

    describe('postMessage bridge', () => {
        it('selects block on valid block-select message from same origin', async () => {
            renderConfigurator();
            // Simulate postMessage from iframe, wrapped in act to suppress React warning
            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    data: { type: 'block-select', blockId: 'blk_0', blockType: 'Hero' },
                    origin: 'http://localhost:3000',
                }));
            });
            await waitFor(() => {
                // Config panel should show for the Hero block
                expect(screen.getByText('Regenerate Hero')).toBeTruthy();
            });
        });

        it('ignores block-select from different origin', async () => {
            renderConfigurator();
            act(() => {
                window.dispatchEvent(new MessageEvent('message', {
                    data: { type: 'block-select', blockId: 'blk_0', blockType: 'Hero' },
                    origin: 'https://evil.com',
                }));
            });
            // Should NOT show config panel
            await new Promise(r => setTimeout(r, 50));
            expect(screen.queryByText('Regenerate Hero')).toBeNull();
        });
    });

    describe('unsaved changes guard', () => {
        it('adds beforeunload listener when dirty', async () => {
            const addSpy = vi.spyOn(window, 'addEventListener');
            renderConfigurator();
            // Make dirty
            const themeSelect = screen.getByTitle('Page theme') as HTMLSelectElement;
            fireEvent.change(themeSelect, { target: { value: 'bold' } });
            await waitFor(() => {
                expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
            });
            addSpy.mockRestore();
        });
    });

    describe('field schemas coverage', () => {
        it('all 31 block types have field schemas', () => {
            // Click + Add Block to open palette and verify all types are available
            renderConfigurator();
            fireEvent.click(screen.getByText('+ Add Block'));
            const allBlockTypes = [
                'Header', 'Footer', 'Sidebar', 'Hero', 'ArticleBody', 'FAQ',
                'StepByStep', 'Checklist', 'AuthorBio', 'ComparisonTable', 'VsCard',
                'RankingList', 'ProsConsCard', 'LeadForm', 'CTABanner', 'PricingTable',
                'QuoteCalculator', 'CostBreakdown', 'StatGrid', 'DataTable',
                'TestimonialGrid', 'TrustBadges', 'CitationBlock', 'LastUpdated',
                'MedicalDisclaimer', 'Wizard', 'GeoContent', 'InteractiveMap',
                'PdfDownload', 'ScrollCTA', 'EmbedWidget',
            ];
            for (const type of allBlockTypes) {
                // Some types appear in both the block list and the palette, so use getAllByText
                expect(screen.getAllByText(type).length).toBeGreaterThan(0);
            }
        });
    });

    describe('array field editor', () => {
        it('shows FAQ items array editor with add/remove', async () => {
            const blocks = [{
                id: 'blk_faq',
                type: 'FAQ',
                config: { openFirst: true },
                content: {
                    items: [
                        { question: 'What is X?', answer: 'X is great.' },
                        { question: 'How does Y work?', answer: 'Y works well.' },
                    ],
                },
            }];
            renderConfigurator({ initialBlocks: blocks });
            // Select the FAQ block
            const faqBadges = screen.getAllByText('FAQ');
            fireEvent.click(faqBadges[0].closest('[class*="cursor-pointer"]')!);
            await waitFor(() => {
                // Should show the FAQ Items label
                expect(screen.getByText('FAQ Items')).toBeTruthy();
                // Should show the item labels
                expect(screen.getByText('What is X?')).toBeTruthy();
                expect(screen.getByText('How does Y work?')).toBeTruthy();
            });
            // Click + Add to add a new item
            const addButtons = screen.getAllByText('+ Add');
            fireEvent.click(addButtons[addButtons.length - 1]);
            await waitFor(() => {
                // Should have 3 items now (original 2 + new blank one)
                const removeButtons = screen.getAllByTitle('Remove');
                expect(removeButtons.length).toBeGreaterThanOrEqual(3);
            });
        });
    });
});
