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

## Schedule

The Workflow is scheduled for `04:17 UTC` daily using a Workflow `schedules` entry.

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

1. Deploy the Worker and secrets.
2. Trigger one manual cloud run.
3. Confirm the resulting PR changes only the US snapshot and passes GitHub CI.
4. Merge/deploy normally.
5. After the cloud run is proven, stop using Hal for routine Texas acquisition.
