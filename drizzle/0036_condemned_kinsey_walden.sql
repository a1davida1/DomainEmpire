CREATE TABLE "block_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"block_type" text NOT NULL,
	"variant" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source_domain_id" uuid,
	"source_block_id" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "page_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"variant_key" text DEFAULT 'control' NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "page_definitions" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "page_definitions" ADD COLUMN "review_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "page_definitions" ADD COLUMN "last_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "page_definitions" ADD COLUMN "last_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_source_domain_id_domains_id_fk" FOREIGN KEY ("source_domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_variants" ADD CONSTRAINT "page_variants_page_id_page_definitions_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "block_tpl_type_idx" ON "block_templates" USING btree ("block_type");--> statement-breakpoint
CREATE INDEX "block_tpl_global_idx" ON "block_templates" USING btree ("is_global");--> statement-breakpoint
CREATE UNIQUE INDEX "page_variant_page_key_uidx" ON "page_variants" USING btree ("page_id","variant_key");--> statement-breakpoint
CREATE INDEX "page_variant_page_idx" ON "page_variants" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "page_variant_active_idx" ON "page_variants" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "page_definitions" ADD CONSTRAINT "page_definitions_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_def_status_idx" ON "page_definitions" USING btree ("status");