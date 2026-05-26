import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, ADMIN_TOKEN_COOKIE, ADMIN_USER_COOKIE, cookieOptions } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const upstream = await fetch(`${BACKEND_URL}/v1/auth/admin/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await upstream.text();

  if (!upstream.ok) {
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  }

  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse('Invalid backend response', { status: 502 });
  }

  if (!payload?.token) {
    return NextResponse.json({ detail: 'Backend did not return a token' }, { status: 502 });
  }

  // Strip the token from the response payload — the client doesn't need it,
  // and the cookie is HttpOnly so JS cannot read it.
  const { token, ...userWithoutToken } = payload;

  // Cookie lifetime matches backend JWT expiry (24h)
  const oneDay = 60 * 60 * 24;
  const res = NextResponse.json(userWithoutToken, { status: 200 });
  res.cookies.set(ADMIN_TOKEN_COOKIE, token, cookieOptions(oneDay));
  res.cookies.set(ADMIN_USER_COOKIE, JSON.stringify(userWithoutToken), cookieOptions(oneDay));
  return res;
}
