/**
 * Server-side helpers for proxying to the FastAPI backend.
 * Used exclusively by Next.js Route Handlers under /app/api/admin/*.
 */

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://tailorx-pose-api-production.up.railway.app';

export const ADMIN_TOKEN_COOKIE = 'tailorx_admin_token';
export const ADMIN_USER_COOKIE = 'tailorx_admin_user';

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
