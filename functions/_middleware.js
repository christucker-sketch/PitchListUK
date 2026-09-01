import { isFindPitchesHost } from '../platform/routing.mjs';

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

  if (url.pathname.startsWith('/api/') || isSharedAsset(url.pathname)) {
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
