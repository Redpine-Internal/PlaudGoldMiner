# Fase 3 — Ingestão direta do Plaud (só depósito)

**Data:** 2026-08-24
**Status:** aprovado
**Depende de:** Fase 1+0 (view `conversations` sobre `meetings`/`summaries`, driver Postgres) — concluída.

## Objetivo

Trazer gravações do Plaud direto para o banco Supabase (`meetings` + `summaries`),
sem passar pelo Google Drive e **sem rodar IA**. A app apenas deposita o dado bruto.
O acionamento de análise (n8n ou local) fica para uma fase futura, decidida à parte.

## Decisões de design (do brainstorming)

1. **Escopo = só depósito.** A ingestão não dispara Azure OpenAI nem n8n; não cria
   oportunidades/social/insights. Traz do Plaud e grava em `meetings`/`summaries`.
2. **Escreve direto em `meetings`/`summaries`**, não pela view `conversations`. A
   ingestão precisa controlar `metadata` bruto (gravar `plaud_file_id`) e a linha de
   `summaries` separadamente — coisa que a view achata. As 20 rotas existentes seguem
   usando a view; só a ingestão fala com as tabelas base.
3. **Idempotência condicional por conteúdo.** Casa por `metadata->>'plaud_file_id'`.
   - Não existe → cria (status cloud `received` = app `pendente`).
   - Existe e conteúdo idêntico → **pula** (não toca `updated_at` nem status).
   - Existe e conteúdo mudou → atualiza só os campos alterados, **preserva
     `meetings.status`** (não reseta análise já feita).
4. **Gatilho = rota POST manual.** Sem cron por ora.
5. **Sem flag `AI_SOURCE_INGEST`.** Só existe um caminho (Plaud direto); a flag não
   tem função agora. Adicionar quando houver um segundo caminho a alternar (YAGNI).

## Componentes

### `lib/plaud/ingest.ts` — `ingestPlaudFile(fileId)`

O coração da fase. Assinatura:

```ts
type IngestOutcome = 'created' | 'updated' | 'skipped';
interface IngestResult {
  fileId: string;
  meetingId: string;
  outcome: IngestOutcome;
  reason?: string; // p.ex. 'sem transcrição' quando pulou por falta de conteúdo
}
async function ingestPlaudFile(fileId: string): Promise<IngestResult>;
```

Passos:
1. `getFileContent(fileId)` (já existe em `lib/plaud/client.ts`) →
   `{ file, transcript, summary, topics }`.
2. Se `transcript` vazio → `skipped` com `reason: 'sem transcrição'` (nada a depositar).
3. `SELECT id, title, transcription, meeting_date, metadata FROM meetings
   WHERE metadata->>'plaud_file_id' = $1 LIMIT 1` (+ último `summaries.summary_text`).
4. **Não existe** → INSERT em `meetings`:
   - `id` = uuid gerado, `title` = `file.name`, `transcription` = transcript,
     `transcription_length` = length, `meeting_date` = data do Plaud (start_at/created_at),
     `participants` = `[]`, `source` = `'plaud'`, `status` = `'received'`,
     `metadata` = `{ plaud_file_id, duration, type:'reuniao', topics }` (jsonb).
   - Se `summary` não vazio → INSERT 1 linha em `summaries` (meeting_id, summary_text).
   - → `outcome: 'created'`.
5. **Existe** → comparar campos vindos do Plaud com o banco:
   - `transcription`, `summary` (última), `title`, `meeting_date`, `topics`.
   - Se **todos iguais** → `outcome: 'skipped'` (nenhum write).
   - Se algum mudou → UPDATE só dos campos alterados em `meetings` (mais
     `transcription_length` e `metadata` mesclado). **Não altera `status`.**
     Summary mudou → UPDATE/INSERT em `summaries` (mesma lógica do trigger da Fase 1).
   - → `outcome: 'updated'`.

Mapeamento de status: a ingestão só usa o vocabulário **cloud** direto (`received`),
porque escreve em `meetings`, não na view. Não passa pela função `app_status_to_cloud`.

### `POST /api/plaud/ingest` — lote manual

- Body opcional `{ maxPages?: number }` (default: varre até esgotar).
- Pagina `listFiles(page, pageSize)` até a página vir vazia (ou atingir `maxPages`).
- Para cada file, chama `ingestPlaudFile(file.id)`; erro por-item é capturado
  (try/catch) e vira uma entrada em `errors`, **não aborta o lote**.
- `PlaudAuthError` no nível do lote (falha de auth global) → 401 `{ code: 'plaud_auth' }`,
  como as demais rotas Plaud.
- Resposta 200:
  ```json
  {
    "total": 226,
    "created": 3,
    "updated": 1,
    "skipped": 222,
    "errors": [{ "fileId": "…", "message": "…" }]
  }
  ```

## Fluxo de dados

```
POST /api/plaud/ingest
  → listFiles(page…)              (Plaud API, paginado)
  → para cada file:
      getFileContent(fileId)       (Plaud API: transcript+summary+topics)
      ingestPlaudFile(fileId):
        SELECT meetings WHERE metadata->>'plaud_file_id' = fileId
        created | updated(diff) | skipped
  → resumo agregado { total, created, updated, skipped, errors }
```

A view `conversations` (Fase 1) já enxerga esses meetings automaticamente — nenhuma
rota de leitura precisa mudar.

## Fora de escopo

- Não roda Azure OpenAI, não chama n8n, não cria oportunidades/social/insights.
- Não mexe na view `conversations` nem nas 20 rotas existentes.
- Sem cron/agendamento.
- Sem flag `AI_SOURCE_INGEST`.
- `local.db` permanece intocado (rede de segurança até a Fase 5).

## Idempotência — a chave

`metadata->>'plaud_file_id'` (cobertura verificada: 225/226 na base atual). A
comparação de conteúdo antes de escrever evita writes desnecessários e preserva
`updated_at`/`status` quando nada mudou no Plaud.

## Testes

- Unit/integração de `ingestPlaudFile` contra o cloud usando um `fileId` de teste:
  1. primeira ingestão → `created`; meeting existe com `plaud_file_id`, status `received`.
  2. re-ingestão sem mudança → `skipped`; `updated_at` inalterado.
  3. re-ingestão com transcript alterado → `updated`; status preservado.
  4. arquivo sem transcript → `skipped` com `reason`.
- Rota `POST /api/plaud/ingest`: resumo agregado correto; erro por-item não aborta;
  auth ausente → 401 `plaud_auth`.
- Limpeza: remover o meeting de teste ao final (não poluir os 226 reais).
