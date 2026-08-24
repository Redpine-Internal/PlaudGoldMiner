import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contents, contentSources, conversations } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');

    const result = await db
      .select()
      .from(contents)
      .orderBy(desc(contents.createdAt))
      .limit(limit);

    // Apply filters
    let filtered = result;
    if (status) {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (platform) {
      filtered = filtered.filter((c) => c.platform === platform);
    }

    return NextResponse.json({
      data: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error('Error fetching contents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contents' },
      { status: 500 }
    );
  }
}
