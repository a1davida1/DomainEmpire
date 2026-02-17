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
  ADD COLUMN IF NOT EXISTS "user_agent_hash" text;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "user_agent_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "referrer_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "retention_expires_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscribers"
  ADD COLUMN IF NOT EXISTS "retention_policy_version" text NOT NULL DEFAULT 'subscriber-v1';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscriber_email_hash_idx"
  ON "subscribers" USING btree ("email_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_ip_hash_idx"
  ON "subscribers" USING btree ("ip_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_user_agent_hash_idx"
  ON "subscribers" USING btree ("user_agent_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_retention_expires_idx"
  ON "subscribers" USING btree ("retention_expires_at");
--> statement-breakpoint

-- Ensure no legacy raw subscriber metadata remains persisted.
ALTER TABLE "subscribers"
  DROP COLUMN IF EXISTS "ip_address";
--> statement-breakpoint
ALTER TABLE "subscribers"
  DROP COLUMN IF EXISTS "user_agent";
--> statement-breakpoint

-- Sensitive table hardening: enforce backend-only RLS posture.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscribers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "growth_channel_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "users_backend_access" ON "users"
    AS PERMISSIVE
    FOR ALL
    TO current_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "sessions_backend_access" ON "sessions"
    AS PERMISSIVE
    FOR ALL
    TO current_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "subscribers_backend_access" ON "subscribers"
    AS PERMISSIVE
    FOR ALL
    TO current_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "growth_channel_credentials_backend_access" ON "growth_channel_credentials"
    AS PERMISSIVE
    FOR ALL
    TO current_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
