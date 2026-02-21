import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const jobId = process.argv[2] || '1e0e6fe8-4b4a-4fc5-a36a-c71419e290e5';
    
    const jobs = await sql`SELECT id, job_type, status, error_message, attempts, result, created_at, started_at, completed_at FROM content_queue WHERE id = ${jobId}`;
    
    if (jobs.length === 0) {
        console.log('Job not found');
    } else {
        const job = jobs[0];
        console.log('Status:', job.status);
        console.log('Attempts:', job.attempts);
        console.log('Created:', job.created_at);
        console.log('Started:', job.started_at);
        console.log('Completed:', job.completed_at);
        if (job.error_message) console.log('Error:', job.error_message);
        if (job.result) console.log('Result:', JSON.stringify(job.result, null, 2));
    }

    // Also check if there are any processing jobs
    const processing = await sql`SELECT id, job_type, status, created_at, started_at FROM content_queue WHERE status = 'processing' LIMIT 5`;
    console.log('\nCurrently processing jobs:', JSON.stringify(processing, null, 2));

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
