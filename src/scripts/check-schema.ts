import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    // Cancel all pending/processing jobs
    const cancelled = await sql`
        UPDATE content_queue 
        SET status = 'cancelled', completed_at = NOW(), error_message = 'Bulk cleared by admin'
        WHERE status IN ('pending', 'processing')
        RETURNING id`;
    console.log(`Cancelled ${cancelled.length} pending/processing jobs`);

    // Count remaining by status
    const stats = await sql`
        SELECT status, count(*) as cnt FROM content_queue GROUP BY status ORDER BY cnt DESC`;
    console.log('\n=== QUEUE AFTER CLEAR ===');
    for (const s of stats) console.log(`  ${s.status}: ${s.cnt}`);
    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
