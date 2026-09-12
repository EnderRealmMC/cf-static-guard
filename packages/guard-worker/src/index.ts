import type { Env } from './auth/types';
import { serveAssets } from './assets';
import {
  handleAuthRequest,
  healthResponse,
  isPublicPath,
  unauthorizedRedirect,
  verifyRequestSession,
} from './auth/routes';
import { handleAdminRequest } from './admin/routes';
import { loadUiConfig } from './ui-config';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/health/') {
      return healthResponse(env);
    }

    if (url.pathname === '/ui-config' || url.pathname === '/ui-config/') {
      const ui = await loadUiConfig(env);
      return Response.json(ui, {
        headers: { 'cache-control': 'no-store' },
      });
    }

    const authRes = await handleAuthRequest(request, env, url);
    if (authRes) return authRes;

    const adminRes = await handleAdminRequest(request, env, url);
    if (adminRes) return adminRes;

    if (isPublicPath(url.pathname, env)) {
      return serveAssets(request, env, url);
    }

    const session = await verifyRequestSession(request, env);
    if (!session) {
      return unauthorizedRedirect(request, url);
    }

    return serveAssets(request, env, url);
  },
} satisfies ExportedHandler<Env>;
