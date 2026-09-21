import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';

/**
 * Decisão do operador sobre um tema.
 *
 * O tema é permanente (UPSERT por slug no reagrupamento), então o que se grava
 * aqui sobrevive às próximas rodadas de IA — é a diferença entre um cache e uma
 * entidade de trabalho. Antes, marcar prioridade não fazia sentido: o próximo
 * reagrupamento apagava o registro e criava outro com id novo.
 */

const patchSchema = z.object({
  status: z.enum(['ativo', 'priorizado', 'arquivado']).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Corpo inválido. Aceita "status" (ativo|priorizado|arquivado) e "notes".' },
      { status: 400 }
    );
  }

  const { status, notes } = parsed.data;
  if (status === undefined && notes === undefined) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
  }

  try {
    // COALESCE mantém o valor atual quando o campo não veio no corpo, para que
    // salvar uma nota não apague a prioridade e vice-versa.
    const res = await pool.query(
      `UPDATE app_business_themes
          SET status = COALESCE($2, status),
              notes  = CASE WHEN $4::boolean THEN $3 ELSE notes END,
              updated_at = now()
        WHERE id = $1
        RETURNING id, name, status, notes`,
      [id, status ?? null, notes ?? null, notes !== undefined]
    );

    if (!res.rowCount) {
      return NextResponse.json({ error: 'Tema não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ data: res.rows[0] });
  } catch (error) {
    console.error('[API] PATCH /api/opportunities/themes/[id] error:', error);
    return NextResponse.json({ error: 'Falha ao atualizar o tema' }, { status: 500 });
  }
}
