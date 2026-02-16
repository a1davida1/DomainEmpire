CREATE TABLE "cloudflare_shard_health" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cloudflare_shard_health_penalty_check" CHECK ("cloudflare_shard_health"."penalty" >= 0 AND "cloudflare_shard_health"."penalty" <= 100),
	CONSTRAINT "cloudflare_shard_health_success_count_check" CHECK ("cloudflare_shard_health"."success_count" >= 0),
	CONSTRAINT "cloudflare_shard_health_rate_limit_count_check" CHECK ("cloudflare_shard_health"."rate_limit_count" >= 0),
	CONSTRAINT "cloudflare_shard_health_failure_count_check" CHECK ("cloudflare_shard_health"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "domain_finance_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"entry_date" timestamp NOT NULL,
	"entry_type" text NOT NULL,
	"impact" text DEFAULT 'cost' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text,
	"source_ref" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_finance_monthly_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"month_start" timestamp NOT NULL,
	"month_end" timestamp NOT NULL,
	"revenue_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"margin_pct" numeric(7, 4),
	"entry_count" integer DEFAULT 0 NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"actor_id" uuid,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_ownership_events" (
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
--> statement-breakpoint
CREATE TABLE "domain_registrar_profiles" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_registrar_profile_risk_score_check" CHECK ("domain_registrar_profiles"."expiration_risk_score" >= 0 AND "domain_registrar_profiles"."expiration_risk_score" <= 100),
	CONSTRAINT "domain_registrar_profile_transfer_timeline_check" CHECK ("domain_registrar_profiles"."transfer_completed_at" IS NULL OR "domain_registrar_profiles"."transfer_requested_at" IS NULL OR "domain_registrar_profiles"."transfer_completed_at" >= "domain_registrar_profiles"."transfer_requested_at")
);
--> statement-breakpoint
CREATE TABLE "growth_credential_drill_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"initiated_by" uuid,
	"scope" text DEFAULT 'all' NOT NULL,
	"mode" text DEFAULT 'rotation_reconnect' NOT NULL,
	"status" text NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "media_asset_url_uidx";--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "revenue_30d" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "prompt_body" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "lifecycle_state" text DEFAULT 'sourced' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "purge_after_at" timestamp;--> statement-breakpoint
ALTER TABLE "qa_checklist_results" ADD COLUMN "unit_test_pass_id" text;--> statement-breakpoint
ALTER TABLE "qa_checklist_results" ADD COLUMN "calculation_config_hash" text;--> statement-breakpoint
ALTER TABLE "qa_checklist_results" ADD COLUMN "calculation_harness_version" text;--> statement-breakpoint
ALTER TABLE "cloudflare_shard_health" ADD CONSTRAINT "cloudflare_shard_health_source_connection_id_integration_connections_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_finance_ledger_entries" ADD CONSTRAINT "domain_finance_ledger_entries_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_finance_ledger_entries" ADD CONSTRAINT "domain_finance_ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_finance_monthly_closes" ADD CONSTRAINT "domain_finance_monthly_closes_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_finance_monthly_closes" ADD CONSTRAINT "domain_finance_monthly_closes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_lifecycle_events" ADD CONSTRAINT "domain_lifecycle_events_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_lifecycle_events" ADD CONSTRAINT "domain_lifecycle_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_profile_id_domain_registrar_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."domain_registrar_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_ownership_events" ADD CONSTRAINT "domain_ownership_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_registrar_profiles" ADD CONSTRAINT "domain_registrar_profiles_ownership_changed_by_users_id_fk" FOREIGN KEY ("ownership_changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_credential_drill_runs" ADD CONSTRAINT "growth_credential_drill_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_credential_drill_runs" ADD CONSTRAINT "growth_credential_drill_runs_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloudflare_shard_health_shard_account_uidx" ON "cloudflare_shard_health" USING btree ("shard_key","account_id");--> statement-breakpoint
CREATE INDEX "cloudflare_shard_health_account_idx" ON "cloudflare_shard_health" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "cloudflare_shard_health_cooldown_idx" ON "cloudflare_shard_health" USING btree ("cooldown_until");--> statement-breakpoint
CREATE INDEX "cloudflare_shard_health_updated_idx" ON "cloudflare_shard_health" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "domain_finance_ledger_domain_idx" ON "domain_finance_ledger_entries" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_finance_ledger_date_idx" ON "domain_finance_ledger_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "domain_finance_ledger_type_idx" ON "domain_finance_ledger_entries" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX "domain_finance_ledger_impact_idx" ON "domain_finance_ledger_entries" USING btree ("impact");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_finance_ledger_source_identity_uidx" ON "domain_finance_ledger_entries" USING btree ("domain_id","entry_date","source","source_ref");--> statement-breakpoint
CREATE INDEX "domain_finance_ledger_source_ref_idx" ON "domain_finance_ledger_entries" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "domain_finance_ledger_created_by_idx" ON "domain_finance_ledger_entries" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "domain_finance_close_domain_idx" ON "domain_finance_monthly_closes" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_finance_close_month_start_idx" ON "domain_finance_monthly_closes" USING btree ("month_start");--> statement-breakpoint
CREATE INDEX "domain_finance_close_closed_at_idx" ON "domain_finance_monthly_closes" USING btree ("closed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_finance_close_domain_month_uidx" ON "domain_finance_monthly_closes" USING btree ("domain_id","month_start");--> statement-breakpoint
CREATE INDEX "domain_lifecycle_event_domain_idx" ON "domain_lifecycle_events" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_lifecycle_event_actor_idx" ON "domain_lifecycle_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "domain_lifecycle_event_created_idx" ON "domain_lifecycle_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_ownership_event_domain_idx" ON "domain_ownership_events" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_ownership_event_profile_idx" ON "domain_ownership_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "domain_ownership_event_actor_idx" ON "domain_ownership_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "domain_ownership_event_type_idx" ON "domain_ownership_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "domain_ownership_event_created_idx" ON "domain_ownership_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_registrar_profile_domain_uidx" ON "domain_registrar_profiles" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_registrar_profile_connection_idx" ON "domain_registrar_profiles" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "domain_registrar_profile_transfer_status_idx" ON "domain_registrar_profiles" USING btree ("transfer_status");--> statement-breakpoint
CREATE INDEX "domain_registrar_profile_expiration_risk_idx" ON "domain_registrar_profiles" USING btree ("expiration_risk");--> statement-breakpoint
CREATE INDEX "domain_registrar_profile_updated_at_idx" ON "domain_registrar_profiles" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "growth_credential_drill_run_user_idx" ON "growth_credential_drill_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "growth_credential_drill_run_status_idx" ON "growth_credential_drill_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "growth_credential_drill_run_started_at_idx" ON "growth_credential_drill_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "growth_credential_drill_run_user_started_at_idx" ON "growth_credential_drill_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "api_call_prompt_hash_idx" ON "api_call_logs" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX "domain_lifecycle_state_idx" ON "domains" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "media_asset_deleted_at_idx" ON "media_assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "media_asset_purge_after_idx" ON "media_assets" USING btree ("purge_after_at");--> statement-breakpoint
CREATE INDEX "qa_result_unit_test_pass_idx" ON "qa_checklist_results" USING btree ("unit_test_pass_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_url_uidx" ON "media_assets" USING btree ("url") WHERE "media_assets"."deleted_at" IS NULL;