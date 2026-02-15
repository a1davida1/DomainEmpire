ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "purge_after_at" timestamp;--> statement-breakpoint
DROP INDEX IF EXISTS "media_asset_url_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_asset_url_uidx" ON "media_assets" USING btree ("url") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_asset_deleted_at_idx" ON "media_assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_asset_purge_after_idx" ON "media_assets" USING btree ("purge_after_at");
