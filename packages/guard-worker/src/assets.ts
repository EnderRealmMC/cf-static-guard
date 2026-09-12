import type { Env } from './auth/types';

/** Serve protected static assets after auth has already passed. */
export async function serveAssets(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const spa =
    (env.SPA_FALLBACK ?? 'false').toLowerCase() === 'true' ||
    env.SPA_FALLBACK === '1';

  const assetRes = await env.ASSETS.fetch(request);
  if (assetRes.status !== 404) {
    return withGuardHeaders(assetRes);
  }

  if (spa && request.method === 'GET' && !url.pathname.includes('.')) {
    const indexReq = new Request(new URL('/index.html', url.origin), {
      method: 'GET',
      headers: request.headers,
    });
    const indexRes = await env.ASSETS.fetch(indexReq);
    if (indexRes.ok) {
      return withGuardHeaders(
        new Response(indexRes.body, {
          status: 200,
          headers: indexRes.headers,
        }),
      );
    }
  }

  return withGuardHeaders(
    new Response('Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    }),
  );
}

function withGuardHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
