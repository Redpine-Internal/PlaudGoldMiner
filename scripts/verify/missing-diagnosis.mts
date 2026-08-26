import 'dotenv/config';
import { pool } from '@/lib/db';
import { listFiles, getFileContent } from '@/lib/plaud/client';

// Diagnóstico do gap: para cada gravação do Plaud ainda sem meeting no banco,
// verifica se ela tem transcrição (se tiver, deveria ter sido ingerida).
async function main() {
  const plaud = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data } = await listFiles(page, 50);
    for (const f of data) plaud.set(f.id, f.name || '');
    if (data.length < 50) break;
    page += 1;
  }

  const dbRes = await pool.query<{ pf: string }>(
    `SELECT metadata->>'plaud_file_id' AS pf FROM meetings WHERE metadata->>'plaud_file_id' IS NOT NULL`
  );
  const dbIds = new Set(dbRes.rows.map((r) => r.pf));
  const missing = [...plaud.keys()].filter((id) => !dbIds.has(id));
  console.log(`Plaud: ${plaud.size} | banco: ${dbIds.size} | faltando: ${missing.length}`);

  let semTranscricao = 0;
  let comTranscricao = 0;
  let erros = 0;
  for (const id of missing) {
    try {
      const { transcript } = await getFileContent(id);
      if (!transcript || transcript.trim().length === 0) {
        semTranscricao += 1;
        console.log(`SEM TRANSCRIÇÃO: ${id} (${plaud.get(id)})`);
      } else {
        comTranscricao += 1;
        console.log(`TEM TRANSCRIÇÃO (deveria ingerir!): ${id} (${plaud.get(id)})`);
      }
    } catch (e) {
      erros += 1;
      console.log(`ERRO: ${id} (${plaud.get(id)}):`, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`=== RESUMO: sem transcrição=${semTranscricao} com transcrição=${comTranscricao} erros=${erros} ===`);
  await pool.end();
}

main();
