CREATE TABLE "backlink_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"total_backlinks" integer DEFAULT 0,
	"referring_domains" integer DEFAULT 0,
	"domain_authority" integer,
	"top_backlinks" jsonb DEFAULT '[]'::jsonb,
	"lost_backlinks" jsonb DEFAULT '[]'::jsonb,
	"snapshot_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"competitor_domain" text NOT NULL,
	"estimated_traffic" integer,
	"domain_authority" integer,
	"total_keywords" integer,
	"top_keywords" jsonb DEFAULT '[]'::jsonb,
	"total_pages" integer,
	"avg_content_length" integer,
	"publish_frequency" text,
	"notes" text,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"recurring" boolean DEFAULT false,
	"recurring_interval" text,
	"expense_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_url" text,
	"is_read" boolean DEFAULT false,
	"email_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "last_refreshed_at" timestamp;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "staleness_score" real;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshots_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research" ADD CONSTRAINT "domain_research_domain_unique" UNIQUE("domain");