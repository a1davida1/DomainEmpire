-- Privacy hardening: redact prompt storage, retain review-event audit rows,
-- and add hashed subscriber metadata fields.

ALTER TABLE "review_events"
  DROP CONSTRAINT IF EXISTS "review_events_page_definition_id_page_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "review_events"
  ADD CONSTRAINT "review_events_page_definition_id_page_definitions_id_fk"
  FOREIGN KEY ("page_definition_id") REFERENCES "public"."page_definitions"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "api_call_logs"
  ADD COLUMN IF NOT EXISTS "prompt_body_redacted" text;
--> statement-breakpoint
UPDATE "api_call_logs"
SET "prompt_body_redacted" = '[legacy-redacted]'
WHERE "prompt_body_redacted" IS NULL AND "prompt_body" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_call_logs"
  DROP COLUMN IF EXISTS "prompt_body";
--> statement-breakpoint

ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "email_hash" text;
--> statement-breakpoint
UPDATE "subscribers"
SET "email_hash" = encode(digest(lower(trim("email")), 'sha256'), 'hex')
WHERE "email_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ALTER COLUMN "email_hash" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "phone_hash" text;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "ip_hash" text;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "user_agent_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "referrer_fingerprint" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscriber_email_hash_idx"
  ON "subscribers" USING btree ("email_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_ip_hash_idx"
  ON "subscribers" USING btree ("ip_hash");
