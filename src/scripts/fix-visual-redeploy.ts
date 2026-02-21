import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '759a8b1f-8dfa-4e8a-a4d9-847af1ce93d9';

    // Debug: check what blocks look like
    const allPages = await sql`SELECT id, route, blocks FROM page_definitions WHERE domain_id = ${domainId}`;
    console.log(`Found ${allPages.length} pages`);
    
    let headerFixed = 0;
    for (const page of allPages) {
        // blocks may come as string or object from postgres
        let blocks: Array<Record<string, unknown>>;
        if (typeof page.blocks === 'string') {
            blocks = JSON.parse(page.blocks);
        } else {
            blocks = page.blocks as Array<Record<string, unknown>>;
        }
        
        if (page.route === '/') {
            const types = blocks.map((b: Record<string, unknown>) => `${b.type}(${b.variant || 'default'})`);
            console.log(`Homepage block types: ${types.join(', ')}`);
        }
        
        let changed = false;
        for (const b of blocks) {
            if (b.type === 'Header') {
                console.log(`  ${page.route}: Header variant ${b.variant} -> minimal`);
                b.variant = 'minimal';
                const config = (b.config || {}) as Record<string, unknown>;
                config.sticky = true;
                b.config = config;
                changed = true;
                headerFixed++;
            }
        }
        if (changed) {
            await sql`UPDATE page_definitions SET blocks = ${JSON.stringify(blocks)}, updated_at = NOW() WHERE id = ${page.id}`;
        }
    }
    console.log(`Fixed header variant to 'minimal' on ${headerFixed} pages`);

    // Queue redeploy
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
