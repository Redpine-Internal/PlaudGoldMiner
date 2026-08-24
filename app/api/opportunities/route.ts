import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { mapBusinessOpportunities, type BusinessOpportunityRow } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const res = await pool.query<BusinessOpportunityRow>(
      `SELECT id, meeting_ids, opportunities, created_at
         FROM business_opportunities
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );

    const cards = await enrichWithConversation(mapBusinessOpportunities(res.rows));

    let filtered = cards;
    if (status) filtered = filtered.filter((o) => o.status === status);
    if (type) filtered = filtered.filter((o) => o.type === type);

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
