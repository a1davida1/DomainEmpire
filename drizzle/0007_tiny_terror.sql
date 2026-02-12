CREATE TABLE "ab_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"test_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"variants" jsonb NOT NULL,
	"winner_id" text,
	"confidence_level" real,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitor_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"estimated_traffic" integer,
	"domain_authority" integer,
	"top_keywords" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"article_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"source" text DEFAULT 'lead_form' NOT NULL,
	"form_data" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"estimated_value" real,
	"converted_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriber_domain_email_unq" UNIQUE("domain_id","email")
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "health_score" real;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "health_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ab_test_article_idx" ON "ab_tests" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "ab_test_status_idx" ON "ab_tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comp_snapshot_competitor_idx" ON "competitor_snapshots" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "comp_snapshot_date_idx" ON "competitor_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "subscriber_domain_idx" ON "subscribers" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "subscriber_email_idx" ON "subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "subscriber_source_idx" ON "subscribers" USING btree ("source");--> statement-breakpoint
CREATE INDEX "subscriber_status_idx" ON "subscribers" USING btree ("status");