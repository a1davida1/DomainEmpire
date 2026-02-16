CREATE TABLE "domain_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_url" text,
	"source_title" text,
	"confidence" numeric(3, 2) DEFAULT 0.7 NOT NULL,
	"first_seen_article_id" uuid,
	"last_used_at" timestamp DEFAULT now(),
	"use_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "ai_detection_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "ai_detection_result" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "ai_detection_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "domain_knowledge" ADD CONSTRAINT "domain_knowledge_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_knowledge" ADD CONSTRAINT "domain_knowledge_first_seen_article_id_articles_id_fk" FOREIGN KEY ("first_seen_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_knowledge_domain_idx" ON "domain_knowledge" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_knowledge_category_idx" ON "domain_knowledge" USING btree ("domain_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_knowledge_content_hash_uidx" ON "domain_knowledge" USING btree ("domain_id","content_hash");--> statement-breakpoint
CREATE INDEX "domain_knowledge_last_used_idx" ON "domain_knowledge" USING btree ("last_used_at");