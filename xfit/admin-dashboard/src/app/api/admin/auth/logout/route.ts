import { NextResponse } from 'next/server';
import { ADMIN_TOKEN_COOKIE, ADMIN_USER_COOKIE } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_TOKEN_COOKIE);
  res.cookies.delete(ADMIN_USER_COOKIE);
  return res;
}
