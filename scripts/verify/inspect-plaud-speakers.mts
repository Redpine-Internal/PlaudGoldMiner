// Uso: npx tsx scripts/verify/inspect-plaud-speakers.mts [plaud_file_id]
//
// Verifica se o Plaud entrega identificação de falante nos segmentos de
// transcrição. O tipo em lib/plaud/client.ts declara `speaker`, mas
// `parseTranscript` usa só `content` — e ninguém conferiu se o campo vem
// preenchido. Sem essa resposta não dá para saber se diarização é "parar de
// descartar um dado" ou "obter um dado que não existe".
//
// Usa getFile do próprio client, para exercitar o mesmo caminho da ingestão.
// Somente leitura: não grava nada.
import 'dotenv/config';
import { getFile } from '../../lib/plaud/client';
import { pool } from '../../lib/db';

async function main() {
  const argId = process.argv[2];

  // Sem id na linha de comando, tenta as gravações mais recentes com
  // transcrição longa — as antigas podem já ter saído do alcance da API.
  const ids = argId
    ? [argId]
    : (
        await pool.query<{ fid: string }>(
          `SELECT metadata->>'plaud_file_id' AS fid
             FROM meetings
            WHERE metadata->>'plaud_file_id' IS NOT NULL
              AND transcription_length > 5000
            ORDER BY meeting_date DESC LIMIT 5`
        )
      ).rows.map((r) => r.fid);

  if (!ids.length) {
    console.log('Nenhuma gravação Plaud encontrada.');
    return;
  }

  for (const id of ids) {
    // O acervo guarda o id sem o prefixo `of_`, mas a API o exige em parte das
    // gravações — tenta as duas formas.
    const candidatos = id.startsWith('of_') ? [id] : [`of_${id}`, id];
    let detail: Awaited<ReturnType<typeof getFile>> | null = null;
    let aceito = '';

    for (const cand of candidatos) {
      try {
        detail = await getFile(cand);
        aceito = cand;
        break;
      } catch {
        // Segue para a próxima forma do id.
      }
    }

    if (!detail) {
      console.log(`${id}: não acessível pela API.`);
      continue;
    }

    const seg = (detail.source_list ?? []).find((s) => s.data_type === 'transaction');
    if (!seg) {
      console.log(`${aceito}: sem segmento de transcrição.`);
      continue;
    }

    let raw = seg.data_content ?? '';
    if (!raw && seg.data_link) raw = await (await fetch(seg.data_link)).text();

    let arr: unknown;
    try {
      arr = JSON.parse(raw);
    } catch {
      console.log(`${aceito}: transcrição vem como texto corrido, não JSON.`);
      console.log(`   ${raw.slice(0, 160)}`);
      continue;
    }
    if (!Array.isArray(arr)) {
      console.log(`${aceito}: JSON não é array (${Object.keys(arr as object).join(', ')}).`);
      continue;
    }

    const segs = arr as Array<Record<string, unknown>>;
    const campos = [...new Set(segs.flatMap((s) => Object.keys(s)))];
    // A pergunta central: há identificação de falante, e ela VARIA ao longo da
    // conversa? Um valor único em todos os segmentos é tão inútil quanto nenhum.
    const speakers = segs.map((s) => s.speaker ?? s.speaker_id ?? s.speakerId ?? null);
    const distintos = [...new Set(speakers.filter((s) => s !== null && s !== undefined))];

    console.log(`\n=== ${aceito} — ${segs.length} segmentos ===`);
    console.log(`campos: ${campos.join(', ')}`);
    console.log(`falantes distintos: ${distintos.length} → ${JSON.stringify(distintos.slice(0, 8))}`);
    for (const s of segs.slice(0, 4)) {
      const quem = s.speaker ?? s.speaker_id ?? s.speakerId ?? '(sem falante)';
      console.log(`   [${quem}] ${String(s.content ?? '').slice(0, 80)}`);
    }
    // Uma gravação conclusiva basta para responder a pergunta.
    if (distintos.length > 1) {
      console.log('\n>>> O Plaud ENTREGA falantes distintos. A ingestão os descarta.');
      return;
    }
  }
}

main()
  .catch((e) => console.error('Falhou:', e instanceof Error ? e.message : e))
  .finally(() => pool.end());
