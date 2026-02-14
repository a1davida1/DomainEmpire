ALTER TABLE "media_assets" ADD COLUMN "folder" text DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "media_asset_folder_idx" ON "media_assets" USING btree ("folder");