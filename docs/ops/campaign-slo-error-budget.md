# Campaign SLO and Error Budget Policy

Updated: 2026-02-15
Owner: Growth Operations

## Scope

Applies to automated and manual growth campaign execution across:

1. Pinterest
2. YouTube Shorts

## Service Level Objectives

SLO windows are measured over rolling 7-day and 30-day periods.

| SLO | Target | Measurement Source |
|---|---|---|
| Publish success rate | >= 97.0% | `promotion_events` (`published` / (`published` + `publish_blocked` + `publish_failed`)) |
| Policy-block false-positive rate | <= 2.0% | Manual review sample of blocked publishes |
| Metrics sync freshness | <= 6 hours lag (p95) | `integration_sync_runs.completed_at` vs report query time |
| Credential validity | >= 99.0% connected checks | Growth credential audit run results |
| Moderation SLA adherence | >= 95.0% on-time decisions | `media_moderation_tasks.due_at` and decision timestamps |

## Error Budgets

| SLO | Budget | Burn Trigger |
|---|---|---|
| Publish success | 3.0% failure budget | > 1.5% in 24h or > 3.0% in 7d |
| Policy false-positive | 2.0% budget | > 1.0% in 24h or > 2.0% in 7d |
| Metrics freshness | 6h p95 lag budget | > 3h p95 in 24h or > 6h p95 in 7d |
| Credential validity | 1.0% budget | > 0.5% in 24h or > 1.0% in 7d |
| Moderation SLA | 5.0% lateness budget | > 2.5% in 24h or > 5.0% in 7d |

## Burn-Based Actions

1. `Burn < 50%`: continue normal operations.
2. `Burn 50-100%`: freeze experimental rollouts, keep bugfixes only.
3. `Burn > 100%`: freeze non-critical campaign launches and initiate rollback procedure.

## Escalation Matrix

1. On-call growth engineer owns first response.
2. If unresolved after 30 minutes, escalate to platform lead.
3. If unresolved after 2 hours, escalate to operations owner and enable launch freeze.

## Reporting Cadence

1. Daily dashboard check: on-call growth engineer.
2. Weekly SLO review: growth + platform.
3. Monthly policy recalibration review: growth + compliance.
