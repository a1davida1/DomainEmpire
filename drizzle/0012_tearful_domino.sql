ALTER TABLE "api_call_logs" ADD COLUMN "model_key" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "resolved_model" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "prompt_version" text DEFAULT 'legacy.v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "routing_version" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "fallback_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "api_call_logs"
SET "resolved_model" = "model"
WHERE "resolved_model" = 'legacy';
