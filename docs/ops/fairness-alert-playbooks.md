# Fairness Alert Playbooks

This runbook defines required response steps for moderation fairness signals.

## FAIRNESS-001: Reviewer Pending Cap Breach

Signal code: `reviewer_pending_cap`

### Immediate response (within 15 min)
1. Confirm the overloaded reviewer queue count from `/dashboard/growth` policy health panel.
2. Reassign the oldest pending tasks to the two lowest-load reviewers.
3. Add assignment note with reason `fairness-cap-mitigation`.

### Escalation (after 45 min unresolved)
1. Notify review ops lead.
2. Temporarily remove affected reviewer from auto-assignment rotation.
3. Open incident postmortem entry tagged `FAIRNESS-001`.

## FAIRNESS-002: Round-Robin Skew Violation

Signal code: `round_robin_skew`

### Immediate response (within 15 min)
1. Verify current skew in policy health panel and identify dominant reviewer.
2. Rebalance assignments to match least-loaded reviewer cohort.
3. Validate no stale escalation chain is forcing repeated assignment.

### Escalation (after 45 min unresolved)
1. Escalate to review ops lead.
2. Pause manual override usage for non-critical items.
3. File incident record tagged `FAIRNESS-002`.

## FAIRNESS-003: Reassignment Concentration Warning

Signal code: `reassignment_concentration`

### Immediate response (within 60 min)
1. Confirm concentration share and top reviewer in policy trends.
2. Audit last 20 assignment events for repeated routing causes.
3. Apply routing adjustments (backup reviewer / chain updates).

### Escalation (after 180 min unresolved)
1. Escalate to growth lead.
2. Review policy thresholds for false positives vs real imbalance.
3. Add follow-up action item in weekly ops review tagged `FAIRNESS-003`.

## FAIRNESS-004: Fairness Override Applied

Signal code: `override_applied`

### Immediate response (within 10 min)
1. Verify override reason and actor.
2. Confirm override scope is limited to urgent operational need.
3. Check for related fairness violations in same time window.

### Escalation (after 30 min unresolved)
1. Escalate to engineering on-call and review ops lead.
2. Require written justification in incident notes.
3. Run override pattern audit for last 7 days and attach to incident tagged `FAIRNESS-004`.
