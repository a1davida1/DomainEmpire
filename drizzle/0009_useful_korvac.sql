CREATE TABLE "acquisition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_research_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_by" text DEFAULT 'system',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "preview_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"article_id" uuid,
	"domain_research_id" uuid,
	"preview_url" text NOT NULL,
	"expires_at" timestamp,
	"build_status" text DEFAULT 'queued' NOT NULL,
	"build_log" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"domain_id" uuid,
	"article_id" uuid,
	"domain_research_id" uuid,
	"checklist_json" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "listing_source" text;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "listing_id" text;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "listing_type" text;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "current_bid" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "buy_now_price" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "auction_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "demand_score" real;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "comps_score" real;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "tm_risk_score" real;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "history_risk_score" real;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "backlink_risk_score" real;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "comp_low" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "comp_high" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "recommended_max_bid" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "expected_12m_revenue_low" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "expected_12m_revenue_high" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "confidence_score" real;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "hard_fail_reason" text;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "underwriting_version" text;--> statement-breakpoint
ALTER TABLE "acquisition_events" ADD CONSTRAINT "acquisition_events_domain_research_id_domain_research_id_fk" FOREIGN KEY ("domain_research_id") REFERENCES "public"."domain_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD CONSTRAINT "preview_builds_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD CONSTRAINT "preview_builds_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD CONSTRAINT "preview_builds_domain_research_id_domain_research_id_fk" FOREIGN KEY ("domain_research_id") REFERENCES "public"."domain_research"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD CONSTRAINT "preview_builds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_domain_research_id_domain_research_id_fk" FOREIGN KEY ("domain_research_id") REFERENCES "public"."domain_research"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acquisition_events_domain_research_idx" ON "acquisition_events" USING btree ("domain_research_id");--> statement-breakpoint
CREATE INDEX "acquisition_events_event_type_idx" ON "acquisition_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "acquisition_events_created_idx" ON "acquisition_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "preview_build_domain_idx" ON "preview_builds" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "preview_build_article_idx" ON "preview_builds" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "preview_build_domain_research_idx" ON "preview_builds" USING btree ("domain_research_id");--> statement-breakpoint
CREATE INDEX "preview_build_status_idx" ON "preview_builds" USING btree ("build_status");--> statement-breakpoint
CREATE INDEX "preview_build_expires_idx" ON "preview_builds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "review_task_type_idx" ON "review_tasks" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "review_task_status_idx" ON "review_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_task_entity_idx" ON "review_tasks" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "review_task_domain_idx" ON "review_tasks" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "review_task_article_idx" ON "review_tasks" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "review_task_domain_research_idx" ON "review_tasks" USING btree ("domain_research_id");--> statement-breakpoint
CREATE INDEX "review_task_reviewed_at_idx" ON "review_tasks" USING btree ("reviewed_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_review_task_entity() RETURNS trigger AS $$
BEGIN
  IF NEW.task_type = 'domain_buy' THEN
    PERFORM 1 FROM domain_research WHERE id = NEW.entity_id;
  ELSIF NEW.task_type = 'content_publish' THEN
    PERFORM 1 FROM articles WHERE id = NEW.entity_id;
  ELSIF NEW.task_type = 'campaign_launch' THEN
    PERFORM 1 FROM domains WHERE id = NEW.entity_id;
  ELSE
    RETURN NEW;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entity_id % does not exist in target table for task_type %', NEW.entity_id, NEW.task_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER review_task_entity_check
  BEFORE INSERT OR UPDATE ON "review_tasks"
  FOR EACH ROW EXECUTE FUNCTION validate_review_task_entity();