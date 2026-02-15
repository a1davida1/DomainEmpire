CREATE TABLE IF NOT EXISTS "growth_credential_drill_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"initiated_by" uuid,
	"scope" text DEFAULT 'all' NOT NULL,
	"mode" text DEFAULT 'rotation_reconnect' NOT NULL,
	"status" text NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "growth_credential_drill_scope_check" CHECK ("growth_credential_drill_runs"."scope" IN ('all', 'pinterest', 'youtube_shorts')),
	CONSTRAINT "growth_credential_drill_mode_check" CHECK ("growth_credential_drill_runs"."mode" IN ('dry_run', 'rotation_reconnect')),
	CONSTRAINT "growth_credential_drill_status_check" CHECK ("growth_credential_drill_runs"."status" IN ('success', 'failed', 'partial'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "growth_credential_drill_runs" ADD CONSTRAINT "growth_credential_drill_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "growth_credential_drill_runs" ADD CONSTRAINT "growth_credential_drill_runs_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_credential_drill_run_user_idx" ON "growth_credential_drill_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_credential_drill_run_status_idx" ON "growth_credential_drill_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_credential_drill_run_started_at_idx" ON "growth_credential_drill_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_credential_drill_run_user_started_at_idx" ON "growth_credential_drill_runs" USING btree ("user_id", "started_at");
