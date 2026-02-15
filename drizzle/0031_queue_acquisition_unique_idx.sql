-- Partial unique index to prevent duplicate active acquisition jobs
-- for the same domainResearchId. Belt-and-suspenders alongside the
-- advisory lock in the decision route.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_active_bid_plan"
ON "content_queue" (
    "job_type",
    (payload ->> 'domainResearchId')
)
WHERE "status" IN ('pending', 'processing')
  AND "job_type" = 'create_bid_plan';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_active_enrich"
ON "content_queue" (
    "job_type",
    (payload ->> 'domainResearchId')
)
WHERE "status" IN ('pending', 'processing')
  AND "job_type" = 'enrich_candidate';

CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_active_score"
ON "content_queue" (
    "job_type",
    (payload ->> 'domainResearchId')
)
WHERE "status" IN ('pending', 'processing')
  AND "job_type" = 'score_candidate';
