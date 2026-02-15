ALTER TABLE "api_call_logs"
ADD COLUMN IF NOT EXISTS "prompt_hash" text;

ALTER TABLE "api_call_logs"
ADD COLUMN IF NOT EXISTS "prompt_body" text;

CREATE INDEX IF NOT EXISTS "api_call_prompt_hash_idx"
ON "api_call_logs" ("prompt_hash");
