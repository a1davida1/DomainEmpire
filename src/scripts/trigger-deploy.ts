import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const domainId = '759a8b1f-8dfa-4e8a-a4d9-847af1ce93d9';
    const domain = 'myhomevalue.io';

    // Clear any failed deploy jobs so the unique index doesn't block us
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;
    console.log('Cleared old deploy jobs');

    // Insert new deploy job
    const jobId = randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain,
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    
    console.log(`Deploy job queued: ${jobId}`);
    console.log('The dashboard worker will pick this up. Check /dashboard/queue for progress.');

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
