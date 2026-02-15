CREATE TABLE IF NOT EXISTS "media_review_policy_alert_code_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"alert_code" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_review_policy_alert_daily_non_negative_check" CHECK ("media_review_policy_alert_code_daily_snapshots"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_review_policy_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"assignments" integer DEFAULT 0 NOT NULL,
	"overrides" integer DEFAULT 0 NOT NULL,
	"alert_events" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_review_policy_daily_non_negative_check" CHECK ("media_review_policy_daily_snapshots"."assignments" >= 0 AND "media_review_policy_daily_snapshots"."overrides" >= 0 AND "media_review_policy_daily_snapshots"."alert_events" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_review_policy_playbook_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"playbook_id" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_review_policy_playbook_daily_non_negative_check" CHECK ("media_review_policy_playbook_daily_snapshots"."count" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_review_policy_alert_code_daily_snapshots" ADD CONSTRAINT "media_review_policy_alert_code_daily_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_review_policy_daily_snapshots" ADD CONSTRAINT "media_review_policy_daily_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_review_policy_playbook_daily_snapshots" ADD CONSTRAINT "media_review_policy_playbook_daily_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_review_policy_alert_daily_user_code_uidx" ON "media_review_policy_alert_code_daily_snapshots" USING btree ("user_id","snapshot_date","alert_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_review_policy_alert_daily_user_date_idx" ON "media_review_policy_alert_code_daily_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_review_policy_alert_daily_code_idx" ON "media_review_policy_alert_code_daily_snapshots" USING btree ("alert_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_review_policy_daily_user_date_uidx" ON "media_review_policy_daily_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_review_policy_daily_user_idx" ON "media_review_policy_daily_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_review_policy_daily_date_idx" ON "media_review_policy_daily_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_review_policy_playbook_daily_user_playbook_uidx" ON "media_review_policy_playbook_daily_snapshots" USING btree ("user_id","snapshot_date","playbook_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_review_policy_playbook_daily_user_date_idx" ON "media_review_policy_playbook_daily_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_review_policy_playbook_daily_id_idx" ON "media_review_policy_playbook_daily_snapshots" USING btree ("playbook_id");
