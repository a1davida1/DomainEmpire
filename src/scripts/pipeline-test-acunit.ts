/**
 * End-to-end pipeline test using composable steps for acunitinstall.com.
 * Tests: updateDomain → regeneratePages → updateDomain (fixes) → queue deploy
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { updateDomain, regeneratePages } from '@/lib/deploy/prepare-domain';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

async function main() {
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';

    // Ensure domain has correct CF project
    await db.update(domains).set({
        cloudflareProject: 'acunitinstall-com',
        cloudflareAccount: null,
    }).where(eq(domains.id, domainId));

    // Step 1: Update domain metadata (niche, theme, skin)
    console.log('Step 1: updateDomain (set niche + theme/skin)...');
    let start = Date.now();
    const update1 = await updateDomain(domainId, {
        niche: 'AC Unit Installation',
        subNiche: 'HVAC Installation',
        vertical: 'Home Services',
        siteTemplate: 'cost_guide',
    });
    console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(`  Theme: ${update1.theme}, Skin: ${update1.skin}`);

    // Step 2: Regenerate all pages from blueprint
    console.log('\nStep 2: regeneratePages (delete + re-seed from blueprint)...');
    start = Date.now();
    const regen = await regeneratePages(domainId);
    console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(`  Pages: ${regen.pageCount}`);

    // Step 3: Re-run fixes on regenerated pages
    console.log('\nStep 3: updateDomain (programmatic fixes on new pages)...');
    start = Date.now();
    const update2 = await updateDomain(domainId);
    console.log(`  Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(`  Fixes: ${JSON.stringify(update2.programmaticFixes)}`);
    console.log(`  Ready: ${update2.ready}`);
    console.log(`  Validation: ${update2.validation.errorCount} errors, ${update2.validation.warningCount} warnings`);

    if (!update2.ready) {
        console.warn('\n⚠ Pipeline says NOT ready, but deploying anyway to test...');
    }

    // Step 4: Queue deploy (skip AI enrichment — not needed for this test)
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
