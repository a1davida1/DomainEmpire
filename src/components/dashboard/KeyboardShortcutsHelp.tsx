'use client';

import { useState, useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SHORTCUTS = [
    { keys: ['⌘', 'K'], description: 'Open command palette' },
    { keys: ['?'], description: 'Show keyboard shortcuts' },
    { keys: ['Esc'], description: 'Close dialog / palette' },
    { keys: ['↑', '↓'], description: 'Navigate list items' },
    { keys: ['Enter'], description: 'Select highlighted item' },
    { keys: ['⌘', 'K'], description: 'Search pages & actions' },
];

export function KeyboardShortcutsHelp() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (
                e.key === '?' &&
                !e.metaKey && !e.ctrlKey &&
                !(e.target instanceof HTMLInputElement) &&
                !(e.target instanceof HTMLTextAreaElement) &&
                !(e.target instanceof HTMLSelectElement)
            ) {
                e.preventDefault();
                setOpen(prev => !prev);
            }
            if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[250]" onClick={() => setOpen(false)}>
            <div className="fixed inset-0 bg-black/50 animate-in fade-in" />
            <div
                className="fixed inset-x-0 top-[15%] mx-auto w-full max-w-md animate-in slide-in-from-top-2"
                onClick={e => e.stopPropagation()}
            >
                <div className="rounded-xl border bg-popover shadow-2xl">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Keyboard className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">Keyboard Shortcuts</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <div className="p-4 space-y-3">
                        {SHORTCUTS.map((shortcut, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                                <div className="flex items-center gap-1">
                                    {shortcut.keys.map((key, j) => (
                                        <kbd
                                            key={j}
                                            className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border bg-muted px-1.5 text-xs font-mono text-muted-foreground"
                                        >
                                            {key}
                                        </kbd>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="border-t px-4 py-2">
                        <p className="text-[10px] text-muted-foreground text-center">Press <kbd className="rounded border bg-muted px-1 text-[10px] font-mono">?</kbd> to toggle this panel</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
