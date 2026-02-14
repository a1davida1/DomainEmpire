CREATE TABLE "click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"visitor_id" text,
	"full_url" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"referrer" text,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "source_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "source_click_id" uuid;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "original_utm" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "click_event_campaign_idx" ON "click_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "click_event_occurred_idx" ON "click_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "click_event_visitor_idx" ON "click_events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "click_event_utm_campaign_idx" ON "click_events" USING btree ("utm_campaign");--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_source_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("source_campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_source_click_id_click_events_id_fk" FOREIGN KEY ("source_click_id") REFERENCES "public"."click_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_source_campaign_idx" ON "subscribers" USING btree ("source_campaign_id");--> statement-breakpoint
CREATE INDEX "subscriber_source_click_idx" ON "subscribers" USING btree ("source_click_id");