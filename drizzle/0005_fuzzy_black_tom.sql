CREATE TABLE "article_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"usage" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "article_dataset_unq" UNIQUE("article_id","dataset_id")
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_url" text,
	"source_title" text,
	"publisher" text,
	"retrieved_at" timestamp DEFAULT now(),
	"effective_date" timestamp,
	"expires_at" timestamp,
	"freshness_class" text DEFAULT 'monthly',
	"data" jsonb DEFAULT '{}'::jsonb,
	"data_hash" text,
	"version" integer DEFAULT 1,
	"domain_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "api_call_logs" DROP CONSTRAINT "api_call_logs_article_id_articles_id_fk";
--> statement-breakpoint
ALTER TABLE "api_call_logs" DROP CONSTRAINT "api_call_logs_domain_id_domains_id_fk";
--> statement-breakpoint
ALTER TABLE "content_queue" DROP CONSTRAINT "content_queue_keyword_id_keywords_id_fk";
--> statement-breakpoint
ALTER TABLE "compliance_snapshots" ALTER COLUMN "metrics" SET DEFAULT '{"ymylApprovalRate":0,"citationCoverageRatio":0,"avgTimeInReviewHours":0,"articlesWithExpertReview":0,"articlesWithQaPassed":0,"disclosureComplianceRate":0,"meaningfulEditRatio":0,"totalPublished":0,"totalInReview":0}'::jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "content_type" text DEFAULT 'article';--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "calculator_config" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "comparison_data" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "lead_gen_config" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cost_guide_data" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "article_datasets" ADD CONSTRAINT "article_datasets_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_datasets" ADD CONSTRAINT "article_datasets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_dataset_article_idx" ON "article_datasets" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_dataset_dataset_idx" ON "article_datasets" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "dataset_name_idx" ON "datasets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "dataset_expires_idx" ON "datasets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "dataset_domain_idx" ON "datasets" USING btree ("domain_id");--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_queue" ADD CONSTRAINT "content_queue_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_content_type_idx" ON "articles" USING btree ("content_type");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_snapshot_domain_date_uidx" ON "compliance_snapshots" USING btree ("domain_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "content_queue_scheduled_for_idx" ON "content_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "content_queue_status_idx" ON "content_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_queue_job_type_idx" ON "content_queue" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "keyword_article_idx" ON "keywords" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "revenue_snapshot_domain_idx" ON "revenue_snapshots" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "revenue_snapshot_date_idx" ON "revenue_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_snapshot_domain_date_uidx" ON "revenue_snapshots" USING btree ("domain_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "review_event_article_type_actor_uidx" ON "review_events" USING btree ("article_id","event_type","actor_id");--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keyword_domain_keyword_unq" UNIQUE("domain_id","keyword");