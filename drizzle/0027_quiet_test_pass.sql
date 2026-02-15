ALTER TABLE "qa_checklist_results"
ADD COLUMN IF NOT EXISTS "unit_test_pass_id" text;

ALTER TABLE "qa_checklist_results"
ADD COLUMN IF NOT EXISTS "calculation_config_hash" text;

ALTER TABLE "qa_checklist_results"
ADD COLUMN IF NOT EXISTS "calculation_harness_version" text;

CREATE INDEX IF NOT EXISTS "qa_result_unit_test_pass_idx"
ON "qa_checklist_results" ("unit_test_pass_id");
