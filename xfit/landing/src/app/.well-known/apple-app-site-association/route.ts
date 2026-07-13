import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const appIdentifier = process.env.APPLE_APP_IDENTIFIER || 'TEAMID.com.tailorx.app';

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [appIdentifier],
            components: [
              {
                '/': '/invite/*',
                comment: 'Tailor-Xfit branded customer invite links',
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}
