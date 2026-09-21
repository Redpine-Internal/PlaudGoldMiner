// Uso: npx tsx scripts/verify/check-speaker-recovery.mts [amostra]
//
// Mede quantas transcrições do acervo ainda podem recuperar a marcação de
// falante pela API do Plaud. A ingestão passou a preservá-la, mas as 271
// gravações existentes são texto corrido — e sem saber quem falou, metade das
// perguntas de qualificação não é respondível.
//
// A pergunta que isto responde: a metodologia se aplica ao acervo, ou só daqui
// para frente? Amostra estratificada por mês, porque a disponibilidade tende a
// cair com a idade da gravação.
//
// Somente leitura: não grava nada.
import 'dotenv/config';
import { getFile } from '../../lib/plaud/client';
import { pool } from '../../lib/db';

const AMOSTRA_POR_MES = Number(process.argv[2] ?? 2);

interface Linha {
  fid: string;
  mes: string;
  titulo: string;
}

/** Testa as duas formas do id: o acervo guarda sem o prefixo `of_`. */
async function buscar(fid: string) {
  for (const cand of fid.startsWith('of_') ? [fid] : [`of_${fid}`, fid]) {
    try {
      return await getFile(cand);
    } catch {
      // tenta a próxima forma
    }
  }
  return null;
}

async function main() {
  // Amostra estratificada: as primeiras N de cada mês, para medir se a
  // disponibilidade cai com a idade em vez de ler só as recentes.
  const { rows } = await pool.query<Linha>(
    `SELECT fid, mes, titulo FROM (
       SELECT metadata->>'plaud_file_id' AS fid,
              to_char(meeting_date, 'YYYY-MM') AS mes,
              left(coalesce(title,''), 40) AS titulo,
              row_number() OVER (PARTITION BY to_char(meeting_date,'YYYY-MM')
                                 ORDER BY meeting_date DESC) AS n
         FROM meetings
        WHERE metadata->>'plaud_file_id' IS NOT NULL
          AND transcription_length > 3000
     ) t WHERE n <= $1 ORDER BY mes DESC`,
    [AMOSTRA_POR_MES]
  );

  console.log(`Amostra: ${rows.length} gravações (${AMOSTRA_POR_MES} por mês)\n`);

  const porMes = new Map<string, { ok: number; comFalante: number; total: number }>();

  for (const r of rows) {
    const acc = porMes.get(r.mes) ?? { ok: 0, comFalante: 0, total: 0 };
    acc.total += 1;

    const detail = await buscar(r.fid);
    if (!detail) {
      porMes.set(r.mes, acc);
      console.log(`  ${r.mes}  INACESSÍVEL  ${r.titulo}`);
      continue;
    }
    acc.ok += 1;

    const seg = (detail.source_list ?? []).find((s) => s.data_type === 'transaction');
    let raw = seg?.data_content ?? '';
    if (!raw && seg?.data_link) raw = await (await fetch(seg.data_link)).text();

    let falantes = 0;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        falantes = new Set(
          arr.map((s: Record<string, unknown>) => s?.speaker).filter(Boolean)
        ).size;
      }
    } catch {
      // transcrição em texto corrido — sem falante
    }
    if (falantes > 1) acc.comFalante += 1;

    porMes.set(r.mes, acc);
    console.log(
      `  ${r.mes}  ${falantes > 1 ? `${falantes} falantes` : 'sem falante '}  ${r.titulo}`
    );
  }

  console.log('\n=== Resumo por mês ===');
  let totalOk = 0;
  let totalComFalante = 0;
  let total = 0;
  for (const [mes, v] of [...porMes.entries()].sort()) {
    total += v.total;
    totalOk += v.ok;
    totalComFalante += v.comFalante;
    console.log(`  ${mes}: ${v.comFalante}/${v.total} com falante (${v.ok} acessíveis)`);
  }
  const pct = total ? Math.round((totalComFalante / total) * 100) : 0;
  console.log(`\nTOTAL: ${totalComFalante}/${total} recuperáveis com falante (${pct}%)`);
  console.log(`       ${totalOk}/${total} ainda acessíveis pela API`);

  // Projeção para o acervo inteiro, com a ressalva de que é amostra.
  const { rows: tot } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM meetings
      WHERE metadata->>'plaud_file_id' IS NOT NULL AND transcription_length > 3000`
  );
  console.log(
    `\nAcervo com transcrição: ${tot[0].n} gravações. ` +
      `Projeção (amostra): ~${Math.round((Number(tot[0].n) * pct) / 100)} recuperáveis.`
  );
}

main()
  .catch((e) => console.error('Falhou:', e instanceof Error ? e.message : e))
  .finally(() => pool.end());
