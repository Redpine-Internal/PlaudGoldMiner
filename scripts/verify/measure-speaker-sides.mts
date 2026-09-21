// Uso: npx tsx scripts/verify/measure-speaker-sides.mts [amostra]
//
// Mede a taxa de fala sem lado definido no acervo.
//
// É o número que decide se a qualificação por metodologia é aplicável: as
// perguntas que predizem venda ("o CLIENTE relatou a dor", "o CLIENTE
// manifestou intenção") dependem de saber de que lado veio a fala. Acima de
// ~30% de fala indeterminada, o eixo de intenção não é utilizável e o que se
// tem é um classificador de gatilho, não de dor — ainda útil, mas é preciso
// saber que é isso.
//
// Somente leitura: não grava nada.
import 'dotenv/config';
import { parseSpeakers, classifySpeakerSides, indeterminateShare } from '../../lib/ai/services/speaker-side';
import { pool } from '../../lib/db';

const AMOSTRA = Number(process.argv[2] ?? 12);

async function main() {
  const { rows } = await pool.query<{ titulo: string; transcription: string }>(
    `SELECT left(coalesce(title,''), 44) AS titulo, transcription
       FROM conversations
      WHERE transcription ~ '(?m)^Speaker\\s'
        AND type IN ('reuniao_comercial','diagnostico','projeto_cliente','mentoria','reuniao_interna','reuniao','informal')
      ORDER BY date DESC LIMIT $1`,
    [AMOSTRA]
  );

  console.log(`Amostra: ${rows.length} conversas elegíveis com falante marcado.\n`);

  const taxas: number[] = [];
  let comCliente = 0;
  let comConsultoria = 0;

  for (const r of rows) {
    const speakers = parseSpeakers(r.transcription);
    const res = await classifySpeakerSides(speakers);
    if (!res.success) {
      console.log(`  ERRO  ${r.titulo}: ${res.error.message}`);
      continue;
    }

    const taxa = indeterminateShare(speakers, res.sides);
    taxas.push(taxa);

    const porLado = { cliente: 0, consultoria: 0, indeterminado: 0 };
    for (const s of res.sides) porLado[s.side] += 1;
    if (porLado.cliente > 0) comCliente += 1;
    if (porLado.consultoria > 0) comConsultoria += 1;

    console.log(
      `  ${String(Math.round(taxa * 100)).padStart(3)}% indef  ` +
        `${porLado.cliente}C/${porLado.consultoria}V/${porLado.indeterminado}?  ${r.titulo}`
    );
  }

  if (!taxas.length) {
    // Sem medição não há veredito: um "viável" calculado sobre zero conversas
    // afirmaria o que ninguém mediu.
    console.log('\nNenhuma conversa classificada — sem base para concluir.');
    return;
  }

  const media = taxas.reduce((a, b) => a + b, 0) / taxas.length;
  const acima30 = taxas.filter((t) => t > 0.3).length;

  console.log(`\n=== Resultado ===`);
  console.log(`  Fala indeterminada (média): ${Math.round(media * 100)}%`);
  console.log(`  Conversas acima de 30%: ${acima30}/${taxas.length}`);
  console.log(`  Com ao menos um cliente identificado: ${comCliente}/${taxas.length}`);
  console.log(`  Com ao menos um consultor identificado: ${comConsultoria}/${taxas.length}`);
  console.log(
    `\n  ${media <= 0.3 ? 'VIÁVEL' : 'INVIÁVEL'}: o eixo de intenção ` +
      `${media <= 0.3 ? 'é utilizável' : 'não é utilizável — restaria classificar gatilho, não dor'}.`
  );
}

main()
  .catch((e) => console.error('Falhou:', e instanceof Error ? e.message : e))
  .finally(() => pool.end());
