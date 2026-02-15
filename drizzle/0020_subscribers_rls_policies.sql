-- Enable RLS on subscribers (idempotent if already enabled)
ALTER TABLE "subscribers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Allow the application database role full access to subscribers.
-- Domain-scoped access control is enforced at the application layer
-- (see src/lib/subscribers/index.ts and src/app/api/subscribers/route.ts).
DO $$ BEGIN
  CREATE POLICY "subscribers_app_access" ON "subscribers"
    AS PERMISSIVE
    FOR ALL
    TO current_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
