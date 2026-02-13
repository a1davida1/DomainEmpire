/**
 * Compute Longest Common Subsequence (LCS) diff between two strings
 */
export function lcsDiff(a: string, b: string): { type: 'same' | 'add' | 'remove'; line: string }[] {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const m = aLines.length;
    const n = bLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (aLines[i - 1] === bLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to produce diff
    const result: { type: 'same' | 'add' | 'remove'; line: string }[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
            result.push({ type: 'same', line: aLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.push({ type: 'add', line: bLines[j - 1] });
            j--;
        } else {
            result.push({ type: 'remove', line: aLines[i - 1] });
            i--;
        }
    }

    return result.reverse();
}
