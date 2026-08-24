import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { mapSocialPosts, type SocialPostRow } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await pool.query<SocialPostRow>(
      `SELECT id, meeting_ids, platform, content_type, title, body, hashtags, image_prompt, created_at
         FROM social_posts WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    const [card] = await enrichWithConversation(mapSocialPosts(res.rows));
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Edição desabilitada nesta fase (dados read-only do n8n)' },
    { status: 405 }
  );
}
