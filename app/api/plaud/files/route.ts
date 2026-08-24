import { NextResponse } from 'next/server';
import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';

/** Turn a Plaud duration (ms) into a compact "1h 12min" / "8min" display string. */
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
 * Live proxy for the Plaud recordings list ("Só a lista primeiro").
 * Fetches title/date/duration for the recordings on each load — no DB sync.
 * Transcript/summary load on demand via /api/plaud/files/[id].
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = Number(searchParams.get('page_size') ?? '20') || 20;

  try {
    const { data, page: p, page_size } = await listFiles(page, pageSize);
    // Normalize to what the Conversas UI expects; duration is ms from Plaud.
    const conversations = data.map((f) => ({
      id: f.id,
      title: f.name,
      date: (f.start_at || f.created_at || '').slice(0, 10),
      duration: formatDuration(f.duration ?? 0) || null,
      type: 'reuniao' as const,
      status: 'processado' as const,
      summary: null,
      topics: null,
      participants: null,
      source: 'plaud' as const,
    }));
    return NextResponse.json({ data: conversations, page: p, page_size });
  } catch (error) {
    if (error instanceof PlaudAuthError) {
      console.error('Plaud auth error listing files:', error);
      return NextResponse.json(
        { error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' },
        { status: 401 }
      );
    }
    console.error('Error listing Plaud files:', error);
    return NextResponse.json({ error: 'Falha ao consultar o Plaud.' }, { status: 502 });
  }
}
