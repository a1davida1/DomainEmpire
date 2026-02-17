export function formatDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '-';

    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function formatNumber(num: number | null | undefined): string {
    if (num === null || num === undefined || !Number.isFinite(num)) return '-';
    return new Intl.NumberFormat('en-US').format(num);
}

export function formatCurrency(num: number | null | undefined): string {
    if (num === null || num === undefined || !Number.isFinite(num)) return '-';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(num);
}
