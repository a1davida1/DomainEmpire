ALTER TABLE "domains"
ADD COLUMN IF NOT EXISTS "lifecycle_state" text DEFAULT 'sourced' NOT NULL;

DO $$ BEGIN
 ALTER TABLE "domains" ADD CONSTRAINT "domains_lifecycle_state_check"
 CHECK ("domains"."lifecycle_state" IN (
    'sourced',
    'underwriting',
    'approved',
    'acquired',
    'build',
    'growth',
    'monetized',
    'hold',
    'sell',
    'sunset'
 ));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "domain_lifecycle_state_idx" ON "domains" USING btree ("lifecycle_state");

CREATE TABLE IF NOT EXISTS "domain_lifecycle_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "domain_id" uuid NOT NULL,
    "actor_id" uuid,
    "from_state" text NOT NULL,
    "to_state" text NOT NULL,
    "reason" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "domain_lifecycle_events" ADD CONSTRAINT "domain_lifecycle_events_domain_id_domains_id_fk"
 FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_lifecycle_events" ADD CONSTRAINT "domain_lifecycle_events_actor_id_users_id_fk"
 FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_lifecycle_events" ADD CONSTRAINT "domain_lifecycle_events_from_state_check"
 CHECK ("domain_lifecycle_events"."from_state" IN (
    'sourced',
    'underwriting',
    'approved',
    'acquired',
    'build',
    'growth',
    'monetized',
    'hold',
    'sell',
    'sunset'
 ));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_lifecycle_events" ADD CONSTRAINT "domain_lifecycle_events_to_state_check"
 CHECK ("domain_lifecycle_events"."to_state" IN (
    'sourced',
    'underwriting',
    'approved',
    'acquired',
    'build',
    'growth',
    'monetized',
    'hold',
    'sell',
    'sunset'
 ));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "domain_lifecycle_event_domain_idx" ON "domain_lifecycle_events" USING btree ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_lifecycle_event_actor_idx" ON "domain_lifecycle_events" USING btree ("actor_id");
CREATE INDEX IF NOT EXISTS "domain_lifecycle_event_created_idx" ON "domain_lifecycle_events" USING btree ("created_at");
