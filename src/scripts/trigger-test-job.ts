import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq } from 'drizzle-orm';

async function main() {
    console.log('🚀 Triggering E2E Test Job...');

    // 1. Get or Create Domain
    let domain = await db.query.domains.findFirst();
    if (!domain) {
        console.log('No domain found. Creating test domain...');
        const [newDomain] = await db.insert(domains).values({
            domain: 'spacex-test.com',
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
    const [job] = await db.insert(contentQueue).values({
        jobType: 'research',
        domainId: domain.id,
        articleId: article.id,
        payload: {
            targetKeyword: keyword,
            domainName: domain.domain,
        },
        priority: 10,
        status: 'pending',
    }).returning();
    console.log(`Queued Research Job: ${job.id}`);

    // 4. Poll for Completion
    console.log('Waiting for worker to process...');
    const start = Date.now();
    while (Date.now() - start < 60000) { // 60s timeout
        const [updatedJob] = await db.select().from(contentQueue).where(eq(contentQueue.id, job.id));

        if (updatedJob.status === 'completed') {
            console.log('✅ Job Completed!');

            // Fetch Research Data
            const [updatedArticle] = await db.select().from(articles).where(eq(articles.id, article.id));
            console.log('\n--- RESEARCH DATA ---');
            console.log(JSON.stringify(updatedArticle.researchData, null, 2));
            console.log('---------------------\n');

            // Check if next job (Outline) was queued
            const nextJobs = await db.select().from(contentQueue).where(eq(contentQueue.articleId, article.id));
            const outlineJob = nextJobs.find(j => j.jobType === 'generate_outline');
            if (outlineJob) {
                console.log(`✅ Next Job Queued: ${outlineJob.jobType} (${outlineJob.status})`);
            } else {
                console.error('❌ Next job NOT found! Pipeline broken?');
            }

            process.exit(0);
        } else if (updatedJob.status === 'failed') {
            console.error('❌ Job Failed:', updatedJob.errorMessage);
            process.exit(1);
        } else if (updatedJob.status === 'processing') {
            process.stdout.write('.');
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    console.error('\n❌ Timeout waiting for job completion. Is the worker running?');
    process.exit(1);
}

main().catch(console.error);
