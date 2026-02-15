CREATE TABLE IF NOT EXISTS "media_moderation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"escalate_after_hours" integer DEFAULT 48 NOT NULL,
	"due_at" timestamptz,
	"reviewer_id" uuid,
	"backup_reviewer_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamptz,
	"review_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "media_moderation_tasks_sla_window_check" CHECK ("media_moderation_tasks"."escalate_after_hours" >= "media_moderation_tasks"."sla_hours")
);
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
CREATE INDEX IF NOT EXISTS "media_moderation_task_user_idx" ON "media_moderation_tasks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_asset_idx" ON "media_moderation_tasks" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_status_idx" ON "media_moderation_tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_reviewer_idx" ON "media_moderation_tasks" USING btree ("reviewer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_due_at_idx" ON "media_moderation_tasks" USING btree ("due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_task_created_idx" ON "media_moderation_tasks" USING btree ("created_at");
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
	"created_at" timestamptz DEFAULT now()
);
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
CREATE UNIQUE INDEX IF NOT EXISTS "media_moderation_event_hash_uidx" ON "media_moderation_events" USING btree ("event_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_user_idx" ON "media_moderation_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_task_idx" ON "media_moderation_events" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_asset_idx" ON "media_moderation_events" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_type_idx" ON "media_moderation_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_moderation_event_created_idx" ON "media_moderation_events" USING btree ("created_at");
