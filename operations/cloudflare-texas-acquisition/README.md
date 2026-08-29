# Cloudflare Texas acquisition

This Worker moves approved Texas source fetching and staging off Hal and the office network.

## Safety boundary

The Workflow may:
- fetch the reviewed Texas source registry from Cloudflare's network;
- run the existing staging, extraction, classification and dedupe logic;
- build the existing controlled promotion manifest;
- compare against the current GitHub `main` US snapshot;
- create or reuse a deterministic data branch;
- update only `functions/_data/us-opportunities.mjs` on that branch;
- open a pull request.

It does **not** merge pull requests or deploy production. GitHub CI remains the publication gate.

## Controlled rollout schedule

Automatic acquisition scheduling is deliberately disabled during the 50-state production-data rollout. The Worker configuration declares no cron trigger, and the scheduled handler is a fail-closed no-op that queues zero Workflow instances. Run exactly one state at a time with the manual Workflow trigger and wait for its data PR to be reviewed and merged, or for a confirmed zero-addition result, before starting the next state.

```bash
npx wrangler@4.127.0 workflows trigger pitchlist-texas-acquisition \
  --config operations/cloudflare-texas-acquisition/wrangler.jsonc \
  --params '{"state_code":"CA","trigger":"manual"}'
```

Direct single-state Workflow triggers and the authenticated manual `/run?state=XX` endpoint remain available. Restore an automatic schedule only after the controlled rollout has completed and a separate sequential scheduler has been designed and tested.

## Required Cloudflare secrets

Set these against the `pitchlist-texas-acquisition` Worker before the first run:

```bash
npx wrangler secret put GITHUB_TOKEN --config operations/cloudflare-texas-acquisition/wrangler.jsonc
npx wrangler secret put ADMIN_TOKEN --config operations/cloudflare-texas-acquisition/wrangler.jsonc
```

`GITHUB_TOKEN` should be a fine-grained GitHub token scoped only to `christucker-sketch/PitchListUK` with repository Contents read/write and Pull requests read/write permissions. It does not need permission to merge.

`ADMIN_TOKEN` protects the optional manual `POST /run` endpoint. Use a long random value.

## Deploy

```bash
npx wrangler deploy --config operations/cloudflare-texas-acquisition/wrangler.jsonc
```

The public `GET /health` endpoint reports only service health and reviewed source count. The manual run endpoint requires `Authorization: Bearer <ADMIN_TOKEN>`.

## Rollout

1. Deploy the Worker and secrets without an acquisition cron.
2. Trigger exactly one manual state run.
3. Confirm the resulting PR changes only the US snapshot and passes GitHub CI.
4. Merge the exact reviewed PR head; do not deploy the customer-facing site as part of this Worker rollout.
5. Refresh local `main`, then trigger the next unfinished state only after the previous state is fully resolved.
