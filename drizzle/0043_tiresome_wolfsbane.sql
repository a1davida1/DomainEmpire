DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'page_status') THEN
    CREATE TYPE "public"."page_status" AS ENUM('draft', 'review', 'approved', 'published', 'archived');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "page_definitions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."page_status";--> statement-breakpoint
ALTER TABLE "page_definitions" ALTER COLUMN "status" SET DATA TYPE "public"."page_status" USING "status"::"public"."page_status";