import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { ContentCard } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Fonte local: app_contents. A conversa de origem vem da 1ª app_content_sources.
interface AppContentRow {
  id: string;
  title: string;
  platform: string;
  theme: string;
  outline: string;
  mention_count: number;
  relevance_score: number;
  status: string;
  notes: string | null;
  conversation_id: string | null;
  created_at: string;
}

function toCard(r: AppContentRow): ContentCard {
  return {
    id: r.id,
    title: r.title,
    platform: r.platform,
    theme: r.theme,
    outline: r.outline,
    mentionCount: r.mention_count,
    relevanceScore: r.relevance_score,
    status: r.status,
    notes: r.notes,
    conversationId: r.conversation_id,
    createdAt: r.created_at,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await pool.query<AppContentRow>(
      `SELECT c.id, c.title, c.theme, c.platform, c.outline,
              c.mention_count, c.relevance_score, c.status, c.notes, c.created_at,
              src.conversation_id
         FROM app_contents c
         LEFT JOIN LATERAL (
           SELECT conversation_id FROM app_content_sources
            WHERE content_id = c.id LIMIT 1
         ) src ON true
        WHERE c.id = $1 LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    const [card] = await enrichWithConversation(
      res.rows.map(toCard)
    );
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

const ALLOWED_STATUS = new Set([
  'sugerido', 'rascunho', 'em_revisao', 'aprovado', 'publicado', 'descartado',
  // legado (linhas antigas / compat UI)
  'producao',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (typeof body?.status === 'string') {
      if (!ALLOWED_STATUS.has(body.status)) {
        return NextResponse.json(
          { error: `status inválido; use um de: ${[...ALLOWED_STATUS].join(', ')}` },
          { status: 400 }
        );
      }
      values.push(body.status);
      sets.push(`status = $${values.length}`);
    }
    if (typeof body?.notes === 'string' || body?.notes === null) {
      values.push(body.notes);
      sets.push(`notes = $${values.length}`);
    }
    if (typeof body?.draft === 'string') {
      values.push(body.draft);
      sets.push(`draft = $${values.length}`);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    const res = await pool.query<AppContentRow>(
      `UPDATE app_contents SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, title, platform, theme, outline, mention_count,
                 relevance_score, status, notes, created_at,
                 (SELECT conversation_id FROM app_content_sources
                   WHERE content_id = app_contents.id LIMIT 1) AS conversation_id`,
      values
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    const [card] = await enrichWithConversation([toCard(res.rows[0])]);
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error updating content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}
