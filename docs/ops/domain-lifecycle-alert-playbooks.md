# Domain Lifecycle Alert Playbooks

This runbook defines required remediation actions for lifecycle monitor anomalies.

## LIFECYCLE-001: Manual Lifecycle Reversion

Signal: `manual_reversion` (warning)

### Immediate response (within 30 min)
1. Confirm the latest transition event on `GET /api/domains/[id]/lifecycle`.
2. Validate whether rollback was intentional (approved hold/sell/sunset decision) or accidental.
3. If accidental, apply the correct forward transition and record reason in event metadata.

### Escalation (after 90 min unresolved)
1. Escalate to domain operations lead.
2. Freeze non-essential automation on the domain until owner + target state are confirmed.
3. File an incident note with root-cause hypothesis and corrective action.

## LIFECYCLE-002: Lifecycle Oscillation Warning

Signal: `oscillation` (warning)

### Immediate response (within 30 min)
1. Confirm bounce pattern in lifecycle events (A -> B -> A) within the monitor window.
2. Inspect automation source metadata and identify conflicting triggers.
3. Disable the lower-confidence trigger path for the affected domain.

### Escalation (after 90 min unresolved)
1. Escalate to domain ops lead.
2. Apply a temporary hold state while automation policies are corrected.
3. Add a postmortem follow-up in weekly ops review.

## LIFECYCLE-003: Lifecycle Oscillation Critical

Signal: `oscillation` (critical)

### Immediate response (within 15 min)
1. Pause lifecycle automation for the impacted domain(s).
2. Verify no destructive actions were triggered (renewal/drop/sell flows).
3. Assign engineering on-call to identify and patch conflicting transition logic.

### Escalation (after 45 min unresolved)
1. Page engineering on-call + growth ops lead.
2. Apply temporary global guardrail on the offending automation source.
3. Capture incident timeline with triggering event IDs.

## LIFECYCLE-004: Lifecycle Automation SLO Breach (Warning)

Signal: `automation_slo_breach` (warning)

### Immediate response (within 60 min)
1. Review per-source rate and sample volume from lifecycle monitor sweep summary.
2. Validate source dependencies (queue health, integration credentials, rate limits).
3. Re-run sweep after dependency recovery to confirm improvement.

### Escalation (after 180 min unresolved)
1. Escalate to growth ops lead.
2. Backfill missed transitions where safe and auditable.
3. Document threshold tuning recommendation for next policy review.

## LIFECYCLE-005: Lifecycle Automation SLO Breach (Critical)

Signal: `automation_slo_breach` (critical)

### Immediate response (within 15 min)
1. Confirm breach severity and impacted source(s) from monitor summary.
2. Route to engineering on-call and prioritize source recovery.
3. Apply temporary manual routing for blocked transition classes.

### Escalation (after 60 min unresolved)
1. Trigger incident command with domain ops + engineering on-call.
2. Freeze new transitions for the failing source until recovery criteria pass.
3. Publish operator update with ETA and mitigation status.
