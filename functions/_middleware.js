import { isFindPitchesHost } from '../platform/routing.mjs';

const INTERNAL_US_PAGES = new Set(['/us', '/us/', '/us/find-pitches', '/us/find-pitches/']);

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex'
    }
  });
}

function isSharedAsset(pathname) {
  return pathname === '/styles.css'
    || pathname === '/analytics.js'
    || pathname.startsWith('/assets/')
    || pathname === '/us/find-pitches.js';
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (INTERNAL_US_PAGES.has(url.pathname)) return notFound();
  if (!isFindPitchesHost(url.hostname)) return context.next();

  if (url.pathname.startsWith('/api/') || isSharedAsset(url.pathname)) {
    return context.next();
  }

  if (url.pathname === '/') {
    const assetUrl = new URL('/us/', url);
    return context.env.ASSETS.fetch(assetUrl);
  }

  if (url.pathname === '/find-pitches' || url.pathname === '/find-pitches/') {
    const assetUrl = new URL('/us/find-pitches', url);
    return context.env.ASSETS.fetch(assetUrl);
  }

  return notFound();
}
