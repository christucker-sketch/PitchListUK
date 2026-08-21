# Reviewed opportunity publishing

Opportunity publishing is deliberately separate from discovery. `scripts/publish-reviewed-opportunities.js` runs only from the canonical clean `main` checkout and accepts a machine-readable manifest whose reviewer, approval flag and reviewed Git commit are explicit.

Dry-run is the default:

```sh
node scripts/publish-reviewed-opportunities.js /absolute/path/to/reviewed-manifest.json --dry-run
```

Production apply requires explicit approval plus existing secure Cloudflare configuration:

```sh
PITCHLIST_DEPLOY_ENV_FILE=/home/ct_admin/.openclaw/workspace/pitchlist-uk/.env \
PITCHLIST_PUBLISH_RECEIPT_DIR=/home/ct_admin/.openclaw/workspace/pitchlist-uk/data/publishing \
node scripts/publish-reviewed-opportunities.js /absolute/path/to/reviewed-manifest.json --apply
```

The publisher refuses detached, dirty, stale or non-main worktrees; requires `HEAD == origin/main == approval.reviewed_commit`; accepts only approved `customer_ready` additions/updates and reasoned removals; produces exact before/after and per-change dry-run output; generates the public site; permits only the opportunity snapshot and expected public index/sitemap/area-page diff; protects application, security, Stripe, SMTP2GO, analytics and entitlement files; verifies source/generated security headers, site checks, all regression tests, whitespace and asset parity; commits and pushes before invoking the tracked hardened deployment wrapper; confirms the deployed SHA and live headers; and writes a receipt containing counts, Git SHA, deployment ID and rollback deployment ID outside Git.

Any generation, validation, test, Git or Wrangler error terminates nonzero before later stages. Failures leave evidence in the checkout rather than silently discarding it. Automatic nightly production publishing remains paused.
