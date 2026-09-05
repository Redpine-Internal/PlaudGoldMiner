import { NextResponse } from 'next/server';
import { getFileContent } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { db } from '@/lib/db';
import { conversations, opportunities } from '@/lib/db/schema';
import { eq, or, sql } from 'drizzle-orm';

/**
 * Lightweight content-status for a single Plaud recording, used by the Conversas
 * list to power the "tem resumo / transcrição / insights" filters (enriquecido
 * sob demanda no cliente).
 *
 *   hasSummary       — Plaud produced an auto-summary
 *   hasTranscription — Plaud produced a transcript
 *   hasInsights      — this recording was already analyzed here: a local
 *                      conversation exists (sourceFileId = this id) with >=1
 *                      opportunity. Cheap DB lookup, no extra Plaud calls.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    // Insights come from our own DB (analyzed recordings), keyed by sourceFileId.
    const [local] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.sourceFileId, id))
      .limit(1);

    let hasInsights = false;
    if (local) {
      const [opp] = await db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(or(
          eq(opportunities.conversationId, local.id),
          sql`EXISTS (SELECT 1 FROM app_opportunity_sources s WHERE s.opportunity_id::text = ${opportunities.id}::text AND s.conversation_id::text = ${local.id}::text)`,
        ))
        .limit(1);
      hasInsights = Boolean(opp);
    }

    // Summary/transcription come from Plaud (on-demand segments).
    const { transcript, summary } = await getFileContent(id);

    return NextResponse.json({
      data: {
        id,
        hasSummary: Boolean(summary && summary.trim()),
        hasTranscription: Boolean(transcript && transcript.trim()),
        hasInsights,
        analyzed: Boolean(local),
      },
    });
  } catch (error) {
    if (error instanceof PlaudAuthError) {
      console.error('Plaud auth error fetching file status:', error);
      return NextResponse.json(
        { error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' },
        { status: 401 }
      );
    }
    console.error('Error fetching Plaud file status:', error);
    return NextResponse.json({ error: 'Falha ao consultar o Plaud.' }, { status: 502 });
  }
}
