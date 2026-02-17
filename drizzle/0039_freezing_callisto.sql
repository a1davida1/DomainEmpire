ALTER TABLE "review_events" DROP CONSTRAINT "review_events_page_definition_id_page_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD COLUMN "prompt_body_redacted" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "email_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "user_agent_fingerprint" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "referrer_fingerprint" text;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_page_definition_id_page_definitions_id_fk" FOREIGN KEY ("page_definition_id") REFERENCES "public"."page_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_email_hash_idx" ON "subscribers" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "subscriber_ip_hash_idx" ON "subscribers" USING btree ("ip_hash");--> statement-breakpoint
ALTER TABLE "api_call_logs" DROP COLUMN "prompt_body";