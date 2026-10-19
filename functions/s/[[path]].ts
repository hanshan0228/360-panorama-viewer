import { buildSharePageHtml } from '../../server/sharePage.mjs';

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
}

// /s/<share id> is a client-side route, so serve the SPA shell instead of the 404 page.
// Shares are private and noindex by default; only shares whose owner opted into the public
// showcase get a crawlable page with their own title, canonical and image.
export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const shell = await env.ASSETS.fetch(new URL('/index.html', request.url).toString());
  const shellText = await shell.text();
  const headers = new Headers(shell.headers);
  // The shell is served as re-buffered text, so stale body headers must go.
  for (const name of ['Content-Length', 'Content-Encoding', 'ETag']) headers.delete(name);
  const id = (Array.isArray(params.path) ? params.path.join('/') : params.path || '').replace(/\/+$/, '');
  if (env.DB && /^[a-f0-9]{32}$/.test(id)) {
    try {
      const row = await env.DB.prepare('SELECT title, width, height, created_at, listed FROM panorama_shares WHERE id = ? AND ready = 1 AND revoked_at IS NULL').bind(id).first();
      if (row?.listed) {
        const html = buildSharePageHtml(shellText, { ...row, id }, new URL(request.url).origin);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cache-Control', 'no-store');
        headers.set('X-Robots-Tag', 'index, follow');
        return new Response(html, { status: 200, headers });
      }
    } catch { /* Fall through to the private, noindex shell. */ }
  }
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(shellText, { status: 200, headers });
};
