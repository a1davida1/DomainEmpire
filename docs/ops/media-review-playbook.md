# Media Review Playbook

Updated: 2026-02-15
Owner: Review Operations

## Purpose

Standardize how reviewers and experts handle moderation queue decisions, escalations, and overrides.

## Reviewer Workflow

1. Open pending tasks sorted by due time and SLA breach risk.
2. Validate asset metadata and provenance.
3. Apply policy checks:
   - legal/safety risk
   - disclosure and monetization compliance
   - destination quality signals
4. Choose decision:
   - `approved`
   - `needs_changes`
   - `rejected`
5. Add review notes with explicit rationale.

## Decision Criteria

1. `approved`: no blocking policy violations.
2. `needs_changes`: fixable issues with clear corrective actions.
3. `rejected`: hard policy or safety violations.

## Escalation Triggers

Escalate to expert/admin when any condition is true:

1. Asset is high-impact or high-risk channel placement.
2. Destination quality block with uncertain false-positive risk.
3. Conflicting reviewer/expert interpretation of policy.
4. Repeat violation pattern from same campaign in last 7 days.

## Override Policy

1. Only `expert` or `admin` can force override blocked assignment decisions.
2. Override requires reason text (minimum 8 chars) with business and risk justification.
3. Override must create audit event and fairness/ops notification.

## SLA Guardrails

1. Reviewer acknowledges task within 2 hours.
2. Reviewer decision before `due_at`.
3. Escalation if task remains pending past `escalate_at`.

## Audit Requirements

For every task decision, preserve:

1. Actor identity and role
2. Decision status
3. Policy signals and warning codes
4. Notes and justification
5. Timestamped event chain
