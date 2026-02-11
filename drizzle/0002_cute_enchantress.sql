ALTER TABLE "domain_research" ADD COLUMN "evaluation_result" jsonb;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "evaluation_history" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "domain_research" ADD COLUMN "evaluated_at" timestamp;