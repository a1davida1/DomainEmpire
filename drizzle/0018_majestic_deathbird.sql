CREATE TABLE "domain_channel_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"compatibility" text DEFAULT 'supported' NOT NULL,
	"account_ref" text,
	"daily_cap" integer,
	"quiet_hours_start" integer,
	"quiet_hours_end" integer,
	"min_jitter_minutes" integer DEFAULT 15 NOT NULL,
	"max_jitter_minutes" integer DEFAULT 90 NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_channel_profile_jitter_check" CHECK ("domain_channel_profiles"."min_jitter_minutes" >= 0 AND "domain_channel_profiles"."max_jitter_minutes" >= "domain_channel_profiles"."min_jitter_minutes"),
	CONSTRAINT "domain_channel_profile_quiet_start_check" CHECK ("domain_channel_profiles"."quiet_hours_start" IS NULL OR ("domain_channel_profiles"."quiet_hours_start" >= 0 AND "domain_channel_profiles"."quiet_hours_start" <= 23)),
	CONSTRAINT "domain_channel_profile_quiet_end_check" CHECK ("domain_channel_profiles"."quiet_hours_end" IS NULL OR ("domain_channel_profiles"."quiet_hours_end" >= 0 AND "domain_channel_profiles"."quiet_hours_end" <= 23))
);
--> statement-breakpoint
ALTER TABLE "domain_channel_profiles" ADD CONSTRAINT "domain_channel_profiles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_channel_profile_domain_channel_uidx" ON "domain_channel_profiles" USING btree ("domain_id","channel");--> statement-breakpoint
CREATE INDEX "domain_channel_profile_domain_idx" ON "domain_channel_profiles" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_channel_profile_channel_idx" ON "domain_channel_profiles" USING btree ("channel");--> statement-breakpoint
