import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { listDriveFolders } from '@/lib/drive/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated with Google' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const pageToken = searchParams.get('pageToken') || undefined;
    const parentId = searchParams.get('parentId') || undefined;

    const result = await listDriveFolders(session.accessToken, {
      pageSize,
      pageToken,
      parentId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing Drive folders:', error);
    return NextResponse.json(
      { error: 'Failed to list Drive folders' },
      { status: 500 }
    );
  }
}
