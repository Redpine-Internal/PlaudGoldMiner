// Uso: npx tsx scripts/rejudge-evidence.mts [--apply] [--limit N]
//
// Reavalia os trechos marcados como fala confirmada antes do julgamento de
// evidência existir. Eles foram aprovados por sobreposição de palavras, que não
// distingue quem fala: uma amostra de 40 encontrou 8 que são a consultora
// propondo a solução, exibidos na tela como se fossem o cliente relatando a
// dor.
//
// Só REBAIXA: uma fonte confirmada que o julgamento recusa perde a marca de
// fala. Nunca promove — um trecho hoje não confirmado continua não confirmado,
// porque a passagem que a heurística escolheu na época não foi guardada e não
// há o que reavaliar.
//
// Sem --apply não escreve nada.

import 'dotenv/config';
import { pool } from '@/lib/db';
import { lerProcedencia, marcarProcedencia } from '@/lib/ai/excerpt-provenance';
import { anchorEvidence, isTopicList } from '@/lib/ai/services/evidence-anchor';
import { rankWindow } from '@/lib/ai/services/opportunity-batch-analyzer';
import { isTypeSafeConfigured } from '@/lib/ai/typesafe-client';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 200;

if (!isTypeSafeConfigured()) {
  console.error('TYPESAFE_API_KEY não configurada — nada a fazer.');
  process.exit(1);
}

interface Row {
  id: string;
  excerpt: string;
  pain: string | null;
  title: string;
  transcription: string | null;
}

const { rows } = await pool.query<Row>(
  `SELECT s.id, s.excerpt, o.pain, o.title, c.transcription
     FROM app_opportunity_sources s
     JOIN app_opportunities o ON o.id::text = s.opportunity_id::text
     JOIN conversations c ON c.id::text = s.conversation_id::text
    WHERE s.excerpt LIKE '[fala] %'
      AND c.transcription IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT $1`,
  [limit]
);

console.log(`${rows.length} fonte(s) confirmada(s) para reavaliar.${apply ? '' : '  [DRY-RUN]'}\n`);

let mantidas = 0;
let rebaixadas = 0;
let indisponivel = 0;
const motivos = new Map<string, number>();

for (const r of rows) {
  const { texto } = lerProcedencia(r.excerpt);
  if (!texto || !r.transcription) continue;

  // A dor é o que o julgamento compara; sem ela não há pergunta a fazer.
  if (!r.pain?.trim()) {
    mantidas++;
    continue;
  }

  // Índice de assuntos não é afirmação: rebaixa sem gastar chamada.
  if (isTopicList(texto)) {
    rebaixadas++;
    motivos.set('nao-e-afirmacao', (motivos.get('nao-e-afirmacao') ?? 0) + 1);
    if (apply) {
      await pool.query(`UPDATE app_opportunity_sources SET excerpt = $2 WHERE id = $1`, [
        r.id,
        marcarProcedencia(texto, false),
      ]);
    }
    console.log(`REBAIXA [nao-e-afirmacao] ${r.title.slice(0, 55)}`);
    continue;
  }

  // O trecho já confirmado É o candidato a validar: pergunta se ele sustenta a
  // dor, em vez de procurar outro na transcrição.
  const res = await anchorEvidence(r.pain, texto, r.transcription, {
    fallback: () => texto,
    rank: (_t, phrase, window) => rankWindow(phrase, window),
  });

  if (res.reason === 'indisponivel') {
    // Julgamento fora do ar não é veredito: mantém como está.
    indisponivel++;
    continue;
  }

  if (res.fromTranscription) {
    mantidas++;
    continue;
  }

  rebaixadas++;
  const motivo = res.reason ?? 'desconhecido';
  motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
  console.log(`REBAIXA [${motivo}] ${r.title.slice(0, 55)}`);
  console.log(`         "${texto.slice(0, 110)}"`);

  if (apply) {
    await pool.query(`UPDATE app_opportunity_sources SET excerpt = $2 WHERE id = $1`, [
      r.id,
      marcarProcedencia(texto, false),
    ]);
  }
}

console.log('\n--- RESUMO ---');
console.log(`mantidas confirmadas: ${mantidas}`);
console.log(`rebaixadas:           ${rebaixadas}`);
for (const [m, n] of motivos) console.log(`   ${m}: ${n}`);
console.log(`julgamento indisponível (intocadas): ${indisponivel}`);
if (!apply) console.log('\nDRY-RUN — nada foi gravado. Use --apply para efetivar.');

await pool.end();
