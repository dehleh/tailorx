import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, ADMIN_TOKEN_COOKIE } from '@/lib/backend';

export const dynamic = 'force-dynamic';

async function forward(req: NextRequest, params: { path: string[] }) {
  const path = params.path?.join('/') ?? '';
  const search = req.nextUrl.search ?? '';
  const target = `${BACKEND_URL}/${path}${search}`;

  const token = cookies().get(ADMIN_TOKEN_COOKIE)?.value;
  const headers: Record<string, string> = {};
  const incomingCT = req.headers.get('content-type');
  if (incomingCT) headers['Content-Type'] = incomingCT;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Read body for non-GET/HEAD/DELETE requests
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = await req.text();
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params);
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params);
}
