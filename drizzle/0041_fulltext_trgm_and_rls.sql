-- Enable pg_trgm extension for trigram-based fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fast LIKE/ILIKE and similarity search
CREATE INDEX IF NOT EXISTS domains_domain_trgm_idx ON domains USING gin (domain gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS domains_niche_trgm_idx ON domains USING gin (niche gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS domains_notes_trgm_idx ON domains USING gin (notes gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS articles_title_trgm_idx ON articles USING gin (title gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS articles_target_keyword_trgm_idx ON articles USING gin (target_keyword gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS articles_slug_trgm_idx ON articles USING gin (slug gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS keywords_keyword_trgm_idx ON keywords USING gin (keyword gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS page_definitions_title_trgm_idx ON page_definitions USING gin (title gin_trgm_ops);
--> statement-breakpoint

-- Row-level security hardening for sensitive tables
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
    AS PERMISSIVE FOR ALL TO current_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "sessions_backend_access" ON "sessions"
    AS PERMISSIVE FOR ALL TO current_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "subscribers_backend_access" ON "subscribers"
    AS PERMISSIVE FOR ALL TO current_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "growth_channel_credentials_backend_access" ON "growth_channel_credentials"
    AS PERMISSIVE FOR ALL TO current_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
