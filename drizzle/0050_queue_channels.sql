-- Add channel column to content_queue for 2-lane queue architecture
-- 'build' = AI content pipeline (outline, draft, polish, SEO, etc.)
-- 'maintain' = scheduled recurring content updates
-- NULL = inline/legacy jobs (deploys run inline, old jobs)
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS channel text;

-- Index for channel-based worker polling
CREATE INDEX IF NOT EXISTS content_queue_channel_idx ON content_queue (channel);

-- Drop old worker poll index and recreate with channel prefix
DROP INDEX IF EXISTS content_queue_worker_poll_idx;
CREATE INDEX content_queue_worker_poll_idx ON content_queue (channel, status, locked_until, scheduled_for, priority DESC, created_at ASC);

-- Backfill existing pending/processing content jobs to 'build' channel
UPDATE content_queue
SET channel = 'build'
WHERE status IN ('pending', 'processing')
  AND job_type NOT IN ('deploy', 'domain_site_review')
  AND channel IS NULL;
