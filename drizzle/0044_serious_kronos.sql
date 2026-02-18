CREATE TYPE "public"."page_status" AS ENUM('draft', 'review', 'approved', 'published', 'archived');--> statement-breakpoint
ALTER TABLE "page_definitions" DROP CONSTRAINT "page_def_status_chk";--> statement-breakpoint
ALTER TABLE "page_definitions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."page_status";--> statement-breakpoint
ALTER TABLE "page_definitions" ALTER COLUMN "status" SET DATA TYPE "public"."page_status" USING "status"::"public"."page_status";