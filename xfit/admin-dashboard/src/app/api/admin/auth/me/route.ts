import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_USER_COOKIE } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  const raw = cookies().get(ADMIN_USER_COOKIE)?.value;
  if (!raw) return NextResponse.json({ user: null }, { status: 200 });
  try {
    const user = JSON.parse(raw);
    return NextResponse.json({ user }, { status: 200 });
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
