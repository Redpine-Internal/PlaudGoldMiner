// Uso: npx tsx scripts/reclassify-opportunities.mts [--dry-run]
// Reclassifica oportunidades legadas (produto/servico) na taxonomia nova via IA.
import 'dotenv/config';
import { generateObject } from 'ai';
import { z } from 'zod';
import { anthropic, DEFAULT_MODEL } from '../lib/ai/client';
import { pool } from '../lib/db';

const dryRun = process.argv.includes('--dry-run');

const reclassSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    type: z.enum(['treinamento', 'consultoria', 'sistema']).catch('consultoria'),
    subtype: z.string().describe('Subtipo específico, ex. "Treinamento NR-35"; string vazia se não souber'),
  })),
});

async function main() {
  const { rows } = await pool.query<{ id: string; title: string; pain: string; type: string }>(
    `SELECT id, title, pain, type FROM app_opportunities WHERE type IN ('produto','servico') ORDER BY created_at`
  );
  if (rows.length === 0) {
    console.log('Nenhuma oportunidade legada (produto/servico) para reclassificar.');
    return;
  }
  console.log(`Reclassificando ${rows.length} oportunidades legadas${dryRun ? ' (dry-run)' : ''}...`);

  // Lotes de 20 para não estourar o contexto.
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const { object } = await generateObject({
      model: anthropic(DEFAULT_MODEL),
      schema: reclassSchema,
      system: 'Você classifica oportunidades de negócio de uma consultoria de SST (EHS Brasil). Taxonomia: treinamento (cursos/capacitações), consultoria (projetos/diagnósticos/assessoria), sistema (software/ferramenta/produto digital). Responda para TODOS os ids recebidos.',
      prompt: batch.map((r) => `id: ${r.id}\ntítulo: ${r.title}\ndor: ${r.pain}\ntipo atual: ${r.type}`).join('\n---\n'),
    });
    for (const item of object.items) {
      const orig = batch.find((r) => r.id === item.id);
      if (!orig) continue; // id inventado pela IA — ignorar
      const subtype = item.subtype.trim() || null;
      console.log(`${orig.id} | "${orig.title}" | ${orig.type} -> ${item.type}${subtype ? ` (${subtype})` : ''}`);
      if (!dryRun) {
        await pool.query(`UPDATE app_opportunities SET type=$2, subtype=$3 WHERE id=$1`, [item.id, item.type, subtype]);
      }
    }
    const missing = batch.filter((r) => !object.items.some((it) => it.id === r.id));
    for (const m of missing) console.log(`${m.id} | "${m.title}" | SEM RESPOSTA DA IA — mantido como ${m.type}`);
  }
  console.log('Concluído. O log acima é o de-para de auditoria (salve se quiser).');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
