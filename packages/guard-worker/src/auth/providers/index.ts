import type { AuthProvider } from '../types';
import { githubProvider } from './github';

const providers: Record<string, AuthProvider> = {
  [githubProvider.id]: githubProvider,
};

/**
 * Register an additional OAuth provider here (and enable it in KV config).
 * Example:
 *   export function registerProvider(p: AuthProvider) { providers[p.id] = p; }
 */
export function getProvider(id: string): AuthProvider | undefined {
  return providers[id];
}

export function listProviders(): AuthProvider[] {
  return Object.values(providers);
}
