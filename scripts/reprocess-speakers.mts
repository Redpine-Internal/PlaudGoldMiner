// Uso: npx tsx scripts/reprocess-speakers.mts [--dry-run] [--limit=N]
//
// Recupera a marcação de falante das transcrições já ingeridas.
//
// A ingestão passou a preservar `Speaker N:` (lib/plaud/client.ts), mas o
// acervo foi gravado antes disso e é texto corrido. Sem saber quem falou, não
// se distingue o cliente relatando a própria dor do consultor perguntando
// sobre ela — sinais opostos para a mineração, e a origem do viés que trouxe
// palestras para dentro da análise como se fossem conversas de cliente.
//
// Só reescreve quando a versão nova traz falante E preserva o conteúdo. Uma
// transcrição é o registro do que foi dito: perder texto aqui é perder prova.
import 'dotenv/config';
import { getFileContent } from '../lib/plaud/client';
import { pool } from '../lib/db';

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 0;

/** Pausa entre gravações: a API do Plaud tem cota e o lote é grande. */
const INTERVALO_MS = Number(process.env.PLAUD_INGEST_MIN_INTERVAL_MS ?? 1200);

/**
 * Quanto do conteúdo original a versão nova precisa preservar.
 *
 * Comparar caractere a caractere não serve: a versão nova acrescenta os
 * prefixos "Speaker N: " e junta turnos, então difere por construção. O que
 * não pode acontecer é a transcrição ENCOLHER — isso indicaria segmento
 * faltando ou resposta parcial da API, e reescrever perderia fala.
 */
const MIN_RAZAO_CONTEUDO = 0.9;

/** Texto sem os prefixos e espaços, para comparar só o conteúdo falado. */
function conteudoNu(texto: string): string {
  return texto.replace(/^Speaker\s+\S+:\s*/gm, '').replace(/\s+/g, '');
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { rows } = await pool.query<{ id: string; fid: string; atual: string; titulo: string }>(
    `SELECT id::text AS id,
            metadata->>'plaud_file_id' AS fid,
            transcription AS atual,
            left(coalesce(title,''), 44) AS titulo
       FROM meetings
      WHERE metadata->>'plaud_file_id' IS NOT NULL
        AND transcription IS NOT NULL
        AND trim(transcription) <> ''
        -- Já tem falante: nada a fazer.
        AND transcription !~ '(?m)^Speaker\\s'
      ORDER BY meeting_date DESC
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`
  );

  console.log(`${rows.length} transcrições sem falante${dryRun ? ' (dry-run)' : ''}.\n`);

  let atualizadas = 0;
  let semFalante = 0;
  let inacessiveis = 0;
  let recusadas = 0;

  for (const [i, r] of rows.entries()) {
    if (i) await wait(INTERVALO_MS);

    // O acervo guarda o id sem o prefixo `of_`; a API exige em parte dos casos.
    let novo = '';
    for (const cand of r.fid.startsWith('of_') ? [r.fid] : [`of_${r.fid}`, r.fid]) {
      try {
        novo = (await getFileContent(cand)).transcript;
        break;
      } catch {
        // tenta a próxima forma do id
      }
    }

    if (!novo) {
      inacessiveis += 1;
      console.log(`  [${i + 1}/${rows.length}] INACESSÍVEL  ${r.titulo}`);
      continue;
    }
    if (!/^Speaker\s/m.test(novo)) {
      semFalante += 1;
      console.log(`  [${i + 1}/${rows.length}] sem falante  ${r.titulo}`);
      continue;
    }

    // Guarda de conteúdo: a versão nova não pode ter menos fala que a atual.
    const razao = conteudoNu(novo).length / Math.max(1, conteudoNu(r.atual).length);
    if (razao < MIN_RAZAO_CONTEUDO) {
      recusadas += 1;
      console.log(
        `  [${i + 1}/${rows.length}] RECUSADA (${Math.round(razao * 100)}% do conteúdo)  ${r.titulo}`
      );
      continue;
    }

    if (!dryRun) {
      await pool.query(
        `UPDATE meetings SET transcription = $2, transcription_length = $3 WHERE id = $1`,
        [r.id, novo, novo.length]
      );
    }
    atualizadas += 1;
    const falantes = new Set(novo.match(/^Speaker\s+\S+(?=:)/gm) ?? []).size;
    console.log(`  [${i + 1}/${rows.length}] ${falantes} falantes  ${r.titulo}`);
  }

  console.log(
    `\n${dryRun ? 'Seriam atualizadas' : 'Atualizadas'}: ${atualizadas}` +
      ` | sem falante: ${semFalante} | inacessíveis: ${inacessiveis} | recusadas: ${recusadas}`
  );
}

main()
  .catch((e) => console.error('Falhou:', e instanceof Error ? e.message : e))
  .finally(() => pool.end());
