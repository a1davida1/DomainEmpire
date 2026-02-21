import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '759a8b1f-8dfa-4e8a-a4d9-847af1ce93d9';

    // Fix 1: Rewrite calculator formula to safe multi-output format
    const calcPages = await sql`SELECT id, blocks FROM page_definitions WHERE domain_id = ${domainId} AND route = '/calculator'`;
    if (calcPages.length > 0) {
        const blocks = calcPages[0].blocks as Array<Record<string, unknown>>;
        let changed = false;
        for (const b of blocks) {
            if (b.type === 'QuoteCalculator') {
                const content = b.content as Record<string, unknown>;
                // Rewrite to multi-output expression format (no const/return/braces)
                content.formula = '({estimated_value_low: Math.round((square_footage * 180 * Math.max(0.7, 1 - ((2024 - year_built) * 0.003)) + bedrooms * 15000 + bathrooms * 12000) * property_condition * 0.92), estimated_value_high: Math.round((square_footage * 180 * Math.max(0.7, 1 - ((2024 - year_built) * 0.003)) + bedrooms * 15000 + bathrooms * 12000) * property_condition * 1.08), estimated_value_mid: Math.round((square_footage * 180 * Math.max(0.7, 1 - ((2024 - year_built) * 0.003)) + bedrooms * 15000 + bathrooms * 12000) * property_condition)})';
                content.heading = 'Home Value Estimator';
                
                // Set autoCalculate to false so Calculate button is required
                const config = (b.config || {}) as Record<string, unknown>;
                config.autoCalculate = false;
                config.buttonLabel = 'Estimate My Home Value';
                b.config = config;
                changed = true;
                console.log('Fixed calculator formula and added button config');
            }
        }
        if (changed) {
            await sql`UPDATE page_definitions SET blocks = ${JSON.stringify(blocks)}, updated_at = NOW() WHERE id = ${calcPages[0].id}`;
            console.log('Updated /calculator page');
        }
    }

    // Fix 2: Fix header variant on all pages — change from 'minimal' to 'topbar' for better nav
    const allPages = await sql`SELECT id, blocks FROM page_definitions WHERE domain_id = ${domainId}`;
    for (const page of allPages) {
        const blocks = page.blocks as Array<Record<string, unknown>>;
        let changed = false;
        for (const b of blocks) {
            if (b.type === 'Header' && b.variant === 'minimal') {
                b.variant = 'topbar';
                const config = (b.config || {}) as Record<string, unknown>;
                config.sticky = true;
                b.config = config;
                changed = true;
            }
        }
        if (changed) {
            await sql`UPDATE page_definitions SET blocks = ${JSON.stringify(blocks)}, updated_at = NOW() WHERE id = ${page.id}`;
        }
    }
    console.log(`Fixed header variant to 'topbar' on ${allPages.length} pages`);

    // Fix 3: Queue redeploy
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;
    const jobId = randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain: 'myhomevalue.io',
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    console.log(`Redeploy queued: ${jobId}`);

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
