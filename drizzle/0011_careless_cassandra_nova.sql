ALTER TABLE "domain_research" ALTER COLUMN "current_bid" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "buy_now_price" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "comp_low" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "comp_high" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "recommended_max_bid" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "expected_12m_revenue_low" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "domain_research" ALTER COLUMN "expected_12m_revenue_high" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'review_tasks_auto_action_check'
          AND conrelid = 'review_tasks'::regclass
    ) THEN
        ALTER TABLE "review_tasks"
        ADD CONSTRAINT "review_tasks_auto_action_check"
        CHECK ("review_tasks"."auto_approve_after_hours" IS NULL OR "review_tasks"."auto_reject_after_hours" IS NULL);
    END IF;
END $$;
