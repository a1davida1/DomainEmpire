CREATE TABLE "page_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"route" text DEFAULT '/' NOT NULL,
	"title" text,
	"meta_description" text,
	"theme" text DEFAULT 'clean' NOT NULL,
	"skin" text DEFAULT 'slate' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "skin" text DEFAULT 'slate';--> statement-breakpoint
ALTER TABLE "page_definitions" ADD CONSTRAINT "page_definitions_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_def_domain_route_uidx" ON "page_definitions" USING btree ("domain_id","route");--> statement-breakpoint
CREATE INDEX "page_def_domain_idx" ON "page_definitions" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "page_def_published_idx" ON "page_definitions" USING btree ("is_published");