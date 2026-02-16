-- Make review_events.article_id nullable and add page_definition_id for page review audit
ALTER TABLE "review_events" ALTER COLUMN "article_id" DROP NOT NULL;
ALTER TABLE "review_events" ADD COLUMN "page_definition_id" uuid REFERENCES "page_definitions"("id") ON DELETE CASCADE;
CREATE INDEX "review_event_page_def_idx" ON "review_events" ("page_definition_id");
