import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { conversationDuration } from '@/lib/presentation/conversation-duration';
import { getFile } from '@/lib/plaud/client';
import {
  conversationUpdateSchema,
  formatZodError,
} from '@/lib/validators/conversation';

/**
 * URL do áudio da gravação. O arquivo não fica no banco: o Plaud emite uma URL
 * assinada e temporária, buscada a cada leitura do detalhe.
 *
 * O id é guardado sem o prefixo `of_` (chave de idempotência da ingestão), mas a
 * API do Plaud só responde à forma prefixada — o id nu devolve 404. Por isso o
 * prefixo é reposto aqui na chamada.
 *
 * Falha do Plaud (offline, token expirado, gravação removida) não pode derrubar
 * a conversa: sem áudio, o detalhe continua servindo transcrição e resumo.
 */
async function plaudAudioUrl(
  source: string | null,
  sourceFileId: string | null,
): Promise<string | null> {
  if (source !== 'plaud' || !sourceFileId) return null;
  const remoteId = sourceFileId.startsWith('of_') ? sourceFileId : `of_${sourceFileId}`;
  try {
    const file = await getFile(remoteId);
    return file.presigned_url ?? null;
  } catch (error) {
    console.warn('[API] áudio do Plaud indisponível para', remoteId, error);
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_RE.test(value);

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/conversations/[id] - Get a specific conversation
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Aceita tanto o id interno quanto o id do Plaud. Links antigos e
    // marcadores apontam para o id do Plaud, e antes da normalização do
    // prefixo 'of_' havia gravações indexadas pelas duas formas.
    const result = await db
      .select()
      .from(conversations)
      .where(
        isUuid(id)
          ? eq(conversations.id, id)
          : sql`regexp_replace(${conversations.sourceFileId}, '^of_', '') = ${id.replace(/^of_/, '')}`,
      )
      .limit(1);

    if (result.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const conversation = result[0];
    const status =
      conversation.source === 'plaud' && !conversation.transcription?.trim()
        ? 'aguardando_transcricao'
        : conversation.status;
    return Response.json({
      data: {
        ...conversation,
        status,
        duration: conversationDuration(conversation.duration, conversation.source),
        audioUrl: await plaudAudioUrl(conversation.source, conversation.sourceFileId),
      },
    });
  } catch (error) {
    console.error('[API] GET /api/conversations/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/conversations/[id] - Update a conversation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = conversationUpdateSchema.parse(body);

    // Check if conversation exists
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (existing.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Prepare update data (only include non-undefined fields).
    // updated_at é setado pelo trigger INSTEAD OF da view (now()).
    const updateData: Record<string, unknown> = {};

    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.date !== undefined) updateData.date = validated.date;
    if (validated.duration !== undefined) updateData.duration = validated.duration;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.transcription !== undefined) updateData.transcription = validated.transcription;
    if (validated.summary !== undefined) updateData.summary = validated.summary;
    if (validated.topics !== undefined) updateData.topics = JSON.stringify(validated.topics);
    if (validated.participants !== undefined) updateData.participants = JSON.stringify(validated.participants);
    if (validated.tags !== undefined) updateData.tags = JSON.stringify(validated.tags);

    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write.
    await db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, id));

    const [updated] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(formatZodError(error), { status: 400 });
    }
    console.error('[API] PATCH /api/conversations/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/conversations/[id] - Delete a conversation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if conversation exists
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (existing.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await db
      .delete(conversations)
      .where(eq(conversations.id, id));

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('[API] DELETE /api/conversations/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
