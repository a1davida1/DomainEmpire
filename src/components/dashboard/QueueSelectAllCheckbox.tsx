'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface QueueSelectAllCheckboxProps {
    formId: string;
    checkboxName?: string;
    className?: string;
}

function getQueueCheckboxes(formId: string, checkboxName: string): HTMLInputElement[] {
    return Array.from(
        document.querySelectorAll<HTMLInputElement>(
            `input[type="checkbox"][name="${checkboxName}"][form="${formId}"]`,
        ),
    );
}

export function QueueSelectAllCheckbox({
    formId,
    checkboxName = 'jobIds',
    className,
}: QueueSelectAllCheckboxProps) {
    const checkboxRef = useRef<HTMLInputElement>(null);
    const [selectedCount, setSelectedCount] = useState(0);
    const [actionableCount, setActionableCount] = useState(0);

    const selectorLabel = useMemo(
        () => `input[type="checkbox"][name="${checkboxName}"][form="${formId}"]`,
        [checkboxName, formId],
    );

    const refreshCounts = useCallback(() => {
        const all = getQueueCheckboxes(formId, checkboxName);
        const actionable = all.filter((input) => !input.disabled);
        const selected = actionable.filter((input) => input.checked);
        setActionableCount(actionable.length);
        setSelectedCount(selected.length);
    }, [checkboxName, formId]);

    useEffect(() => {
        const checkbox = checkboxRef.current;
        if (!checkbox) return;
        checkbox.indeterminate = selectedCount > 0 && selectedCount < actionableCount;
    }, [actionableCount, selectedCount]);

    useEffect(() => {
        const rafId = window.requestAnimationFrame(() => {
            refreshCounts();
        });
        const onChange = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.matches(selectorLabel)) {
                refreshCounts();
            }
        };
        document.addEventListener('change', onChange, true);
        const interval = window.setInterval(refreshCounts, 1500);
        return () => {
            window.cancelAnimationFrame(rafId);
            document.removeEventListener('change', onChange, true);
            window.clearInterval(interval);
        };
    }, [refreshCounts, selectorLabel]);

    return (
        <input
            ref={checkboxRef}
            type="checkbox"
            checked={actionableCount > 0 && selectedCount === actionableCount}
            disabled={actionableCount === 0}
            onChange={(event) => {
                const shouldSelect = event.currentTarget.checked;
                for (const input of getQueueCheckboxes(formId, checkboxName)) {
                    if (!input.disabled && input.checked !== shouldSelect) {
                        input.checked = shouldSelect;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                refreshCounts();
            }}
            className={className || 'h-4 w-4 accent-blue-600 disabled:opacity-40'}
            aria-label="Select all actionable visible jobs"
            title="Select all actionable visible jobs"
        />
    );
}
