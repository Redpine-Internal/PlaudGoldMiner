# EHS Insights

Transforma conversas de trabalho gravadas na EHS Brasil em inteligência de negócio.

A Andresa grava reuniões, treinamentos e conversas de corredor num [Plaud](https://plaud.ai).
São centenas de horas por ano em que clientes dizem, sem perceber, o que precisam comprar.
Ninguém tem tempo de reouvir aquilo — então o conhecimento morre no gravador.

Este sistema ingere todas as gravações, entende o que foi dito e responde três perguntas
que ninguém conseguiria responder à mão:

1. **O que se repete?** Um tema mencionado em 8 de 50 conversas não é acaso — é demanda.
2. **O que disso vira receita?** Nem todo padrão é oportunidade. O sistema qualifica.
3. **O que eu publico sobre isso?** Cada oportunidade vira pauta de conteúdo com evidência.

Tudo o que a IA afirma vem com o trecho da conversa que sustenta a afirmação, linkado à
origem. Nada de insight sem prova.

---

## O produto

### Da gravação ao insight

```
Plaud (gravações)
   ↓  ingestão diária + botão de sync manual
Conversa  — transcrição, resumo, participantes, data
   ↓  análise em lote sobre as N conversas mais recentes
Insight cruzado  — tema convergente + recorrência ("8 de 50 = 16%") + evidências
   ↓  qualificação por IA
   ├─→ Oportunidade real  — tem dor, evidência, aderência ao negócio e ação recomendada
   └─→ Padrão observado   — recorrente, mas ainda não acionável; segue monitorado
   ↓
Tema de negócio  — agrupa ofertas iguais escritas com títulos diferentes
   ↓
Pauta de conteúdo → rascunho → publicação
```

### Conceitos do domínio

| Conceito | O que é |
|---|---|
| **Conversa** | Uma gravação do Plaud já ingerida: data, transcrição, resumo. Unidade de evidência de todo o resto |
| **Insight cruzado** | Convergência detectada entre várias conversas. Sempre carrega recorrência e evidências |
| **Recorrência** | A medida "X de Y conversas (Z%)". Nunca contagem absoluta sem denominador |
| **Oportunidade real** | Insight que passou na qualificação: dor identificada, evidência rastreável, aderência ao negócio, recomendação acionável |
| **Padrão observado** | Tema recorrente que **não** se qualificou. Vale acompanhar, não pede ação |
| **Evidência** | Trecho-fonte de uma conversa específica, sempre com link para a origem |
| **Hipótese de metodologia** | Abordagem proposta pela IA. Marcada como hipótese; exige aprovação humana |

Oportunidades têm taxonomia fechada — **treinamento**, **consultoria** ou **sistema** — com
subtipo livre sugerido pela IA (ex.: "Treinamento NR-35").

O glossário completo, com os termos a evitar, está em [`CONTEXT.md`](./CONTEXT.md).

### O que o usuário faz no sistema

| Área | Para quê |
|---|---|
| **Conversas** | Navegar as gravações ingeridas, ler transcrição e resumo, ver as oportunidades que cada uma gerou |
| **Novos Negócios** | Oportunidades qualificadas, agrupadas por tema recorrente, com recorrência e evidências. Priorização manual |
| **Conteúdos** | Pautas sugeridas a partir das oportunidades; geração de rascunho integral (artigo, post, carrossel, roteiro) |
| **Projetos** | Quadro de tarefas por oportunidade, com geração de ações por IA |
| **Assuntos de Interesse** | Enriquecimento de ideias com material de referência |
| **Clone** | Chat sobre a base — pergunta em linguagem natural, resposta com as conversas como contexto |
| **Perfil / Configurações** | Dados do usuário e operação da ingestão |

---

## Tecnologias

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | UI e API no mesmo projeto; build standalone para container |
| UI | React 19, Tailwind v4, shadcn/ui | — |
| Estado | Zustand, SWR | Estado local simples; cache de dados no cliente |
| Banco | Supabase Postgres + Drizzle ORM | Compartilhado com os agentes n8n; migrou de SQLite/libSQL |
| Autenticação | Supabase Auth (email/senha) | Sessão validada no middleware, a cada request |
| IA | Azure OpenAI (análise) + Anthropic Claude (clone), via AI SDK | `generateObject` com schema Zod garante saída estruturada |
| Ingestão | API do Plaud | Varredura completa e idempotente, com reconciliação diária |
| Automação | n8n (webhooks) | Pipeline de embeddings e agentes, fora deste app |
| Deploy | Docker → Google Cloud Run | Escala a zero; secrets no Secret Manager |

### Decisões que não são óbvias

**`conversations` é uma view, não uma tabela.** Ela projeta `meetings` + `summaries` com
triggers `INSTEAD OF`. Consequência prática: **não use `.returning()`** — o Postgres não
suporta em views com `INSTEAD OF`. Faça fetch-after-write.

**O token do Plaud vive no banco, não em env var.** O Plaud rotaciona o refresh token a cada
uso (validade 24h), então qualquer cópia estática — env, arquivo, Secret Manager — quebra no
primeiro refresh feito por outra instância. O refresh roda sob `SELECT ... FOR UPDATE` para
que instâncias concorrentes não invalidem o token uma da outra. Ver
[ADR-0001](./docs/adr/0001-tokens-plaud-persistidos-no-banco.md).

**Agrupamento de temas é cacheado.** Sem cache, abrir "Novos Negócios" gastaria cota da Azure
a cada visita.

**A ingestão é idempotente e completa.** Gravação sem resumo é processada, não ignorada —
completude é requisito, não otimização.

---

## Rodando local

O ambiente local roda **em container**, para espelhar o runtime do Cloud Run (build
standalone). `next dev` não reproduz o comportamento de produção — foi assim que um bug de
autenticação passou despercebido até chegar ao ar.

```bash
# crie o .env com as variáveis da seção abaixo
docker compose up -d --build
```

Disponível em **http://localhost:8090** (a 8080 costuma estar ocupada).

```bash
docker compose logs -f   # acompanhar
docker compose down      # derrubar
```

Para iterar em UI, `npm run dev` (porta 3000) é mais rápido — mas valide no container antes
de considerar pronto.

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (porta 3000) |
| `npm run build` | Build de produção (gera `.next/standalone`) |
| `npm test` | Testes unitários (Vitest) |
| `npm run lint` | ESLint |

---

## Variáveis de ambiente

Nenhuma vai para a imagem — `.dockerignore` exclui `.env*`. Em produção vêm do Secret Manager.

**Obrigatórias**

| Variável | Para quê |
|---|---|
| `MEETINGS_DATABASE_URL` | Postgres do Supabase. Use o **pooler** em modo session (porta 5432): `postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres`. O host `db.<ref>.supabase.co` é legado e não resolve mais |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente Supabase (embutida no bundle no build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Idem — pública por design |
| `SUPABASE_URL_SISTEMA` · `SUPABASE_SERVICE_ROLE_KEY_SISTEMA` | Operações server-side |
| `AUTH_SECRET` | Assinatura de sessão |
| `AZURE_OPENAI_API_KEY` · `_RESOURCE_NAME` · `_DEPLOYMENT` | Análise por IA |

**Opcionais**

| Variável | Efeito se ausente |
|---|---|
| `ANTHROPIC_API_KEY` | Clone conversacional indisponível |
| `N8N_WEBHOOK_URL` · `N8N_WEBHOOK_SECRET` | Integração n8n inativa |
| `INGEST_CRON_SECRET` | Ingestão agendada sem autenticação própria |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | Importação do Google Drive indisponível. **Não afeta o login** nem a ingestão do Plaud |
| `AZURE_OPENAI_TPM` | Assume 10.000 tokens/minuto |

O pipeline do Plaud não depende do Google em nenhum ponto — Drive é via alternativa de
entrada, para transcrições que não vieram do gravador.

---

## Deploy

Google Cloud Run, via Cloud Build:

```bash
gcloud builds submit --project=plaudgoldminersistema --config=cloudbuild.yaml \
  --substitutions=_NEXT_PUBLIC_SUPABASE_URL="<url>",_NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>"
```

As duas substitutions são obrigatórias: as `NEXT_PUBLIC_*` entram no bundle **no momento do
build**. Se forem vazias, a imagem sai sem configuração do Supabase e o login quebra.

O pipeline faz build → push no Artifact Registry → deploy. Segredos vêm do Secret Manager em
runtime.

---

## Testes

Vitest cobre a lógica de negócio: análise em lote de oportunidades, reancoragem de trechos na
transcrição, agrupamento por tema e processamento de transcrição.

```bash
npm test
```

---

## Estrutura

```
app/            rotas (páginas + API)
components/     UI, por domínio
lib/
  ai/           cliente e serviços de IA
  db/           Drizzle: schema e conexão
  plaud/        ingestão: cliente, tokens, pipeline
  drive/        importação do Google Drive
  n8n/          cliente dos webhooks
  auth/         configuração do Auth.js
docs/           PRD, ADRs, especificações
```
