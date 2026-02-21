import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const domainId = '759a8b1f-8dfa-4e8a-a4d9-847af1ce93d9';
    const domain = 'myhomevalue.io';

    // Step 1: Clear the stale cloudflare shard reference, restore project name
    await sql`UPDATE domains SET cloudflare_account = NULL, cloudflare_project = 'myhomevalue-io', updated_at = NOW() WHERE id = ${domainId}`;
    console.log('Cleared cloudflare_account, restored cloudflare_project=myhomevalue-io');

    // Step 2: Cancel any stuck deploy jobs
    const cancelled = await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed') RETURNING id`;
    console.log(`Cancelled ${cancelled.length} old deploy jobs`);

    // Step 3: Queue new deploy — addCustomDomain=false since domain is already linked
    const jobId = randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain,
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    
    console.log(`New deploy job queued: ${jobId}`);
    console.log('Monitor at /dashboard/queue or run: npx tsx src/scripts/check-job.ts ' + jobId);

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
