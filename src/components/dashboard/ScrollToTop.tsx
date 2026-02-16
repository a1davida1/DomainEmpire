'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const main = document.querySelector('main');
        if (!main) return;
        function onScroll() {
            setVisible((main?.scrollTop ?? 0) > 400);
        }
        main.addEventListener('scroll', onScroll, { passive: true });
        return () => main.removeEventListener('scroll', onScroll);
    }, []);

    if (!visible) return null;

    return (
        <Button
            size="icon"
            variant="secondary"
            className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-4"
            onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll to top"
        >
            <ArrowUp className="h-4 w-4" />
        </Button>
    );
}
