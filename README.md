# PitchList UK

Static public landing page for `pitchlist.uk`.

## Local build

```bash
npm run check
npm run build
```

Cloudflare Pages should publish the `public/` directory.

## Recommended Cloudflare Pages settings

- Framework preset: None / Static HTML
- Build command: `npm run build`
- Build output directory: `public`
- Production branch: `main`

## Boundaries

This repo is public-site only. Do not commit HAL back-office files, prospect CRM state, credentials, inbox exports, or private sample packs here.
