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

const JOB_TYPE_LABELS: Record<string, string> = {
    outline: 'Create Outline',
    draft: 'Write Draft',
    humanize: 'Polish Writing',
    seo_optimize: 'SEO Optimization',
    generate_meta: 'Title & Description',
    ai_detection_check: 'AI Detection Check',
    keyword_research: 'Keyword Research',
    research: 'Research',
    deploy: 'Deploy Site',
    bulk_seed: 'Bulk Article Seed',
    domain_site_review: 'Site Review',
    classify: 'Classify Domain',
    ingest_listings: 'Ingest Listings',
    enrich_candidate: 'Enrich Candidate',
    score_candidate: 'Score Candidate',
    create_bid_plan: 'Create Bid Plan',
};

export function jobTypeLabel(jobType: string): string {
    if (JOB_TYPE_LABELS[jobType]) return JOB_TYPE_LABELS[jobType];
    return jobType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
