import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { scanMarket, describeMarket } from '@/lib/ai/services/market-scan';

/**
 * Varredura de mercado de um tema.
 *
 * POST porque gasta: uma busca na web (~$0,007) mais um julgamento. Roda só
 * quando o operador pede, nunca ao abrir a página — a mesma regra do
 * agrupamento. O resultado fica no tema, com a data em que foi medido: uma
 * leitura de seis meses atrás não pode ser lida como se fosse de hoje.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const theme = await pool.query<{ name: string; rationale: string | null }>(
      `SELECT name, rationale FROM app_business_themes WHERE id = $1`,
      [id]
    );
    if (!theme.rowCount) {
      return NextResponse.json({ error: 'Tema não encontrado.' }, { status: 404 });
    }

    const res = await scanMarket(theme.rows[0]);
    if (!res.success) {
      const status =
        res.error.code === 'NOT_CONFIGURED' ? 503 : res.error.code === 'RATE_LIMIT' ? 429 : 502;
      return NextResponse.json({ error: res.error.message }, { status });
    }

    const { scan } = res;
    await pool.query(
      `UPDATE app_business_themes
          SET market_saturation = $2, market_confidence = $3, market_big_players = $4,
              market_content_only = $5, market_sources = $6::jsonb,
              market_scanned_at = now(), updated_at = now()
        WHERE id = $1`,
      [
        id,
        scan.saturation,
        scan.confidence,
        scan.bigPlayers,
        scan.contentOnly,
        JSON.stringify(scan.sources),
      ]
    );

    return NextResponse.json({
      data: { ...scan, summary: describeMarket(scan) },
      message: `Mercado analisado — ${describeMarket(scan)}`,
    });
  } catch (error) {
    console.error('[API] POST /api/opportunities/themes/[id]/market error:', error);
    return NextResponse.json({ error: 'Falha ao analisar o mercado' }, { status: 500 });
  }
}
