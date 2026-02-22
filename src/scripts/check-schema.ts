import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    // Apply queue channels migration
    await sql`ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS channel text`;
    console.log('Added channel column');

    await sql`CREATE INDEX IF NOT EXISTS content_queue_channel_idx ON content_queue (channel)`;
    console.log('Created channel index');

    await sql`DROP INDEX IF EXISTS content_queue_worker_poll_idx`;
    await sql`CREATE INDEX content_queue_worker_poll_idx ON content_queue (channel, status, locked_until, scheduled_for, priority DESC, created_at ASC)`;
    console.log('Recreated worker poll index with channel');

    // Backfill existing pending/processing content jobs to 'build' channel
    const backfilled = await sql`
        UPDATE content_queue
        SET channel = 'build'
        WHERE status IN ('pending', 'processing')
          AND job_type NOT IN ('deploy', 'domain_site_review')
          AND channel IS NULL
        RETURNING id`;
    console.log(`Backfilled ${backfilled.length} jobs to 'build' channel`);

    // Verify
    const stats = await sql`
        SELECT channel, count(*) as cnt FROM content_queue GROUP BY channel ORDER BY cnt DESC`;
    console.log('\n=== QUEUE BY CHANNEL ===');
    for (const s of stats) console.log(`  ${s.channel || '(null/legacy)'}: ${s.cnt}`);
    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
