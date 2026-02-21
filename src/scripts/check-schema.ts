import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '43e87bac-44a7-4154-b417-d70a6e1146eb';
    const jobs = await sql`SELECT id, status, started_at, completed_at FROM content_queue WHERE domain_id = ${domainId} AND job_type = 'deploy' ORDER BY created_at DESC LIMIT 3`;
    for (const j of jobs) console.log(j);
    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
