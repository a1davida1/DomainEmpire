CREATE UNIQUE INDEX IF NOT EXISTS "media_moderation_event_task_prev_hash_uidx" ON "media_moderation_events" USING btree ("task_id","prev_event_hash");
