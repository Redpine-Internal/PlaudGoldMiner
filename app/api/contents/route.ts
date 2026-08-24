import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { mapSocialPosts, type SocialPostRow } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');

    const res = await pool.query<SocialPostRow>(
      `SELECT id, meeting_ids, platform, content_type, title, body, hashtags, image_prompt, created_at
         FROM social_posts
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );

    const cards = await enrichWithConversation(mapSocialPosts(res.rows));

    let filtered = cards;
    if (status) filtered = filtered.filter((c) => c.status === status);
    if (platform) filtered = filtered.filter((c) => c.platform === platform);

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error('Error fetching contents:', error);
    return NextResponse.json({ error: 'Failed to fetch contents' }, { status: 500 });
  }
}
