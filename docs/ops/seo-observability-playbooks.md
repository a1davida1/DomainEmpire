# SEO Observability Playbooks

This runbook defines operational response steps for SEO observability anomaly flags.

## SEO-001: Ranking Volatility Mitigation

Signal: `ranking_volatility`

### Immediate response (within 60 min)
1. Confirm volatility on impacted pages/queries for current vs prior window.
2. Check recent template/content/publish changes tied to impacted pages.
3. Freeze non-critical SEO experiments for those pages and re-evaluate after 48 hours.

### Escalation (after 180 min unresolved)
1. Escalate to SEO ops lead.
2. Apply last-known-good content/template profile for impacted cluster.
3. Log volatility incident with query/page sample evidence.

## SEO-002: Indexation Recovery

Signal: `indexation_low`

### Immediate response (within 90 min)
1. Validate robots, canonical, sitemap, and crawl accessibility.
2. Submit priority URLs in Search Console inspection queue.
3. Remove or merge thin/duplicate pages in impacted cluster.

### Escalation (after 240 min unresolved)
1. Escalate to SEO ops lead.
2. Trigger crawl budget review and sitemap regeneration.
3. Record remediation actions and expected re-crawl window.

## SEO-003: Conversion Drop Incident

Signal: `conversion_drop`

### Immediate response (within 30 min)
1. Validate conversion tracking integrity (events, tags, destination URLs).
2. Roll back the latest conversion-impacting experiment variants.
3. Route traffic to last winning variant while investigation runs.

### Escalation (after 120 min unresolved)
1. Escalate to growth ops lead.
2. Open incident timeline with affected pages/channels and change history.
3. Require sign-off before re-enabling paused variants.

## SEO-004: Runtime Failure Recovery

Signal: `runtime_failures`

### Immediate response (within 15 min)
1. Inspect deploy/runtime failure logs and identify failing release.
2. Roll back to healthy deployment and verify key render routes.
3. Re-run synthetic checks for impacted pages and confirm recovery.

### Escalation (after 60 min unresolved)
1. Escalate to engineering on-call.
2. Disable failing deploy lane until patch validation completes.
3. Publish operator update with mitigation and ETA.
