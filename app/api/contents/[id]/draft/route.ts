import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { anthropic, DEFAULT_MODEL } from '@/lib/ai/client';
import { pool } from '@/lib/db';
import {
  articleDraftSchema,
  ARTICLE_DRAFT_SYSTEM_PROMPT,
  createArticleDraftPrompt,
} from '@/lib/ai/prompts/article-draft';

interface ContentRow {
  id: string;
  title: string;
  platform: string;
  theme: string;
  outline: string | null;
}

/**
 * Gera o rascunho completo (artigo, copy de LinkedIn ou roteiro de YouTube) a
 * partir da pauta + trechos-fonte de app_content_sources. Grava em
 * app_contents.draft, marca kind='artigo_completo' e status='rascunho'.
 * A publicação continua 100% humana.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contentRes = await pool.query<ContentRow>(
      `SELECT id, title, platform, theme, outline FROM app_contents WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (contentRes.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    const content = contentRes.rows[0];

    // Pauta: outline pode ser JSON {angle, points[]} ou texto puro (legado).
    let angle: string | null = null;
    let outlinePoints: string[] = [];
    if (content.outline) {
      try {
        const parsed = JSON.parse(content.outline);
        angle = typeof parsed.angle === 'string' ? parsed.angle : null;
        outlinePoints = Array.isArray(parsed.points) ? parsed.points : [];
      } catch {
        outlinePoints = [content.outline];
      }
    }

    const sourcesRes = await pool.query<{ excerpt: string | null; conversation_title: string | null }>(
      `SELECT s.excerpt, c.title AS conversation_title
         FROM app_content_sources s
         LEFT JOIN conversations c ON c.id = s.conversation_id
        WHERE s.content_id = $1`,
      [id]
    );

    const { object } = await generateObject({
      model: anthropic(DEFAULT_MODEL),
      schema: articleDraftSchema,
      system: ARTICLE_DRAFT_SYSTEM_PROMPT,
      prompt: createArticleDraftPrompt({
        platform: content.platform,
        theme: content.theme,
        title: content.title,
        angle,
        outlinePoints,
        sources: sourcesRes.rows.map((r) => ({
          conversationTitle: r.conversation_title,
          excerpt: r.excerpt,
        })),
      }),
    });

    // Rede de segurança da regra "sem travessões" no conteúdo externo.
    const body = object.body.replace(/—/g, ',');
    const title = object.title.replace(/—/g, ',');

    await pool.query(
      `UPDATE app_contents SET draft=$2, kind='artigo_completo', status='rascunho' WHERE id=$1`,
      [id, `# ${title}\n\n${body}`]
    );

    return NextResponse.json({ data: { id, title, draft: body, status: 'rascunho' } });
  } catch (error) {
    console.error('[API] POST /api/contents/[id]/draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}
