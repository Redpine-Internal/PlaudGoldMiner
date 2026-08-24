import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { crossInsights } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    let query = db
      .select()
      .from(crossInsights)
      .orderBy(desc(crossInsights.createdAt))
      .limit(limit);

    const result = await query;

    // Apply filters
    let filtered = result;
    if (status) {
      filtered = filtered.filter((i) => i.status === status);
    }
    if (type) {
      filtered = filtered.filter((i) => i.insightType === type);
    }

    return NextResponse.json({
      data: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
