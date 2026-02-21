import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const domainName = 'bracescost.org';
    const domainId = '43e87bac-44a7-4154-b417-d70a6e1146eb';

    // Cancel any existing deploy jobs
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;

    // Queue a new deploy
    const jobId = crypto.randomUUID();
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain: domainName,
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    console.log(`Deploy queued for ${domainName}: ${jobId}`);

    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
