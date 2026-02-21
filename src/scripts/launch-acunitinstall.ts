import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';
    const theme = 'clean';
    const skin = 'cobalt';

    // 1. Update domain: assign theme+skin, clear stale CF account
    await sql`
        UPDATE domains 
        SET theme_style = ${theme}, 
            skin = ${skin},
            cloudflare_account = NULL,
            cloudflare_project = NULL,
            updated_at = NOW()
        WHERE id = ${domainId}
    `;
    console.log(`Domain updated: theme=${theme}, skin=${skin}, cleared stale CF refs`);

    // 2. Update all page_definitions: set theme+skin, ensure header is 'minimal' with sticky
    const allPages = await sql`SELECT id, route, blocks FROM page_definitions WHERE domain_id = ${domainId}`;
    console.log(`Found ${allPages.length} page definitions`);

    let pagesUpdated = 0;
    for (const page of allPages) {
        let blocks: Array<Record<string, unknown>>;
        if (typeof page.blocks === 'string') {
            blocks = JSON.parse(page.blocks);
        } else {
            blocks = page.blocks as Array<Record<string, unknown>>;
        }

        let changed = false;
        for (const b of blocks) {
            if (b.type === 'Header') {
                b.variant = 'minimal';
                const config = (b.config || {}) as Record<string, unknown>;
                config.sticky = true;
                b.config = config;
                changed = true;
            }
        }

        // Update theme/skin on the page definition row
        await sql`
            UPDATE page_definitions 
            SET theme = ${theme}, skin = ${skin},
                blocks = ${changed ? JSON.stringify(blocks) : sql`blocks`},
                updated_at = NOW()
            WHERE id = ${page.id}
        `;
        pagesUpdated++;
    }
    console.log(`Updated ${pagesUpdated} pages with theme=${theme}, skin=${skin}`);

    // 3. Cancel any old deploy jobs, queue fresh deploy
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;
    
    const jobId = randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain: 'acunitinstall.com',
                  triggerBuild: true,
                  addCustomDomain: true,
              })}, NOW(), 3, NOW())`;
    console.log(`Deploy queued: ${jobId}`);
    console.log(`Monitor: npx tsx src/scripts/check-job.ts ${jobId}`);

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
