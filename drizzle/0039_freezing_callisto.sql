CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_events" DROP CONSTRAINT IF EXISTS "review_events_page_definition_id_page_definitions_id_fk";
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN IF NOT EXISTS "prompt_body_redacted" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "email_hash" text;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "subscribers"
    WHERE "email" IS NULL OR trim("email") = ''
  ) THEN
    RAISE EXCEPTION 'Cannot backfill subscribers.email_hash: found NULL/blank subscribers.email rows';
  END IF;
END $$;--> statement-breakpoint
UPDATE "subscribers"
SET "email_hash" = encode(digest(lower(trim("email")), 'sha256'), 'hex')
WHERE "email_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ALTER COLUMN "email_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "phone_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "ip_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "user_agent_fingerprint" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "referrer_fingerprint" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_events" ADD CONSTRAINT "review_events_page_definition_id_page_definitions_id_fk" FOREIGN KEY ("page_definition_id") REFERENCES "public"."page_definitions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_email_hash_idx" ON "subscribers" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_ip_hash_idx" ON "subscribers" USING btree ("ip_hash");--> statement-breakpoint
ALTER TABLE "api_call_logs" DROP COLUMN IF EXISTS "prompt_body";
