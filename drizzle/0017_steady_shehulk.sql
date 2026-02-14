CREATE TABLE "growth_channel_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_account_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_validated_at" timestamp,
	"last_refresh_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "growth_channel_credentials" ADD CONSTRAINT "growth_channel_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "growth_credential_user_channel_uidx" ON "growth_channel_credentials" USING btree ("user_id","channel");
--> statement-breakpoint
CREATE INDEX "growth_credential_user_idx" ON "growth_channel_credentials" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "growth_credential_channel_idx" ON "growth_channel_credentials" USING btree ("channel");
--> statement-breakpoint
CREATE INDEX "growth_credential_access_expires_idx" ON "growth_channel_credentials" USING btree ("access_token_expires_at");
--> statement-breakpoint
CREATE INDEX "growth_credential_revoked_idx" ON "growth_channel_credentials" USING btree ("revoked_at");

