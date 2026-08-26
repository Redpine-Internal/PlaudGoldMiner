import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { getStoredAccessToken, __testing } from '@/lib/plaud/token-store';

async function main() {
  // Prepara uma linha de teste com access_token válido e não expirado —
  // getStoredAccessToken NÃO deve chamar refresh nesse caso.
  await pool.query(
    `INSERT INTO app_plaud_tokens (id, access_token, refresh_token, expires_at)
     VALUES ('default', 'AT-valido', 'RT-1', now() + interval '1 hour')
     ON CONFLICT (id) DO UPDATE SET access_token='AT-valido', refresh_token='RT-1',
       expires_at=now() + interval '1 hour', updated_at=now()`
  );
  let calls = 0;
  __testing.setRefreshFn(async () => { calls++; throw new Error('não deveria chamar refresh'); });

  const t1 = await getStoredAccessToken();
  assert.equal(t1, 'AT-valido', 'deve usar o access_token do banco');
  assert.equal(calls, 0, 'não deve chamar refresh com token válido');

  // Expira o token: agora deve chamar refresh UMA vez, persistir rotação e devolver o novo.
  await pool.query(`UPDATE app_plaud_tokens SET expires_at = now() - interval '1 minute' WHERE id='default'`);
  __testing.setRefreshFn(async (rt) => {
    calls++;
    assert.equal(rt, 'RT-1', 'refresh deve usar o refresh_token do banco');
    return { access_token: 'AT-novo', refresh_token: 'RT-2', token_type: 'Bearer', expires_in: 3600 };
  });
  __testing.clearCache();
  const t2 = await getStoredAccessToken();
  assert.equal(t2, 'AT-novo');
  assert.equal(calls, 1, 'refresh exatamente uma vez');
  const row = (await pool.query(`SELECT access_token, refresh_token FROM app_plaud_tokens WHERE id='default'`)).rows[0];
  assert.equal(row.access_token, 'AT-novo', 'access_token persistido');
  assert.equal(row.refresh_token, 'RT-2', 'refresh_token ROTACIONADO persistido');

  // Concorrência: 5 chamadas simultâneas com token expirado → refresh 1 vez (single-flight via FOR UPDATE + re-check).
  await pool.query(`UPDATE app_plaud_tokens SET expires_at = now() - interval '1 minute' WHERE id='default'`);
  calls = 0;
  __testing.setRefreshFn(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 200));
    return { access_token: 'AT-3', refresh_token: 'RT-3', token_type: 'Bearer', expires_in: 3600 };
  });
  __testing.clearCache();
  const tokens = await Promise.all([1, 2, 3, 4, 5].map(() => getStoredAccessToken()));
  assert.ok(tokens.every((t) => t === 'AT-3'), 'todas as chamadas recebem o token novo');
  assert.equal(calls, 1, 'apenas 1 refresh mesmo sob concorrência');

  await pool.query(`DELETE FROM app_plaud_tokens WHERE id='default'`);
  console.log('=== VERIFY token-store OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
