import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';

    // Restore CF project name (already exists from first deploy)
    await sql`UPDATE domains SET cloudflare_project = 'acunitinstall-com', cloudflare_account = NULL WHERE id = ${domainId}`;

    // Cancel old jobs
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;

    const jobId = randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain: 'acunitinstall.com',
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    console.log(`Deploy queued: ${jobId}`);
    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
