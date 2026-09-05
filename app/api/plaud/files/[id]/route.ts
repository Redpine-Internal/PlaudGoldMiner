import { NextResponse } from 'next/server';
import { getFileContent, PlaudApiError } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { getConversationAiAnalysisByPlaudFileId } from '@/lib/ai/conversation-analysis-store';

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin <= 0) return '';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

/**
 * On-demand detail for a single Plaud recording ("transcript/summary load on demand").
 * Shaped to match the OutputPanel's ConversationDetail. Transcript/summary are
 * pulled from the recording's segments; empty means Plaud hasn't processed it yet.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const [{ file, transcript, summary, topics }, persisted] = await Promise.all([
      getFileContent(id),
      getConversationAiAnalysisByPlaudFileId(id),
    ]);
    return NextResponse.json({
      data: {
        id: file.id,
        title: file.name ?? '',
        date: (file.start_at || file.created_at || '').slice(0, 10),
        duration: formatDuration(file.duration ?? 0) || null,
        type: 'reuniao' as const,
        status: 'processado' as const,
        summary: summary || null,
        transcription: transcript || null,
        // Panel expects topics as a JSON-encoded string array.
        topics: topics.length ? JSON.stringify(topics) : null,
        participants: null,
        tags: null,
        audioUrl: file.presigned_url ?? null,
        source: 'plaud',
        localConversationId: persisted?.localConversationId ?? null,
        aiAnalysis: persisted?.analysis ?? null,
      },
    });
  } catch (error) {
    if (error instanceof PlaudApiError && error.status === 404) {
      return NextResponse.json({ error: 'Gravação não encontrada no Plaud.' }, { status: 404 });
    }
    if (error instanceof PlaudAuthError) {
      console.error('Plaud auth error fetching file detail:', error);
      return NextResponse.json(
        { error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' },
        { status: 401 }
      );
    }
    console.error('Error fetching Plaud file detail:', error);
    return NextResponse.json({ error: 'Falha ao consultar o Plaud.' }, { status: 502 });
  }
}
