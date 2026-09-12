import type { SessionPayload } from './auth/types';

function b64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeString(value: string): string {
  return b64urlEncode(new TextEncoder().encode(value));
}

function b64urlDecodeString(value: string): string {
  return new TextDecoder().decode(b64urlDecode(value));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const header = b64urlEncodeString(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  );
  const body = b64urlEncodeString(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64urlEncode(sig)}`;
}

export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const key = await importKey(secret);
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(data),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const payload = JSON.parse(b64urlDecodeString(body)) as SessionPayload;
    if (!payload?.sub || !payload?.provider || !payload?.exp) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildSessionPayload(
  input: {
    sub: string;
    provider: string;
    login: string;
    name?: string;
    avatarUrl?: string;
  },
  ttlSeconds: number,
): SessionPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: input.sub,
    provider: input.provider,
    login: input.login,
    name: input.name,
    avatarUrl: input.avatarUrl,
    iat: now,
    exp: now + ttlSeconds,
  };
}

export function sessionCookie(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    `csg_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [
    'csg_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'csg_session') {
      const v = rest.join('=').trim();
      return v || null;
    }
  }
  return null;
}
