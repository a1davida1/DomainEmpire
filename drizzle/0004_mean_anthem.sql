CREATE TABLE "approval_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"content_type" text,
	"ymyl_level" text NOT NULL,
	"required_role" text DEFAULT 'reviewer' NOT NULL,
	"requires_qa_checklist" boolean DEFAULT true,
	"requires_expert_signoff" boolean DEFAULT false,
	"auto_publish" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"claim_text" text,
	"source_url" text NOT NULL,
	"source_title" text,
	"retrieved_at" timestamp NOT NULL,
	"quoted_snippet" text,
	"notes" text,
	"position" integer DEFAULT 0,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"snapshot_date" timestamp NOT NULL,
	"metrics" jsonb DEFAULT '{"ymylApprovalRate":0,"citationCoverageRatio":0,"avgTimeInReviewHours":0,"articlesWithExpertReview":0,"articlesWithQaPassed":0,"disclosureComplianceRate":0,"meaningfulEditRatio":0}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" text,
	"content_markdown" text,
	"meta_description" text,
	"content_hash" text,
	"word_count" integer,
	"change_type" text NOT NULL,
	"change_summary" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "article_revision_unq" UNIQUE("article_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "disclosure_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"affiliate_disclosure" text,
	"ad_disclosure" text,
	"not_advice_disclaimer" text,
	"how_we_money_page" text,
	"editorial_policy_page" text,
	"about_page" text,
	"show_reviewed_by" boolean DEFAULT true,
	"show_last_updated" boolean DEFAULT true,
	"show_change_log" boolean DEFAULT false,
	"show_methodology" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "disclosure_configs_domain_id_unique" UNIQUE("domain_id")
);
--> statement-breakpoint
CREATE TABLE "qa_checklist_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"template_id" uuid,
	"reviewer_id" uuid NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb,
	"all_passed" boolean DEFAULT false,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qa_checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"content_type" text,
	"ymyl_level" text,
	"items" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "qa_checklist_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"revision_id" uuid,
	"actor_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"event_type" text NOT NULL,
	"reason_code" text,
	"rationale" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"expertise" jsonb DEFAULT '[]'::jsonb,
	"credentials" text,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "ymyl_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "last_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "last_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_last_reviewed_by_fkey" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_snapshots" ADD CONSTRAINT "compliance_snapshots_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_configs" ADD CONSTRAINT "disclosure_configs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_checklist_results" ADD CONSTRAINT "qa_checklist_results_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_checklist_results" ADD CONSTRAINT "qa_checklist_results_template_id_qa_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."qa_checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_checklist_results" ADD CONSTRAINT "qa_checklist_results_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_policy_domain_idx" ON "approval_policies" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "approval_policy_ymyl_idx" ON "approval_policies" USING btree ("ymyl_level");--> statement-breakpoint
CREATE INDEX "citation_article_idx" ON "citations" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "compliance_snapshot_domain_idx" ON "compliance_snapshots" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "compliance_snapshot_date_idx" ON "compliance_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "revision_article_idx" ON "content_revisions" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "revision_created_idx" ON "content_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "qa_result_article_idx" ON "qa_checklist_results" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "qa_result_reviewer_idx" ON "qa_checklist_results" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "review_event_article_idx" ON "review_events" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "review_event_actor_idx" ON "review_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "review_event_type_idx" ON "review_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "review_event_created_idx" ON "review_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "expense_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "expense_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "notification_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notification_domain_idx" ON "notifications" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "notification_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_domain_id_competitor_domain_unique" UNIQUE("domain_id","competitor_domain");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "recurring_check" CHECK (NOT "expenses"."recurring" OR "expenses"."recurring_interval" IS NOT NULL);