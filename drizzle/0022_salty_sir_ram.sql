CREATE TABLE IF NOT EXISTS "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_id" uuid,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"encrypted_credential" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" text DEFAULT 'never' NOT NULL,
	"last_sync_error" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"run_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"records_upserted" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_sync_runs_non_negative_counts_check" CHECK ("integration_sync_runs"."records_processed" >= 0 AND "integration_sync_runs"."records_upserted" >= 0 AND "integration_sync_runs"."records_failed" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_event_hash" text,
	"event_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_moderation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"escalate_after_hours" integer DEFAULT 48 NOT NULL,
	"due_at" timestamp,
	"reviewer_id" uuid,
	"backup_reviewer_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "media_moderation_tasks_sla_window_check" CHECK ("media_moderation_tasks"."escalate_after_hours" >= "media_moderation_tasks"."sla_hours")
);
--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "registration_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "aftermarket_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ALTER COLUMN "budget" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "subscribers" ALTER COLUMN "estimated_value" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_events" ADD CONSTRAINT "media_moderation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_events" ADD CONSTRAINT "media_moderation_events_task_id_media_moderation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."media_moderation_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_events" ADD CONSTRAINT "media_moderation_events_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_events" ADD CONSTRAINT "media_moderation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_tasks" ADD CONSTRAINT "media_moderation_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_tasks" ADD CONSTRAINT "media_moderation_tasks_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_tasks" ADD CONSTRAINT "media_moderation_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_tasks" ADD CONSTRAINT "media_moderation_tasks_backup_reviewer_id_users_id_fk" FOREIGN KEY ("backup_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_tasks" ADD CONSTRAINT "media_moderation_tasks_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_moderation_tasks" ADD CONSTRAINT "media_moderation_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connection_user_provider_domain_uidx" ON "integration_connections" USING btree ("user_id","provider","domain_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_user_idx" ON "integration_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_domain_idx" ON "integration_connections" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_provider_idx" ON "integration_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_category_idx" ON "integration_connections" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_status_idx" ON "integration_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_created_at_idx" ON "integration_connections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_connection_idx" ON "integration_sync_runs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_status_idx" ON "integration_sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_started_at_idx" ON "integration_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_completed_at_idx" ON "integration_sync_runs" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_created_at_idx" ON "integration_sync_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_moderation_event_hash_uidx" ON "media_moderation_events" USING btree ("event_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_moderation_event_task_prev_hash_uidx" ON "media_moderation_events" USING btree ("task_id","prev_event_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_user_idx" ON "media_moderation_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_task_idx" ON "media_moderation_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_asset_idx" ON "media_moderation_events" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_type_idx" ON "media_moderation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_created_idx" ON "media_moderation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_user_idx" ON "media_moderation_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_asset_idx" ON "media_moderation_tasks" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_status_idx" ON "media_moderation_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_reviewer_idx" ON "media_moderation_tasks" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_due_at_idx" ON "media_moderation_tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_created_idx" ON "media_moderation_tasks" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_asset_user_idx" ON "media_assets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_asset_url_uidx" ON "media_assets" USING btree ("url");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshot_domain_date_unq" UNIQUE("domain_id","snapshot_date");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "comp_snapshot_competitor_date_unq" UNIQUE("competitor_id","snapshot_date");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
