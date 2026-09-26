import { createCustomerApiService } from './service.mjs';

export async function routeCustomerApi(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.pathname.startsWith('/v1/')) return null;

  const api = createCustomerApiService(env?.FINDPITCHES_DB);
  const path = url.pathname.replace(/\/+$/, '');

  try {
    if (path === '/v1/markets') return json(await api.markets());
    if (path === '/v1/regions') return json(await api.regions(url.searchParams.get('market')));
    if (path === '/v1/opportunities/search') {
      return json(await api.search(Object.fromEntries(url.searchParams.entries())));
    }

    const match = path.match(/^\/v1\/opportunities\/([^/]+)$/);
    if (match) {
      const result = await api.opportunity(decodeURIComponent(match[1]));
      return result ? json(result) : json({ ok:false, error:'opportunity_not_found' },404);
    }

    return null;
  } catch (error) {
    return json({ ok:false, error:String(error?.message || error) },400);
  }
}

function json(body,status=200){
  return Response.json(body,{status,headers:{
    'cache-control':'no-store',
    'x-robots-tag':'noindex, nofollow'
  }});
}
