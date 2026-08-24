import { pool } from '@/lib/db';

// Preenche conversationTitle/conversationDate nos cards a partir da view
// `conversations` (que enxerga `meetings`). Faz UM SELECT com id = ANY($1).
// Cards com conversationId null ficam sem título (undefined). Mutação in-place
// evitada: retorna cópia enriquecida.
export async function enrichWithConversation<
  T extends { conversationId: string | null }
>(cards: T[]): Promise<(T & { conversationTitle: string | null; conversationDate: string | null })[]> {
  const ids = [...new Set(cards.map((c) => c.conversationId).filter((x): x is string => !!x))];
  if (ids.length === 0)
    return cards.map((c) => ({ ...c, conversationTitle: null, conversationDate: null }));

  const res = await pool.query<{ id: string; title: string; date: string }>(
    `SELECT id, title, date::text AS date FROM conversations WHERE id = ANY($1)`,
    [ids]
  );
  const byId = new Map(res.rows.map((r) => [r.id, r]));
  return cards.map((c) => {
    const conv = c.conversationId ? byId.get(c.conversationId) : undefined;
    return { ...c, conversationTitle: conv?.title ?? null, conversationDate: conv?.date ?? null };
  });
}
