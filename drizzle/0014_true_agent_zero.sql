CREATE TABLE "media_asset_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_research_id" uuid NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"daily_cap" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "media_asset_usage" ADD CONSTRAINT "media_asset_usage_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_usage" ADD CONSTRAINT "media_asset_usage_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_usage" ADD CONSTRAINT "media_asset_usage_job_id_promotion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."promotion_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_domain_research_id_domain_research_id_fk" FOREIGN KEY ("domain_research_id") REFERENCES "public"."domain_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_events" ADD CONSTRAINT "promotion_events_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_jobs" ADD CONSTRAINT "promotion_jobs_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_asset_usage_asset_idx" ON "media_asset_usage" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "media_asset_usage_campaign_idx" ON "media_asset_usage" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "media_asset_usage_job_idx" ON "media_asset_usage" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "media_asset_usage_created_idx" ON "media_asset_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "media_asset_type_idx" ON "media_assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "media_asset_usage_count_idx" ON "media_assets" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "media_asset_created_idx" ON "media_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "promotion_campaign_domain_research_idx" ON "promotion_campaigns" USING btree ("domain_research_id");--> statement-breakpoint
CREATE INDEX "promotion_campaign_status_idx" ON "promotion_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotion_campaign_created_idx" ON "promotion_campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "promotion_event_campaign_idx" ON "promotion_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "promotion_event_type_idx" ON "promotion_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "promotion_event_occurred_idx" ON "promotion_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "promotion_job_campaign_idx" ON "promotion_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "promotion_job_status_idx" ON "promotion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotion_job_created_idx" ON "promotion_jobs" USING btree ("created_at");