-- Add review status to page_definitions for block-level review queue
ALTER TABLE "page_definitions" ADD COLUMN "status" text NOT NULL DEFAULT 'draft';
ALTER TABLE "page_definitions" ADD COLUMN "review_requested_at" timestamp;
ALTER TABLE "page_definitions" ADD COLUMN "last_reviewed_at" timestamp;
ALTER TABLE "page_definitions" ADD COLUMN "last_reviewed_by" uuid REFERENCES "users"("id");

-- Index for review queue queries
CREATE INDEX "page_def_status_idx" ON "page_definitions" ("status");
