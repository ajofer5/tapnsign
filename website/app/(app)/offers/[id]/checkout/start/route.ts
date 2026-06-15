import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL('/account', request.url), { status: 303 });
}
