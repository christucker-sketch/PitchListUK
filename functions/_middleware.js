import { isFindPitchesHost } from '../platform/routing.mjs';

const UK_PREVIEW_PATHS = new Set(['/preview/uk', '/preview/uk/']);
const CA_PUBLIC_PATHS = new Set([
  '/ca/find-pitches',
  '/ca/find-pitches/',
  '/ca/find-pitches.css',
  '/ca/find-pitches.js'
]);

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex'
    }
  });
}

export function isCanadaCustomerSurfacePublic(env = {}) {
  return String(env.CA_CUSTOMER_SEARCH_PUBLIC_ENABLED || '').trim().toLowerCase() === 'true';
}

function isSharedAsset(pathname) {
  return pathname === '/styles.css'
    || pathname === '/analytics.js'
    || pathname.startsWith('/assets/')
    || pathname === '/shared/findpitches-shell.css'
    || pathname === '/global/home.css'
    || pathname === '/uk/home.css'
    || pathname === '/us/home.css'
    || pathname === '/us/find-pitches.css'
    || pathname === '/us/find-pitches.js';
}

function redirect(pathname, requestUrl, status = 308) {
  const target = new URL(pathname, requestUrl);
  target.search = new URL(requestUrl).search;
  return Response.redirect(target, status);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (!isFindPitchesHost(url.hostname)) return context.next();

  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  if (url.pathname === '/ca' || url.pathname.startsWith('/ca/')) {
    if (!isCanadaCustomerSurfacePublic(context.env)) return notFound();
    if (url.pathname === '/ca' || url.pathname === '/ca/') return redirect('/ca/find-pitches', url);
    if (CA_PUBLIC_PATHS.has(url.pathname)) {
      const assetPath = url.pathname === '/ca/find-pitches/' ? '/ca/find-pitches' : url.pathname;
      return context.env.ASSETS.fetch(new URL(assetPath, url));
    }
    return notFound();
  }

  if (isSharedAsset(url.pathname)) {
    return context.next();
  }

  if (UK_PREVIEW_PATHS.has(url.pathname)) {
    return redirect('/uk/', url);
  }

  if (url.pathname === '/') {
    const assetUrl = new URL('/global/', url);
    return context.env.ASSETS.fetch(assetUrl);
  }

  if (url.pathname === '/find-pitches' || url.pathname === '/find-pitches/') {
    return redirect('/us/find-pitches', url);
  }

  if (url.pathname === '/us') return redirect('/us/', url);
  if (url.pathname === '/uk') return redirect('/uk/', url);

  if (url.pathname === '/us/' || url.pathname === '/us/find-pitches' || url.pathname === '/us/find-pitches/') {
    return context.env.ASSETS.fetch(new URL(url.pathname, url));
  }

  if (url.pathname === '/uk/') {
    return context.env.ASSETS.fetch(new URL('/uk/', url));
  }

  if (url.pathname === '/uk/find-pitches' || url.pathname === '/uk/find-pitches/') {
    return redirect('https://pitchlist.uk/find-pitches', url, 302);
  }

  return notFound();
}
