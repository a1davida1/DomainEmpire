'use client';

/**
 * Side-by-side revision diff component.
 * Uses simple line-by-line comparison.
 */

interface RevisionDiffProps {
    oldText: string;
    newText: string;
    oldLabel: string;
    newLabel: string;
}

interface DiffLine {
    type: 'same' | 'added' | 'removed';
    text: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const _result: DiffLine[] = [];

    // Simple LCS-based diff
    const m = oldLines.length;
    const n = newLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack
    let i = m, j = n;
    const ops: DiffLine[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            ops.push({ type: 'same', text: oldLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.push({ type: 'added', text: newLines[j - 1] });
            j--;
        } else {
            ops.push({ type: 'removed', text: oldLines[i - 1] });
            i--;
        }
    }

    ops.reverse();
    return ops;
}

export default function RevisionDiff({ oldText, newText, oldLabel, newLabel }: RevisionDiffProps) {
    const lines = computeDiff(oldText, newText);
    const addedCount = lines.filter(l => l.type === 'added').length;
    const removedCount = lines.filter(l => l.type === 'removed').length;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">{oldLabel} → {newLabel}</span>
                <span className="text-green-600">+{addedCount} lines</span>
                <span className="text-red-600">-{removedCount} lines</span>
            </div>
            <div className="border rounded-lg overflow-auto max-h-[600px] font-mono text-xs">
                {lines.map((line, idx) => (
                    <div
                        key={idx}
                        className={`px-3 py-0.5 whitespace-pre-wrap ${
                            line.type === 'added'
                                ? 'bg-green-50 text-green-800 border-l-2 border-green-500'
                                : line.type === 'removed'
                                ? 'bg-red-50 text-red-800 border-l-2 border-red-500'
                                : 'border-l-2 border-transparent'
                        }`}
                    >
                        <span className="inline-block w-4 text-muted-foreground mr-2">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        {line.text || '\u00A0'}
                    </div>
                ))}
            </div>
        </div>
    );
}
