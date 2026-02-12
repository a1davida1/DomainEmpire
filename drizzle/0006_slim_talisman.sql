CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_token_unique";--> statement-breakpoint
DROP INDEX "review_event_article_type_actor_uidx";--> statement-breakpoint
DROP INDEX "session_token_idx";--> statement-breakpoint
ALTER TABLE "api_call_logs" ALTER COLUMN "cost" SET DATA TYPE numeric(12, 4);--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "generation_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "humanization_score" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "bounce_rate" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "revenue_30d" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "revenue_30d" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "staleness_score" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "content_queue" ALTER COLUMN "api_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "content_queue" ALTER COLUMN "api_cost" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "keyword_cpc" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "estimated_revenue_potential" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "domain_score" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "domains" ALTER COLUMN "purchase_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "domains" ALTER COLUMN "renewal_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "keywords" ALTER COLUMN "cpc" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "ad_revenue" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "ad_revenue" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "affiliate_revenue" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "affiliate_revenue" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "lead_gen_revenue" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "lead_gen_revenue" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "total_revenue" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "total_revenue" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "avg_position" SET DATA TYPE numeric(8, 2);--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ALTER COLUMN "ctr" SET DATA TYPE numeric(8, 4);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "wizard_config" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "geo_data" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cta_config" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_redirect_target_id_domains_id_fk" FOREIGN KEY ("redirect_target_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_call_article_idx" ON "api_call_logs" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "api_call_domain_idx" ON "api_call_logs" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "api_call_stage_idx" ON "api_call_logs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "api_call_created_idx" ON "api_call_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "article_published_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "article_domain_slug_uidx" ON "articles" USING btree ("domain_id","slug");--> statement-breakpoint
CREATE INDEX "backlink_snapshot_domain_idx" ON "backlink_snapshots" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "backlink_snapshot_date_idx" ON "backlink_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "competitor_domain_idx" ON "competitors" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "content_queue_priority_idx" ON "content_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "content_queue_locked_until_idx" ON "content_queue" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_fingerprint_idx" ON "notifications" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "session_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "token";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash");