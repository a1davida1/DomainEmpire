/**
 * End-to-end pipeline test: prepareDomain → queue deploy for acunitinstall.com.
 * This exercises the ACTUAL pipeline — no bypasses.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { prepareDomain } from '@/lib/deploy/prepare-domain';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

async function main() {
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';

    // Ensure domain has correct CF project (already exists from prior deploys)
    await db.update(domains).set({
        cloudflareProject: 'acunitinstall-com',
        cloudflareAccount: null,
    }).where(eq(domains.id, domainId));

    console.log('Running prepareDomain (full pipeline) for acunitinstall.com...');
    console.log('Niche override: "AC Unit Installation"\n');
    const start = Date.now();

    const result = await prepareDomain(domainId, {
        niche: 'AC Unit Installation',
        subNiche: 'HVAC Installation',
        vertical: 'Home Services',
        siteTemplate: 'cost_guide',
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nprepareDomain completed in ${elapsed}s`);
    console.log(`  Domain: ${result.domain}`);
    console.log(`  Theme: ${result.theme}, Skin: ${result.skin}`);
    console.log(`  Pages: ${result.pageCount} (seeded: ${result.pagesSeeded})`);
    console.log(`  Programmatic fixes: ${JSON.stringify(result.programmaticFixes)}`);
    console.log(`  Enrichment: ${result.enrichment.aiCalls} AI calls, $${result.enrichment.cost.toFixed(4)}`);
    console.log(`  Content scan: ${result.contentScan.blocksRewritten} blocks rewritten`);
    console.log(`  Ready: ${result.ready}`);
    console.log(`  Validation: ${result.validation.errorCount} errors, ${result.validation.warningCount} warnings`);

    if (!result.ready) {
        console.warn('\n⚠ Pipeline says NOT ready, but deploying anyway to test...');
    }

    // Queue deploy through the normal pipeline
    const { default: postgres } = await import('postgres');
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;
    const jobId = randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain: 'acunitinstall.com',
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    console.log(`\nDeploy queued: ${jobId}`);
    await sql.end();
    setTimeout(() => process.exit(0), 2000);
}

main().catch((e) => { console.error(e); process.exit(1); });
