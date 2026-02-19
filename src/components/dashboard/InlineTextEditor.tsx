'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface Block {
    id: string;
    type: string;
    variant?: string;
    config?: Record<string, unknown>;
    content?: Record<string, unknown>;
}

interface InlineTextEditorProps {
    blocks: Block[];
    onBlocksChange: (blocks: Block[]) => void;
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}

interface EditTarget {
    blockId: string;
    field: string;
    arrayIndex?: number;
    arrayField?: string;
    currentValue: string;
    rect: { top: number; left: number; width: number; height: number };
}

const EDITABLE_FIELDS: Record<string, Array<{ selector: string; field: string; isArray?: boolean; arrayField?: string }>> = {
    Hero: [
        { selector: 'h1', field: 'heading' },
        { selector: '.hero-sub, .hero-sub--large', field: 'subheading' },
        { selector: '.hero-badge', field: 'badge' },
    ],
    Header: [
        { selector: '.logo', field: 'siteName' },
    ],
    Footer: [
        { selector: '.footer-copyright', field: 'copyright' },
    ],
    FAQ: [
        { selector: '.faq-question', field: 'items', isArray: true, arrayField: 'question' },
        { selector: '.faq-answer', field: 'items', isArray: true, arrayField: 'answer' },
    ],
    CTABanner: [
        { selector: '.cta-text, .cta-heading, p', field: 'text' },
        { selector: '.cta-button, a', field: 'buttonLabel' },
    ],
    CostBreakdown: [
        { selector: 'h2', field: 'title' },
    ],
    QuoteCalculator: [
        { selector: 'h2', field: 'heading' },
    ],
};

/**
 * Inline Text Editor — enables click-to-edit on the preview iframe.
 * 
 * When enabled, clicking text elements in the preview opens an inline
 * editor overlay. Changes are saved back to the block content JSON.
 */
export function InlineTextEditor({ blocks, onBlocksChange, iframeRef, enabled, onToggle }: InlineTextEditorProps) {
    const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const handleIframeMessage = useCallback((event: MessageEvent) => {
        if (!enabled) return;
        const data = event.data as { type?: string; blockId?: string; field?: string; value?: string; rect?: EditTarget['rect']; arrayIndex?: number; arrayField?: string };
        if (data.type === 'inline-edit-click') {
            setEditTarget({
                blockId: data.blockId || '',
                field: data.field || '',
                arrayIndex: data.arrayIndex,
                arrayField: data.arrayField,
                currentValue: data.value || '',
                rect: data.rect || { top: 0, left: 0, width: 300, height: 40 },
            });
            setEditValue(data.value || '');
        }
    }, [enabled]);

    useEffect(() => {
        window.addEventListener('message', handleIframeMessage);
        return () => window.removeEventListener('message', handleIframeMessage);
    }, [handleIframeMessage]);

    useEffect(() => {
        if (editTarget && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editTarget]);

    useEffect(() => {
        if (!iframeRef.current) return;
        const iframe = iframeRef.current;

        function injectEditMode() {
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;

                if (doc.getElementById('inline-edit-script')) return;

                const script = doc.createElement('script');
                script.id = 'inline-edit-script';
                script.textContent = `
(function() {
    var editMode = ${enabled ? 'true' : 'false'};
    var fields = ${JSON.stringify(EDITABLE_FIELDS)};
    
    document.body.style.cursor = editMode ? 'text' : '';
    
    if (!editMode) return;
    
    document.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        var el = e.target;
        var blockEl = el.closest('[data-block-id]');
        if (!blockEl) return;
        
        var blockId = blockEl.getAttribute('data-block-id');
        var blockType = blockEl.getAttribute('data-block-type');
        if (!blockId || !blockType) return;
        
        var fieldDefs = fields[blockType] || [];
        var matched = null;
        
        for (var i = 0; i < fieldDefs.length; i++) {
            var def = fieldDefs[i];
            var selectors = def.selector.split(',');
            for (var j = 0; j < selectors.length; j++) {
                if (el.matches(selectors[j].trim()) || el.closest(selectors[j].trim())) {
                    matched = def;
                    break;
                }
            }
            if (matched) break;
        }
        
        if (!matched) {
            matched = { field: '_text', selector: '' };
        }
        
        var rect = el.getBoundingClientRect();
        var iframeRect = window.frameElement ? window.frameElement.getBoundingClientRect() : { top: 0, left: 0 };
        
        window.parent.postMessage({
            type: 'inline-edit-click',
            blockId: blockId,
            field: matched.field,
            arrayIndex: matched.isArray ? Array.from(el.closest('.faq-item, .faq-list')?.children || []).indexOf(el.closest('.faq-item') || el) : undefined,
            arrayField: matched.arrayField,
            value: el.textContent || '',
            rect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
            }
        }, '*');
    }, true);
    
    // Visual indicator: highlight editable elements on hover
    var style = document.createElement('style');
    style.textContent = '[data-block-id] h1, [data-block-id] h2, [data-block-id] p, [data-block-id] .logo, [data-block-id] .hero-badge, [data-block-id] .cta-button, [data-block-id] .faq-question { outline: 2px dashed transparent; transition: outline-color 0.15s; cursor: text !important; } [data-block-id] h1:hover, [data-block-id] h2:hover, [data-block-id] p:hover, [data-block-id] .logo:hover, [data-block-id] .hero-badge:hover, [data-block-id] .cta-button:hover, [data-block-id] .faq-question:hover { outline-color: #3b82f6; }';
    document.head.appendChild(style);
})();
                `;
                doc.body.appendChild(script);
            } catch {
                // Cross-origin iframe — can't inject
            }
        }

        iframe.addEventListener('load', injectEditMode);
        injectEditMode();

        return () => iframe.removeEventListener('load', injectEditMode);
    }, [iframeRef, enabled]);

    function saveEdit() {
        if (!editTarget) return;

        const updatedBlocks = blocks.map(b => {
            if (b.id !== editTarget.blockId) return b;
            const content = { ...(b.content || {}) } as Record<string, unknown>;

            if (editTarget.arrayIndex !== undefined && editTarget.arrayField) {
                const arr = [...((content[editTarget.field] as Array<Record<string, unknown>>) || [])];
                if (arr[editTarget.arrayIndex]) {
                    arr[editTarget.arrayIndex] = { ...arr[editTarget.arrayIndex], [editTarget.arrayField]: editValue };
                    content[editTarget.field] = arr;
                }
            } else if (editTarget.field !== '_text') {
                content[editTarget.field] = editValue;
            }

            return { ...b, content };
        });

        onBlocksChange(updatedBlocks);
        setEditTarget(null);
        toast.success('Text updated');
    }

    function cancelEdit() {
        setEditTarget(null);
    }

    return (
        <>
            <Button
                size="sm"
                variant={enabled ? 'default' : 'outline'}
                onClick={() => onToggle(!enabled)}
                className="gap-1.5"
            >
                <Pencil className="h-3.5 w-3.5" />
                {enabled ? 'Editing' : 'Edit Text'}
            </Button>

            {editTarget && (
                <div className="fixed inset-0 z-50 bg-black/20" onClick={cancelEdit}>
                    <div
                        className="absolute bg-white dark:bg-zinc-900 rounded-lg shadow-xl border p-3 min-w-[300px] max-w-[600px]"
                        style={{ top: Math.min(editTarget.rect.top + 60, window.innerHeight - 200), left: Math.max(20, editTarget.rect.left) }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-xs text-muted-foreground mb-2">
                            Editing: {editTarget.field}{editTarget.arrayField ? `.${editTarget.arrayField}` : ''}
                        </div>
                        <textarea
                            ref={inputRef}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                if (e.key === 'Escape') cancelEdit();
                            }}
                            className="w-full min-h-[60px] p-2 border rounded text-sm resize-y bg-background"
                            rows={Math.min(6, Math.max(2, editValue.split('\n').length))}
                        />
                        <div className="flex justify-end gap-2 mt-2">
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                                <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" onClick={saveEdit}>
                                <Check className="h-3.5 w-3.5 mr-1" /> Save
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
