CREATE TABLE IF NOT EXISTS "domain_finance_ledger_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "domain_id" uuid NOT NULL,
    "entry_date" date NOT NULL,
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

DO $$ BEGIN
 ALTER TABLE "domain_finance_ledger_entries" ADD CONSTRAINT "domain_finance_ledger_entries_domain_id_domains_id_fk"
 FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_finance_ledger_entries" ADD CONSTRAINT "domain_finance_ledger_entries_created_by_users_id_fk"
 FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_finance_ledger_entries" ADD CONSTRAINT "domain_finance_ledger_entries_type_check"
 CHECK ("domain_finance_ledger_entries"."entry_type" IN (
    'acquisition_cost',
    'build_cost',
    'operating_cost',
    'channel_spend',
    'revenue',
    'adjustment'
 ));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_finance_ledger_entries" ADD CONSTRAINT "domain_finance_ledger_entries_impact_check"
 CHECK ("domain_finance_ledger_entries"."impact" IN ('revenue', 'cost'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "domain_finance_ledger_domain_idx" ON "domain_finance_ledger_entries" USING btree ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_finance_ledger_date_idx" ON "domain_finance_ledger_entries" USING btree ("entry_date");
CREATE INDEX IF NOT EXISTS "domain_finance_ledger_type_idx" ON "domain_finance_ledger_entries" USING btree ("entry_type");
CREATE INDEX IF NOT EXISTS "domain_finance_ledger_impact_idx" ON "domain_finance_ledger_entries" USING btree ("impact");
CREATE INDEX IF NOT EXISTS "domain_finance_ledger_source_ref_idx" ON "domain_finance_ledger_entries" USING btree ("source_ref");
CREATE INDEX IF NOT EXISTS "domain_finance_ledger_created_by_idx" ON "domain_finance_ledger_entries" USING btree ("created_by");

CREATE TABLE IF NOT EXISTS "domain_finance_monthly_closes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "domain_id" uuid NOT NULL,
    "month_start" date NOT NULL,
    "month_end" date NOT NULL,
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

DO $$ BEGIN
 ALTER TABLE "domain_finance_monthly_closes" ADD CONSTRAINT "domain_finance_monthly_closes_domain_id_domains_id_fk"
 FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "domain_finance_monthly_closes" ADD CONSTRAINT "domain_finance_monthly_closes_closed_by_users_id_fk"
 FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "domain_finance_close_domain_idx" ON "domain_finance_monthly_closes" USING btree ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_finance_close_month_start_idx" ON "domain_finance_monthly_closes" USING btree ("month_start");
CREATE INDEX IF NOT EXISTS "domain_finance_close_closed_at_idx" ON "domain_finance_monthly_closes" USING btree ("closed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_finance_close_domain_month_uidx" ON "domain_finance_monthly_closes" USING btree ("domain_id","month_start");
