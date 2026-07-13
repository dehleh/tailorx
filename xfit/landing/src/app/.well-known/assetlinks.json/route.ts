import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: process.env.ANDROID_PACKAGE_NAME || 'com.tailorx.app',
        sha256_cert_fingerprints: fingerprints.length > 0
          ? fingerprints
          : ['REPLACE_WITH_RELEASE_SHA256_CERT_FINGERPRINT'],
      },
    },
  ]);
}
