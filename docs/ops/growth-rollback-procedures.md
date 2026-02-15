# Growth Rollback Procedures

Updated: 2026-02-15
Owner: Platform Reliability

## Rollback Scope

Use this procedure for incidents involving:

1. Publish pipeline failures
2. Policy-pack regressions
3. Invalid destination/link policy behavior
4. Credential integration failures
5. Metrics sync corruption

## Severity Levels

1. `SEV-1`: active harmful or non-compliant publishing, immediate freeze required.
2. `SEV-2`: sustained publish failures or inaccurate blocking, degraded growth throughput.
3. `SEV-3`: partial degradation without compliance impact.

## Immediate Containment

1. Pause affected campaigns (`promotion_campaigns.status = paused`).
2. Disable risky channel profiles at domain level if needed.
3. Stop non-essential queue jobs for impacted job types.
4. Notify operations channel with incident summary and blast radius.

## Rollback Paths

### A) Policy Regression Rollback

1. Revert policy pack/version env to last known good value.
2. Redeploy worker service.
3. Replay failed publish attempts for a controlled sample.
4. Validate block/warn ratio before resuming full traffic.

### B) Destination Quality Rule Rollback

1. Disable new blocking rule via env flag or allowlist override.
2. Keep high-confidence checks active (HTTPS, private network block).
3. Validate no unsafe destinations passed during rollback window.

### C) Credential/Integration Rollback

1. Revoke compromised credentials.
2. Reconnect from known-good provider tokens.
3. Run credential drill verification.
4. Resume sync jobs after successful verification.

## Verification Checklist

1. Publish success rate recovered above SLO threshold.
2. No critical policy violations in recent blocked/published events.
3. Sync lag within freshness SLO.
4. No pending SEV-1/SEV-2 alerts.

## Exit Criteria

1. 24h stable run with SLO budget burn below trigger.
2. Incident root-cause and fix documented.
3. Follow-up actions added to implementation backlog.
