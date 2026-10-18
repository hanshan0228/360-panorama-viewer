interface Env {
  ASSETS: Fetcher;
}

// /s/<share id> is a client-side route, so serve the SPA shell instead of the 404 page.
// Kept out of search indexes, matching the /s/* rule in public/_headers.
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const shell = await env.ASSETS.fetch(new URL('/index.html', request.url).toString());
  const headers = new Headers(shell.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(shell.body, { status: 200, headers });
};
