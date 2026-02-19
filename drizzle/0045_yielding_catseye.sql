ALTER TABLE "articles" ADD COLUMN "content_ngram_hashes" jsonb;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_review_result" jsonb;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_review_score" integer;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_reviewed_at" timestamp;