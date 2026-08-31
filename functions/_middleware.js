import { isFindPitchesHost } from '../platform/routing.mjs';

const INTERNAL_US_PAGES = new Set(['/us', '/us/', '/us/find-pitches', '/us/find-pitches/']);
const UK_PREVIEW_PATHS = new Set(['/preview/uk', '/preview/uk/']);

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex'
    }
  });
}

function withNoIndex(response) {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isSharedAsset(pathname) {
  return pathname === '/styles.css'
    || pathname === '/analytics.js'
    || pathname.startsWith('/assets/')
    || pathname === '/shared/findpitches-shell.css'
    || pathname === '/uk/home.css'
    || pathname === '/us/find-pitches.js';
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (INTERNAL_US_PAGES.has(url.pathname)) return notFound();
  if (!isFindPitchesHost(url.hostname)) return context.next();

  if (url.pathname.startsWith('/api/') || isSharedAsset(url.pathname)) {
    return context.next();
  }

  if (UK_PREVIEW_PATHS.has(url.pathname)) {
    const assetUrl = new URL('/uk/', url);
    const response = await context.env.ASSETS.fetch(assetUrl);
    return withNoIndex(response);
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
