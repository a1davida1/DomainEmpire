'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface QueueBulkSelectionToolsProps {
    formId: string;
    checkboxName?: string;
}

function getQueueCheckboxes(formId: string, checkboxName: string): HTMLInputElement[] {
    return Array.from(
        document.querySelectorAll<HTMLInputElement>(
            `input[type="checkbox"][name="${checkboxName}"][form="${formId}"]`,
        ),
    );
}

export function QueueBulkSelectionTools({
    formId,
    checkboxName = 'jobIds',
}: QueueBulkSelectionToolsProps) {
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

    const selectAllActionable = useCallback(() => {
        for (const input of getQueueCheckboxes(formId, checkboxName)) {
            if (!input.disabled && !input.checked) {
                input.checked = true;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        refreshCounts();
    }, [checkboxName, formId, refreshCounts]);

    const clearSelection = useCallback(() => {
        for (const input of getQueueCheckboxes(formId, checkboxName)) {
            if (!input.disabled && input.checked) {
                input.checked = false;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        refreshCounts();
    }, [checkboxName, formId, refreshCounts]);

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
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={selectAllActionable}
                className="rounded border px-2 py-1 text-xs hover:bg-muted"
                disabled={actionableCount === 0}
            >
                Select Actionable Visible
            </button>
            <button
                type="button"
                onClick={clearSelection}
                className="rounded border px-2 py-1 text-xs hover:bg-muted"
                disabled={actionableCount === 0 || selectedCount === 0}
            >
                Clear
            </button>
            <span className="text-xs text-muted-foreground">
                selected {selectedCount} / {actionableCount} actionable
            </span>
        </div>
    );
}
