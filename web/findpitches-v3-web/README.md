# findpitches-v3-web: the FindPitches V3 customer website

This is the V3 frontend: the approved **Build 4** design, rebuilt as a self-contained V3 package.

Everything the site needs is inside this folder:
- pages, styles, images and **self-hosted fonts**;
- one API client (`public/assets/js/v3-api.js`);
- the routing and SEO logic, also as a server module (`server/seo-edge.mjs`);
- the API contract it expects V3 to serve (`contract/`).

It contains no code, data, configuration or references from V1, V2, the old `findpitches` repository, the old
`findpitches-web` Pages project or the V2 API layer. `npm run check` proves this on every run.

## What to copy into the V3 repository

Copy the **whole folder** `findpitches-v3-web/` into the V3 repository, for example as `web/`. At runtime only these are
used:

| Path | Role in V3 | Ships to users |
|---|---|---|
| `public/` | the site: 9 pages, `assets/css` (incl. `fonts.css`), `assets/fonts/*.woff2`, `assets/img/*.jpg`, `assets/js/**` | yes, as static files |
| `server/seo-edge.mjs` | import it in the V3 Worker or server for clean-URL routing, 301s and 404s, and server-rendered SEO tags and sitemaps | no (server code) |
| `contract/` | `V3_CUSTOMER_API.md` (what `/api/v3/*` must return), `examples/` (real responses), `reference/map-producer-record.mjs` (producer record → listing object, the same rules V3's API must apply) | no |
| `dev/` | stub API and fixtures built from the producer's V3 data, for local runs and tests only | **never** deploy |
| `scripts/`, `tests/` | build, independence check, unit tests, browser smoke test | no |

## Run it locally (no other system needed)

```bash
node dev/build-fixtures.mjs <producer current.jsonl> [YYYY-MM-DD]   # fixtures already included (9 Oct 2026 export)
node dev/stub-server.mjs --port 8790                              # site + stub /api/v3 on http://127.0.0.1:8790
npm run check                                                     # independence check + unit tests
python3 tests/smoke.py http://127.0.0.1:8790                      # 20 browser checks (Playwright + Chromium)
npm run build                                                     # dist/ + MANIFEST.sha256, and regenerates server/seo-edge.mjs
```

## How the pages load

Every page loads, in order:
1. `assets/js/config.js` (same-origin network guard; no mock mode);
2. `routes.js`;
3. `v3-api.js` (the only data adapter);
4. `api.js` (the `FP.api` facade);
5. `shell.js` (header, footer, cards, status, modals);
6. page helpers (`geo.js` for map outlines, `seo/*`);
7. `pages/<page>.js`.

There are no inline scripts, so the CSP can use `script-src 'self'`.

## What changed from Build 4 (and why)

| Change | Why |
|---|---|
| Removed the mock fixtures and mock API (902 listings from the PitchList/V2 snapshots), draft tools, simulated checkout and the SEO review page | pre-V3 data and draft-only tools |
| Removed the V2 live adapter, the reduced V2 Finder, Pages Functions, the website D1 and `wrangler.toml` | V2 runtime |
| Added `v3-api.js` and `contract/V3_CUSTOMER_API.md` | one V3 client against one V3 contract |
| The full Build 4 feature set is on: Finder with type chips, months, paging and totals; SEO landing pages; alerts; home board and stats | no reduced V2 mode |
| New evidence-based statuses: "Taking applications", "Apply any time", "Contact organiser", "Opens …" | the producer's OPEN_NOW, ROLLING, ENQUIRY_AVAILABLE and UPCOMING_NOT_OPEN states |
| Home example cards and sports cards are filled from live API listings | Build 4 hard-coded listings that pointed at mock ids |
| Google Fonts are self-hosted (SIL OFL) | no third-party runtime dependency |
| Homepage `robots` is `index,follow`. Landing and opportunity pages get their robots value from the server render. | production site |
