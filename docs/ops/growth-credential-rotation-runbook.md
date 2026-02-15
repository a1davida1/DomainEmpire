# Growth Credential Rotation Runbook

## Purpose

Safely rotate Pinterest and YouTube growth credentials with zero surprise publishes and a clear rollback path.

## Required Environment

1. `GROWTH_CREDENTIALS_ENCRYPTION_KEY` (production required).
2. `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`.
3. `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
4. Optional:
   - `PINTEREST_OAUTH_TOKEN_URL`
   - `YOUTUBE_OAUTH_TOKEN_URL`
   - `GROWTH_CREDENTIAL_REFRESH_TIMEOUT_MS`
   - `GROWTH_CREDENTIAL_AUDIT_LOOKAHEAD_MS`
   - `GROWTH_PUBLISH_MOCK` (set `true` to suppress live publish side-effects)

## Pre-Flight

1. Confirm `growth_channels_v1` is enabled only for intended users.
2. Confirm worker is running and hourly scheduler loop is healthy.
3. Run dry-run reconnect audit:
   - `POST /api/growth/channel-credentials/reconnect` with `{ "dryRun": true }`
   - `POST /api/growth/channel-credentials/drill` with `{ "dryRun": true, "scope": "all" }` to capture baseline drill evidence.
4. Check monitoring for unresolved `Growth credential refresh failed` warnings.

## Rotation Steps

1. Freeze launch of new growth campaigns during rotation window.
2. Revoke old provider tokens in Pinterest/Google consoles.
3. Force reconnect requirement in app:
   - `POST /api/growth/channel-credentials/reconnect` with `{ "channel": "pinterest" }` (repeat for `youtube_shorts` or run all).
4. Reconnect channel credentials in app using the latest provider tokens.
5. Trigger manual refresh verification:
   - `POST /api/growth/channel-credentials` with `{ "channel": "pinterest", "force": true }`
   - `POST /api/growth/channel-credentials` with `{ "channel": "youtube_shorts", "force": true }`
6. Launch one test publish per channel in mock-off/staging-safe conditions.
7. Record checklist-backed drill evidence:
   - `POST /api/growth/channel-credentials/drill` with:
     - `dryRun: false`
     - `incidentChecklistId: "<incident-checklist-id>"`
     - full checklist booleans set to true
     - optional reconnect credential payloads
   - Save returned `run.id` plus `incidentChecklistAttachment.evidenceIds[]` into the incident checklist.

## Success Criteria

1. Credential refresh endpoint returns `success: true`.
2. No new `Growth credential refresh failed` notifications after reconnect.
3. Test publish succeeds with `credentialSource: "stored"` in promotion events.
4. Drill run status is `success` (or explicitly triaged `partial`) in `GET /api/growth/channel-credentials/drill`.
5. Drill run record includes `results.incidentChecklistAttachment` with matching incident checklist ID and evidence IDs.

## Rollback

1. If reconnect fails, set `GROWTH_PUBLISH_MOCK=true` to pause live publish side-effects.
2. Keep campaign creation enabled but do not launch new campaigns.
3. Re-issue provider credentials, reconnect, and re-run manual refresh checks.
4. Resume live publishing only after one successful test publish per channel.
