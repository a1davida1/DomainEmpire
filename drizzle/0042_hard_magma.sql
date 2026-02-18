CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"domain" text NOT NULL,
	"form_type" text DEFAULT 'lead' NOT NULL,
	"route" text DEFAULT '/' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"email" text,
	"ip" text,
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_sub_domain_idx" ON "form_submissions" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "form_sub_domain_id_idx" ON "form_submissions" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "form_sub_type_idx" ON "form_submissions" USING btree ("form_type");--> statement-breakpoint
CREATE INDEX "form_sub_email_idx" ON "form_submissions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "form_sub_created_idx" ON "form_submissions" USING btree ("created_at");