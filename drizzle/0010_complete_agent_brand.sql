ALTER TABLE "review_tasks" ADD COLUMN "sla_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "escalate_after_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "auto_approve_after_hours" integer;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "auto_reject_after_hours" integer;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "confidence_thresholds" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD COLUMN "backup_reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_backup_reviewer_id_users_id_fk" FOREIGN KEY ("backup_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_task_reviewer_idx" ON "review_tasks" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "review_task_backup_reviewer_idx" ON "review_tasks" USING btree ("backup_reviewer_id");