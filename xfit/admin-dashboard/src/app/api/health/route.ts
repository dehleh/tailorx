export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'tailorx-admin',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}
