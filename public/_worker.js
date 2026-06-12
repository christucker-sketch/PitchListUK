export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.protocol !== 'https:' || url.hostname !== 'pitchlist.uk') {
      url.protocol = 'https:';
      url.hostname = 'pitchlist.uk';
      url.port = '';
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
