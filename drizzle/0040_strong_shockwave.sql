DO $$ BEGIN
  ALTER TABLE "page_definitions" DROP CONSTRAINT IF EXISTS "page_definitions_last_reviewed_by_users_id_fk";
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "page_variants" ALTER COLUMN "impressions" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "page_variants" ALTER COLUMN "conversions" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "user_agent_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "retention_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "retention_policy_version" text DEFAULT 'subscriber-v1' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "page_definitions" ADD CONSTRAINT "page_definitions_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_user_agent_hash_idx" ON "subscribers" USING btree ("user_agent_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_retention_expires_idx" ON "subscribers" USING btree ("retention_expires_at");--> statement-breakpoint
ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "ip_address";--> statement-breakpoint
ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "user_agent";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "page_variants" ADD CONSTRAINT "ab_page_variants_weight_check" CHECK ("page_variants"."weight" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
