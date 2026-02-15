CREATE TABLE IF NOT EXISTS "domain_registrar_profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "domain_id" uuid NOT NULL,
    "connection_id" uuid,
    "ownership_status" text DEFAULT 'unknown' NOT NULL,
    "transfer_status" text DEFAULT 'none' NOT NULL,
    "transfer_target_registrar" text,
    "transfer_requested_at" timestamp,
    "transfer_completed_at" timestamp,
    "auto_renew_enabled" boolean DEFAULT true NOT NULL,
    "lock_status" text DEFAULT 'unknown' NOT NULL,
    "dnssec_status" text DEFAULT 'unknown' NOT NULL,
    "expiration_risk" text DEFAULT 'unknown' NOT NULL,
    "expiration_risk_score" integer DEFAULT 0 NOT NULL,
    "expiration_risk_updated_at" timestamp,
    "ownership_last_changed_at" timestamp,
    "ownership_changed_by" uuid,
    "owner_handle" text,
    "notes" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "last_synced_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_domain_fk"
 FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_connection_fk"
 FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_ownership_actor_fk"
 FOREIGN KEY ("ownership_changed_by") REFERENCES "public"."users"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_ownership_status_check"
 CHECK ("domain_registrar_profiles"."ownership_status" IN ('unknown', 'unverified', 'verified', 'pending_transfer', 'transferred'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_transfer_status_check"
 CHECK ("domain_registrar_profiles"."transfer_status" IN ('none', 'initiated', 'pending', 'completed', 'failed'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_lock_status_check"
 CHECK ("domain_registrar_profiles"."lock_status" IN ('unknown', 'locked', 'unlocked'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_dnssec_status_check"
 CHECK ("domain_registrar_profiles"."dnssec_status" IN ('unknown', 'enabled', 'disabled'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_expiration_risk_check"
 CHECK ("domain_registrar_profiles"."expiration_risk" IN ('unknown', 'none', 'low', 'medium', 'high', 'critical', 'expired'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_risk_score_check"
 CHECK ("domain_registrar_profiles"."expiration_risk_score" >= 0 AND "domain_registrar_profiles"."expiration_risk_score" <= 100);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_transfer_timeline_check"
 CHECK (
    "domain_registrar_profiles"."transfer_completed_at" IS NULL
    OR "domain_registrar_profiles"."transfer_requested_at" IS NULL
    OR "domain_registrar_profiles"."transfer_completed_at" >= "domain_registrar_profiles"."transfer_requested_at"
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "domain_registrar_profile_domain_uidx" ON "domain_registrar_profiles" USING btree ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_registrar_profile_connection_idx" ON "domain_registrar_profiles" USING btree ("connection_id");
CREATE INDEX IF NOT EXISTS "domain_registrar_profile_transfer_status_idx" ON "domain_registrar_profiles" USING btree ("transfer_status");
CREATE INDEX IF NOT EXISTS "domain_registrar_profile_expiration_risk_idx" ON "domain_registrar_profiles" USING btree ("expiration_risk");
CREATE INDEX IF NOT EXISTS "domain_registrar_profile_updated_at_idx" ON "domain_registrar_profiles" USING btree ("updated_at");

CREATE TABLE IF NOT EXISTS "domain_ownership_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "domain_id" uuid NOT NULL,
    "profile_id" uuid,
    "actor_id" uuid,
    "event_type" text NOT NULL,
    "source" text DEFAULT 'manual' NOT NULL,
    "summary" text NOT NULL,
    "previous_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "next_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "reason" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_domain_fk"
 FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_profile_fk"
 FOREIGN KEY ("profile_id") REFERENCES "public"."domain_registrar_profiles"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_actor_fk"
 FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_type_check"
 CHECK (
    "domain_ownership_events"."event_type" IN (
        'ownership_verified',
        'ownership_changed',
        'registrar_changed',
        'transfer_initiated',
        'transfer_completed',
        'transfer_failed',
        'lock_changed',
        'dnssec_changed',
        'auto_renew_changed',
        'risk_recomputed'
    )
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_source_check"
 CHECK ("domain_ownership_events"."source" IN ('manual', 'integration_sync', 'system'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "domain_ownership_event_domain_idx" ON "domain_ownership_events" USING btree ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_ownership_event_profile_idx" ON "domain_ownership_events" USING btree ("profile_id");
CREATE INDEX IF NOT EXISTS "domain_ownership_event_actor_idx" ON "domain_ownership_events" USING btree ("actor_id");
CREATE INDEX IF NOT EXISTS "domain_ownership_event_type_idx" ON "domain_ownership_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "domain_ownership_event_created_idx" ON "domain_ownership_events" USING btree ("created_at");
