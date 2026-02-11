CREATE TABLE "api_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid,
	"stage" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost" real NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"meta_description" text,
	"content_markdown" text,
	"content_html" text,
	"word_count" integer,
	"target_keyword" text,
	"secondary_keywords" jsonb DEFAULT '[]'::jsonb,
	"header_structure" jsonb,
	"internal_links" jsonb,
	"external_links" jsonb,
	"schema_markup" jsonb,
	"research_data" jsonb,
	"ai_model" text,
	"ai_prompt_version" text,
	"generation_passes" integer DEFAULT 0,
	"generation_cost" real,
	"humanization_score" real,
	"content_fingerprint" text,
	"monetization_elements" jsonb,
	"status" text DEFAULT 'draft',
	"published_at" timestamp,
	"is_seed_article" boolean DEFAULT false,
	"pageviews_30d" integer DEFAULT 0,
	"unique_visitors_30d" integer DEFAULT 0,
	"avg_time_on_page" integer,
	"bounce_rate" real,
	"revenue_30d" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"domain_id" uuid,
	"article_id" uuid,
	"keyword_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb,
	"status" text DEFAULT 'pending',
	"priority" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"error_message" text,
	"api_tokens_used" integer DEFAULT 0,
	"api_cost" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"scheduled_for" timestamp,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "domain_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"tld" text NOT NULL,
	"is_available" boolean,
	"registration_price" real,
	"aftermarket_price" real,
	"keyword_volume" integer,
	"keyword_cpc" real,
	"estimated_revenue_potential" real,
	"domain_score" real,
	"decision" text DEFAULT 'researching',
	"decision_reason" text,
	"domain_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"tld" text NOT NULL,
	"registrar" text DEFAULT 'godaddy',
	"purchase_date" timestamp,
	"purchase_price" real,
	"renewal_date" timestamp,
	"renewal_price" real,
	"status" text DEFAULT 'parked' NOT NULL,
	"bucket" text DEFAULT 'build' NOT NULL,
	"tier" integer DEFAULT 3,
	"niche" text,
	"sub_niche" text,
	"redirect_target_id" uuid,
	"github_repo" text,
	"cloudflare_project" text,
	"site_template" text DEFAULT 'authority',
	"vertical" text,
	"cloudflare_account" text,
	"theme_style" text,
	"monetization_model" text,
	"monetization_tier" integer DEFAULT 3,
	"estimated_revenue_at_maturity_low" real,
	"estimated_revenue_at_maturity_high" real,
	"estimated_flip_value_low" real,
	"estimated_flip_value_high" real,
	"estimated_monthly_revenue_low" real,
	"estimated_monthly_revenue_high" real,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_deployed" boolean DEFAULT false,
	"content_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"monthly_volume" integer,
	"cpc" real,
	"difficulty" integer,
	"serp_position" integer,
	"article_id" uuid,
	"intent" text DEFAULT 'informational',
	"status" text DEFAULT 'queued',
	"priority" integer DEFAULT 5,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monetization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"ad_network" text DEFAULT 'ezoic',
	"ad_network_id" text,
	"ad_placements" jsonb DEFAULT '[]'::jsonb,
	"affiliates" jsonb DEFAULT '[]'::jsonb,
	"cta_templates" jsonb DEFAULT '[]'::jsonb,
	"lead_gen_enabled" boolean DEFAULT false,
	"lead_gen_form_type" text,
	"lead_gen_endpoint" text,
	"lead_gen_value" real,
	"total_revenue" real DEFAULT 0,
	"revenue_last_30d" real DEFAULT 0,
	"revenue_per_article" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "monetization_profiles_domain_id_unique" UNIQUE("domain_id")
);
--> statement-breakpoint
CREATE TABLE "revenue_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"ad_revenue" real DEFAULT 0,
	"affiliate_revenue" real DEFAULT 0,
	"lead_gen_revenue" real DEFAULT 0,
	"total_revenue" real DEFAULT 0,
	"pageviews" integer DEFAULT 0,
	"unique_visitors" integer DEFAULT 0,
	"organic_visitors" integer DEFAULT 0,
	"avg_position" real,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"ctr" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"github_template_repo" text,
	"default_config" jsonb DEFAULT '{}'::jsonb,
	"layout_components" jsonb DEFAULT '[]'::jsonb,
	"color_schemes" jsonb DEFAULT '[]'::jsonb,
	"default_ad_placements" jsonb DEFAULT '[]'::jsonb,
	"default_cta_positions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "site_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_queue" ADD CONSTRAINT "content_queue_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_queue" ADD CONSTRAINT "content_queue_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_queue" ADD CONSTRAINT "content_queue_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research" ADD CONSTRAINT "domain_research_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_profiles" ADD CONSTRAINT "monetization_profiles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_snapshots" ADD CONSTRAINT "revenue_snapshots_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_domain_idx" ON "articles" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "article_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "article_created_idx" ON "articles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_status_idx" ON "domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_tier_idx" ON "domains" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "domain_bucket_idx" ON "domains" USING btree ("bucket");--> statement-breakpoint
CREATE INDEX "keyword_domain_idx" ON "keywords" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "keyword_status_idx" ON "keywords" USING btree ("status");--> statement-breakpoint
CREATE INDEX "keyword_priority_idx" ON "keywords" USING btree ("priority");