import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { ContentCard } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Fonte local: app_contents (1 linha por conteúdo). A conversa de origem vive em
// app_content_sources (N por conteúdo); pegamos a 1ª via LEFT JOIN LATERAL para
// alimentar o conversationId que o enrichWithConversation precisa.
interface AppContentRow {
  id: string;
  title: string;
  platform: string;
  subtype: string | null;
  theme: string;
  outline: string;
  draft: string | null;
  mention_count: number;
  relevance_score: number;
  status: string;
  notes: string | null;
  conversation_id: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const search = searchParams.get('search');
    const filters: string[] = [];
    const values: string[] = [];

    if (status) {
      values.push(status);
      filters.push(`c.status = $${values.length}`);
    }
    if (platform) {
      values.push(platform);
      filters.push(`c.platform = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      filters.push(
        `(c.title ILIKE $${values.length} OR c.theme ILIKE $${values.length} OR c.outline ILIKE $${values.length} OR c.subtype ILIKE $${values.length})`
      );
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [res, count] = await Promise.all([
      pool.query<AppContentRow>(
      `SELECT c.id, c.title, c.theme, c.platform, c.subtype, c.outline, c.draft,
              c.mention_count, c.relevance_score, c.status, c.notes, c.created_at,
              src.conversation_id
         FROM app_contents c
         LEFT JOIN LATERAL (
           SELECT conversation_id FROM app_content_sources
            WHERE content_id = c.id LIMIT 1
         ) src ON true
        ${where}
        ORDER BY c.created_at DESC
        LIMIT $${values.length + 1}`,
      [...values, limit]
      ),
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM app_contents c ${where}`, values),
    ]);

    const cards = await enrichWithConversation(
      res.rows.map<ContentCard>((r) => ({
        id: r.id,
        title: r.title,
        platform: r.platform,
        subtype: r.subtype,
        theme: r.theme,
        outline: r.outline,
        draft: r.draft ?? null,
        mentionCount: r.mention_count,
        relevanceScore: r.relevance_score,
        status: r.status,
        notes: r.notes,
        conversationId: r.conversation_id,
        createdAt: r.created_at,
      }))
    );

    return NextResponse.json({ data: cards, total: Number(count.rows[0].total) });
  } catch (error) {
    console.error('Error fetching contents:', error);
    return NextResponse.json({ error: 'Failed to fetch contents' }, { status: 500 });
  }
}
