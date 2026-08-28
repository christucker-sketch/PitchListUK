const FINDPITCHES_HOSTS = new Set(['findpitches.com', 'www.findpitches.com']);

function isSharedAsset(pathname) {
  return pathname === '/styles.css'
    || pathname === '/analytics.js'
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/us/');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  if (!FINDPITCHES_HOSTS.has(hostname)) return context.next();

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

  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex'
    }
  });
}
