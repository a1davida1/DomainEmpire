ALTER TABLE "growth_credential_drill_runs" ALTER COLUMN "completed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "growth_credential_drill_runs" ALTER COLUMN "completed_at" DROP NOT NULL;