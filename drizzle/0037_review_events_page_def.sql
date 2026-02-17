-- Make review_events.article_id nullable and add page_definition_id for page review audit
ALTER TABLE "review_events" ALTER COLUMN "article_id" DROP NOT NULL;
ALTER TABLE "review_events" ADD COLUMN "page_definition_id" uuid;
ALTER TABLE "review_events"
  ADD CONSTRAINT "review_events_page_definition_id_page_definitions_id_fk"
  FOREIGN KEY ("page_definition_id") REFERENCES "page_definitions"("id") ON DELETE SET NULL;
CREATE INDEX "review_event_page_def_idx" ON "review_events" ("page_definition_id");
