/**
 * One-time regeneration script: wipe articles + page_definitions, keep keywords,
 * then re-seed content for every active domain.
 *
 * FK cascades automatically clean up: content_queue jobs, content_revisions,
 * review_events, citations, qa_checklist_results, article_datasets, ab_tests.
 * Keywords get articleId SET NULL via FK; we also reset their status to 'queued'.
 *
 * Usage:
 *   npx tsx scripts/regenerate-all-sites.ts                # dry-run (default)
 *   npx tsx scripts/regenerate-all-sites.ts --execute       # actually delete + re-seed
 *   npx tsx scripts/regenerate-all-sites.ts --execute --articles-per-domain 10
 *   npx tsx scripts/regenerate-all-sites.ts --domain example.com --execute
 */

import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '../.env.local') });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

function parseFlagValue(args: string[], flag: string, fallback: string): string {
    const idx = args.indexOf(flag);
    if (idx < 0) return fallback;
    const val = args[idx + 1];
    if (!val || val.startsWith('--')) {
        console.error(`Missing value for ${flag}`);
        process.exit(1);
    }
    return val;
}

interface DomainSummary {
    domain: string;
    domainId: string;
    articlesDeleted: number;
    pagesDeleted: number;
    keywordsReset: number;
    articlesSeeded: number;
    error?: string;
}

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const filterDomain = args.includes('--domain')
        ? parseFlagValue(args, '--domain', '')
        : '';
    const articlesPerDomain = parseInt(
        parseFlagValue(args, '--articles-per-domain', '5'),
        10,
    );

    console.log('=== Regenerate All Sites ===');
    console.log(`Mode:               ${execute ? '🔴 EXECUTE (destructive)' : '🟢 DRY RUN'}`);
    console.log(`Articles per domain: ${articlesPerDomain}`);
    if (filterDomain) console.log(`Filter domain:       ${filterDomain}`);
    console.log('');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('ERROR: DATABASE_URL not set');
        process.exit(1);
    }

    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    const client = postgres(dbUrl, { max: 1, ssl: isLocal ? false : 'require', connect_timeout: 10 });
    const db = drizzle(client, { schema });

    try {
        // 1. Fetch domains
        let allDomains = await db
            .select({
                id: schema.domains.id,
                domain: schema.domains.domain,
                niche: schema.domains.niche,
                subNiche: schema.domains.subNiche,
                isClassified: sql<boolean>`${schema.domains.niche} IS NOT NULL`,
            })
            .from(schema.domains)
            .where(isNull(schema.domains.deletedAt));

        if (filterDomain) {
            allDomains = allDomains.filter(d => d.domain === filterDomain);
        }

        console.log(`Found ${allDomains.length} domain(s) to process\n`);

        if (allDomains.length === 0) {
            console.log('Nothing to do.');
            return;
        }

        const results: DomainSummary[] = [];
        let totalArticlesDeleted = 0;
        let totalPagesDeleted = 0;
        let totalKeywordsReset = 0;
        let totalSeeded = 0;
        let totalFailed = 0;

        for (const domain of allDomains) {
            const summary: DomainSummary = {
                domain: domain.domain,
                domainId: domain.id,
                articlesDeleted: 0,
                pagesDeleted: 0,
                keywordsReset: 0,
                articlesSeeded: 0,
            };

            try {
                // Count what we'll delete
                const [articleCount] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(schema.articles)
                    .where(eq(schema.articles.domainId, domain.id));

                const [pageCount] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(schema.pageDefinitions)
                    .where(eq(schema.pageDefinitions.domainId, domain.id));

                const [kwAssignedCount] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(schema.keywords)
                    .where(
                        sql`${schema.keywords.domainId} = ${domain.id} AND ${schema.keywords.articleId} IS NOT NULL`,
                    );

                summary.articlesDeleted = articleCount.count;
                summary.pagesDeleted = pageCount.count;
                summary.keywordsReset = kwAssignedCount.count;

                if (execute) {
                    await db.transaction(async (tx) => {
                        // Delete articles (cascades: content_queue, revisions, review_events, citations, etc.)
                        await tx
                            .delete(schema.articles)
                            .where(eq(schema.articles.domainId, domain.id));

                        // Delete page definitions
                        await tx
                            .delete(schema.pageDefinitions)
                            .where(eq(schema.pageDefinitions.domainId, domain.id));

                        // Reset keywords: articleId is already SET NULL by FK cascade,
                        // but status needs manual reset from 'assigned' back to 'queued'
                        await tx
                            .update(schema.keywords)
                            .set({ status: 'queued', articleId: null })
                            .where(eq(schema.keywords.domainId, domain.id));

                        // Cancel any pending/processing queue jobs for this domain
                        await tx
                            .update(schema.contentQueue)
                            .set({ status: 'cancelled' })
                            .where(
                                sql`${schema.contentQueue.domainId} = ${domain.id} AND ${schema.contentQueue.status} IN ('pending', 'processing')`,
                            );
                    });

                    // Now re-seed: call the seed API endpoint logic directly
                    // We need to create articles from available keywords and queue generation
                    if (domain.isClassified) {
                        const availableKeywords = await db
                            .select()
                            .from(schema.keywords)
                            .where(
                                sql`${schema.keywords.domainId} = ${domain.id} AND ${schema.keywords.articleId} IS NULL`,
                            )
                            .limit(articlesPerDomain);

                        // Pre-fetch existing slugs (should be none after delete, but be safe)
                        const existingSlugs = new Set<string>();

                        for (const kw of availableKeywords) {
                            const articleId = crypto.randomUUID();
                            const jobId = crypto.randomUUID();

                            const baseSlug = kw.keyword
                                .toLowerCase()
                                .replace(/\s+/g, '-')
                                .replace(/[^a-z0-9-]/g, '')
                                .replace(/-+/g, '-')
                                .replace(/^-|-$/g, '');
                            let slug = baseSlug || `article-${articleId.slice(0, 8)}`;
                            let counter = 1;
                            while (existingSlugs.has(slug)) {
                                slug = `${baseSlug}-${counter++}`;
                            }
                            existingSlugs.add(slug);

                            await db.transaction(async (tx) => {
                                await tx.insert(schema.articles).values({
                                    id: articleId,
                                    domainId: domain.id,
                                    title: kw.keyword,
                                    slug,
                                    targetKeyword: kw.keyword,
                                    secondaryKeywords: [],
                                    status: 'generating',
                                });

                                await tx.insert(schema.contentQueue).values({
                                    id: jobId,
                                    domainId: domain.id,
                                    articleId,
                                    jobType: 'generate_outline',
                                    priority: 5,
                                    payload: {
                                        targetKeyword: kw.keyword,
                                        secondaryKeywords: [],
                                        domainName: domain.domain,
                                        niche: domain.niche,
                                        subNiche: domain.subNiche,
                                    },
                                    status: 'pending',
                                    scheduledFor: new Date(),
                                    maxAttempts: 3,
                                });

                                await tx
                                    .update(schema.keywords)
                                    .set({ articleId, status: 'assigned' })
                                    .where(eq(schema.keywords.id, kw.id));
                            });

                            summary.articlesSeeded++;
                        }
                    }
                }

                totalArticlesDeleted += summary.articlesDeleted;
                totalPagesDeleted += summary.pagesDeleted;
                totalKeywordsReset += summary.keywordsReset;
                totalSeeded += summary.articlesSeeded;
                results.push(summary);
            } catch (err) {
                summary.error = err instanceof Error ? err.message : String(err);
                totalFailed++;
                results.push(summary);
            }
        }

        // Print results
        console.log('--- Results ---\n');
        for (const r of results) {
            const status = r.error ? '✗ ERROR' : '✓ OK';
            const detail = r.error
                ? r.error
                : `deleted ${r.articlesDeleted} articles, ${r.pagesDeleted} pages | reset ${r.keywordsReset} keywords | seeded ${r.articlesSeeded} articles`;
            console.log(`  ${status}  ${r.domain} — ${detail}`);
        }

        console.log('\n--- Summary ---');
        console.log(`  Domains processed:  ${results.length}`);
        console.log(`  Articles deleted:   ${totalArticlesDeleted}`);
        console.log(`  Pages deleted:      ${totalPagesDeleted}`);
        console.log(`  Keywords reset:     ${totalKeywordsReset}`);
        console.log(`  Articles seeded:    ${totalSeeded}`);
        console.log(`  Failed:             ${totalFailed}`);

        if (!execute) {
            console.log('\n⚠  DRY RUN — no changes were made. Use --execute to apply.');
        } else {
            console.log('\n✅ Done. Run the worker to process queued generation jobs:');
            console.log('   npm run worker');
        }
    } finally {
        await client.end();
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
