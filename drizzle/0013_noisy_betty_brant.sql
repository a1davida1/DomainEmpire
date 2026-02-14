CREATE TABLE "research_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"query_text" text NOT NULL,
	"result_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_model" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"domain_priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "research_cache_query_hash_uidx" ON "research_cache" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "research_cache_fetched_idx" ON "research_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "research_cache_expires_idx" ON "research_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "research_cache_domain_priority_idx" ON "research_cache" USING btree ("domain_priority");