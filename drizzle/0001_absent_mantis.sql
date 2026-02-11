ALTER TABLE "api_call_logs" ADD COLUMN "domain_id" uuid;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_deployed_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_vertical_idx" ON "domains" USING btree ("vertical");