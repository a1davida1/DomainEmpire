CREATE TABLE IF NOT EXISTS "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_id" uuid,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"encrypted_credential" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamptz,
	"last_sync_status" text DEFAULT 'never' NOT NULL,
	"last_sync_error" text,
	"created_by" uuid,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connection_user_provider_domain_uidx" ON "integration_connections" USING btree ("user_id","provider","domain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_user_idx" ON "integration_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_domain_idx" ON "integration_connections" USING btree ("domain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_provider_idx" ON "integration_connections" USING btree ("provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_category_idx" ON "integration_connections" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_status_idx" ON "integration_connections" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connection_created_at_idx" ON "integration_connections" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"run_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamptz DEFAULT now() NOT NULL,
	"completed_at" timestamptz,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"records_upserted" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_by" uuid,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "integration_sync_runs_non_negative_counts_check" CHECK (
		"integration_sync_runs"."records_processed" >= 0
		AND "integration_sync_runs"."records_upserted" >= 0
		AND "integration_sync_runs"."records_failed" >= 0
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_connection_idx" ON "integration_sync_runs" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_status_idx" ON "integration_sync_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_started_at_idx" ON "integration_sync_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_completed_at_idx" ON "integration_sync_runs" USING btree ("completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_run_created_at_idx" ON "integration_sync_runs" USING btree ("created_at");
