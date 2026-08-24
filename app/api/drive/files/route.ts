import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { listDriveFiles } from '@/lib/drive/client';

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
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const pageToken = searchParams.get('pageToken') || undefined;
    const folderId = searchParams.get('folderId') || undefined;

    const result = await listDriveFiles(session.accessToken, {
      pageSize,
      pageToken,
      folderId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing Drive files:', error);
    return NextResponse.json(
      { error: 'Failed to list Drive files' },
      { status: 500 }
    );
  }
}
