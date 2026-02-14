import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { enqueueContentJob } from '@/lib/queue/content-queue';

async function main() {
    console.log('🚀 Triggering E2E Test Job...');

    // 1. Get or Create Domain
    let domain = await db.query.domains.findFirst();
    if (!domain) {
        console.log('No domain found. Creating test domain...');
        const [newDomain] = await db.insert(domains).values({
            domain: 'spacex-test.com',
            tld: 'com',
            niche: 'space-technology',
            status: 'active',
        }).returning();
        domain = newDomain;
    }
    console.log(`Using domain: ${domain.domain} (${domain.id})`);

    // 2. Create Article Placeholder
    const keyword = 'SpaceX Starship Updates 2026';
    const [article] = await db.insert(articles).values({
        domainId: domain.id,
        targetKeyword: keyword,
        title: 'Draft: ' + keyword,
        slug: 'spacex-starship-updates-2026-' + Date.now(),
        status: 'draft',
    }).returning();
    console.log(`Created article: ${article.id}`);

    // 3. Insert Research Job
    const jobId = await enqueueContentJob({
        jobType: 'research',
        domainId: domain.id,
        articleId: article.id,
        payload: {
            targetKeyword: keyword,
            domainName: domain.domain,
        },
        priority: 10,
        status: 'pending',
    });
    console.log(`Queued Research Job: ${jobId}`);

    // 4. Poll for Completion
    console.log('Waiting for worker to process...');
    const start = Date.now();
    while (Date.now() - start < 60000) { // 60s timeout
        const [updatedJob] = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId));

        if (!updatedJob) {
            console.error('❌ Job not found in queue (deleted?)');
            process.exit(1);
        }

        if (updatedJob.status === 'completed') {
            console.log('✅ Job Completed!');

            // Fetch Research Data
            const [updatedArticle] = await db.select().from(articles).where(eq(articles.id, article.id));
            if (!updatedArticle) {
                console.error('❌ Article not found after job completion');
                process.exit(1);
            }

            console.log('\n--- RESEARCH DATA ---');
            console.log(JSON.stringify(updatedArticle.researchData, null, 2));
            console.log('---------------------\n');

            // Check if next job (Outline) was queued
            const nextJobs = await db.select().from(contentQueue).where(eq(contentQueue.articleId, article.id));
            const outlineJob = nextJobs.find(j => j.jobType === 'generate_outline');
            if (outlineJob) {
                console.log(`✅ Next Job Queued: ${outlineJob.jobType} (${outlineJob.status})`);
            } else {
                console.warn('⚠️ Next job NOT found! Pipeline might be paused or broken.');
            }

            process.exit(0);
        } else if (updatedJob.status === 'failed') {
            console.error('❌ Job Failed:', updatedJob.errorMessage || 'Unknown error');
            process.exit(1);
        } else if (updatedJob.status === 'processing' || updatedJob.status === 'pending') {
            process.stdout.write(updatedJob.status === 'processing' ? '.' : 'p');
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    console.error('\n❌ Timeout waiting for job completion. Is the worker running?');
    process.exit(1);
}

main().catch(console.error);
