CREATE TABLE IF NOT EXISTS "cloudflare_shard_health" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "shard_key" text NOT NULL,
    "account_id" text NOT NULL,
    "source_connection_id" uuid,
    "penalty" integer DEFAULT 0 NOT NULL,
    "cooldown_until" timestamp,
    "success_count" integer DEFAULT 0 NOT NULL,
    "rate_limit_count" integer DEFAULT 0 NOT NULL,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "last_outcome" text DEFAULT 'success' NOT NULL,
    "last_outcome_at" timestamp,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "cloudflare_shard_health"
 ADD CONSTRAINT "cloudflare_shard_health_source_conn_fk"
 FOREIGN KEY ("source_connection_id")
 REFERENCES "public"."integration_connections"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "cloudflare_shard_health"
 ADD CONSTRAINT "cloudflare_shard_health_penalty_check"
 CHECK ("cloudflare_shard_health"."penalty" >= 0 AND "cloudflare_shard_health"."penalty" <= 100);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "cloudflare_shard_health"
 ADD CONSTRAINT "cloudflare_shard_health_success_count_check"
 CHECK ("cloudflare_shard_health"."success_count" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "cloudflare_shard_health"
 ADD CONSTRAINT "cloudflare_shard_health_rate_limit_count_check"
 CHECK ("cloudflare_shard_health"."rate_limit_count" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "cloudflare_shard_health"
 ADD CONSTRAINT "cloudflare_shard_health_failure_count_check"
 CHECK ("cloudflare_shard_health"."failure_count" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "cloudflare_shard_health"
 ADD CONSTRAINT "cloudflare_shard_health_last_outcome_check"
 CHECK ("cloudflare_shard_health"."last_outcome" IN ('success', 'rate_limited', 'failure'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "cloudflare_shard_health_shard_account_uidx"
ON "cloudflare_shard_health" USING btree ("shard_key", "account_id");

CREATE INDEX IF NOT EXISTS "cloudflare_shard_health_account_idx"
ON "cloudflare_shard_health" USING btree ("account_id");

CREATE INDEX IF NOT EXISTS "cloudflare_shard_health_cooldown_idx"
ON "cloudflare_shard_health" USING btree ("cooldown_until");

CREATE INDEX IF NOT EXISTS "cloudflare_shard_health_updated_idx"
ON "cloudflare_shard_health" USING btree ("updated_at");
