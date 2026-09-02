# EHS Insights - Product Requirements Document

**Author:** Wesley
**Date:** 2025-11-28
**Version:** 1.2 (atualizado 2026-09-02 — sistema em produção)

> **Nota de versão.** As seções marcadas com **[IMPLEMENTADO]** descrevem o
> comportamento que está no ar hoje, verificado no código e no banco. As demais
> permanecem como intenção de produto. O nome do produto no PRD original era
> "Andresa AI"; o sistema em produção chama-se **EHS Insights**.

---

## Executive Summary

**EHS Insights** transforma conversas de trabalho gravadas na EHS Brasil em inteligência de negócio: oportunidades comerciais qualificadas, pautas de conteúdo e uma base consultável por chat.

A Andresa grava reuniões, treinamentos e conversas informais num Plaud. São centenas de horas por ano em que clientes dizem, sem perceber, o que precisam comprar — e que ninguém tem tempo de reouvir. O sistema ingere tudo, entende o que foi dito e **conecta pontos entre conversas diferentes**, revelando demanda que nenhuma conversa isolada mostraria.

### O que Torna Este Produto Especial

A IA vai além da transcrição e organização. Ela:
- **Detecta padrões** entre múltiplas conversas ao longo do tempo
- **Mede recorrência** com denominador explícito ("8 de 50 conversas, 16%"), não contagem solta
- **Qualifica** o que é oportunidade real e o que é apenas padrão observado
- **Sustenta cada afirmação** com o trecho da conversa que a originou, linkado à fonte

Exemplo real do sistema: *"Esse tema de treinamento em altura apareceu em 8 de 50 conversas (16%), subindo em relação à geração anterior (5 de 50). Qualificado como oportunidade real, tipo treinamento, subtipo 'Treinamento NR-35', com 8 evidências rastreáveis."*

### Princípio inegociável

**Nenhum insight sem evidência.** Toda afirmação da IA carrega o trecho-fonte e o link para a conversa de origem. Propostas de metodologia são marcadas como hipótese e exigem aprovação humana — a IA sugere, a Andresa decide.

---

## Project Classification

**Technical Type:** Web App (Next.js App Router, SSR + API Routes)
**Domain:** Inteligência comercial a partir de conversas gravadas
**Complexity:** Medium — pipeline de ingestão idempotente, análise em lote com controle de cota e estado compartilhado com agentes externos

**Status:** em produção no Google Cloud Run. **[IMPLEMENTADO]**

Situação atual (verificada no banco em 2026-09-02):

| Área | Estado |
|---|---|
| Conversas ingeridas | 257 |
| Oportunidades detectadas | 20 |
| Temas de negócio | 6 |
| Conteúdos | 20 |
| Projetos | 2 |
| Páginas | 11, todas funcionais (nenhuma placeholder) |
| Rotas de API | 43 |
| Testes | 70, cobrindo a lógica de análise e ingestão |

---

## Success Criteria

### Critério Principal: Qualidade das Ideias
O produto é bem-sucedido quando a IA gera sugestões que são:
- **Não-óbvias** - Conexões que a Andresa não faria sozinha
- **Acionáveis** - Ideias que podem virar produtos, serviços ou conteúdos reais
- **Relevantes** - Alinhadas com a expertise e interesses da Andresa
- **Surpreendentes** - O "momento eureka" de ver padrões escondidos

**Indicador:** Andresa implementa ou considera seriamente pelo menos 1 em cada 5 sugestões da IA.

### Critério Secundário: Economia de Tempo
O produto é bem-sucedido quando:
- Processar uma conversa de 1h gera resumo + insights em minutos (não horas)
- Andresa não precisa reouvir/reler conversas para lembrar o que foi discutido
- A busca por informações passadas é instantânea (vs. procurar em anotações)

**Indicador:** Redução de 80%+ no tempo gasto organizando e extraindo valor de conversas.

---

## Ecosystem & Integrations

### Fontes de Dados **[IMPLEMENTADO]**
- **Plaud:** Gravador que processa áudio e gera transcrições. Fonte primária, via API REST com varredura completa e idempotente.
- **Google Drive:** Via alternativa, para transcrições que não vieram do gravador. Opcional — o pipeline do Plaud não depende dele em nenhum ponto.

### Sistemas Externos **[IMPLEMENTADO]**
- **n8n:** Pipeline de embeddings e agentes, sobre o mesmo Postgres. Comunicação por webhooks autenticados (`x-plaude-api-key`). O app nunca fala com o Postgres do n8n diretamente.
- **Clone:** Deixou de ser sistema externo. Hoje é chat interno sobre a base (`/api/clone/chat`), com as conversas, oportunidades, conteúdos e perfil como contexto.

### Fluxo de Dados **[IMPLEMENTADO]**
```
┌─────────────┐
│    Plaud    │──────┐
│ (primário)  │      │     ┌──────────────────┐     ┌──────────────────┐
└─────────────┘      ├────▶│   EHS Insights   │◀───▶│ Supabase Postgres│
┌─────────────┐      │     │  ingestão + IA   │     │  (compartilhado) │
│Google Drive │──────┘     └──────────────────┘     └──────────────────┘
│ (opcional)  │                     │                         ▲
└─────────────┘                     │ webhooks                │
                                    ▼                         │
                            ┌──────────────┐                  │
                            │     n8n      │──────────────────┘
                            │ embeddings + │
                            │   agentes    │
                            └──────────────┘
```

---

## Scope Definition

### 📦 MVP Scope (Mínimo Viável)

O MVP foca em entregar valor imediato com o mínimo de complexidade técnica.

| Área | Funcionalidade | Prioridade | Descrição |
|------|----------------|------------|-----------|
| **Ingestão** | Varredura automática da API do Plaud | P0 | **[IMPLEMENTADO]** Reconciliação diária + botão de sync manual; idempotente |
| **Ingestão** | Importar do Google Drive | P0 | **[IMPLEMENTADO]** Via alternativa, para transcrições que não vieram do gravador |
| **Processamento** | Extração de insights via IA | P0 | **[IMPLEMENTADO]** Azure OpenAI com saída estruturada (Zod) |
| **Conversas** | Lista e detalhes | P0 | **[IMPLEMENTADO]** 257 conversas ingeridas |
| **Oportunidades** | Detecção + qualificação | P0 | **[IMPLEMENTADO]** Separa oportunidade real de padrão observado |
| **Conexões** | Insights cross-conversation | P0 | **[IMPLEMENTADO]** Análise em lote com recorrência e evidências |
| **Temas** | Agrupamento por tema recorrente | P0 | **[IMPLEMENTADO]** Une ofertas iguais escritas com títulos diferentes |
| **Conteúdos** | Pauta → rascunho integral | P1 | **[IMPLEMENTADO]** Artigo, post, carrossel ou roteiro |
| **Projetos** | Quadro de tarefas por oportunidade | P1 | **[IMPLEMENTADO]** Com geração de ações por IA |
| **Clone** | Chat sobre a base | P1 | **[IMPLEMENTADO]** Consulta interna, não export externo |

#### MVP User Flow **[IMPLEMENTADO]**
```
Fluxo Principal (Plaud):
1. Andresa grava a conversa no Plaud
2. Ingestão diária varre a API e traz TODAS as gravações (completude é requisito:
   gravação sem resumo é processada, não ignorada)
3. IA processa as conversas pendentes e extrai insights
4. Análise em lote cruza as N conversas mais recentes e mede recorrência
5. Insights qualificados viram oportunidades reais; os demais, padrões observados
6. Andresa prioriza, gera pauta de conteúdo ou abre projeto

Fluxo Alternativo (Google Drive):
1. Transcrição que não veio do Plaud está no Drive
2. Andresa conecta o Drive (OAuth) e seleciona o arquivo
3. Sistema processa e o material entra no mesmo pipeline
```

> A ingestão manual por upload de arquivo, prevista no PRD original, foi substituída pela
> varredura automática da API do Plaud. O "export para Clone" foi substituído pelo Clone
> como chat interno sobre a base.

### 🚀 Growth Scope (Pós-MVP)

| Área | Funcionalidade | Descrição |
|------|----------------|-----------|
| **Dashboard** | Métricas e visualizações | Overview de insights, tendências, padrões |
| **Configurações** | Preferências de IA | Customizar tipos de insights desejados |
| **Busca** | Busca semântica | Pipeline de embeddings existe no n8n; falta a superfície de busca no app |
| **Enriquecimento** | Material de referência por assunto | Parcialmente implementado (Assuntos de Interesse) |

### 🔮 Vision Scope (Futuro)

| Área | Funcionalidade | Descrição |
|------|----------------|-----------|
| **Multi-fonte** | Outras fontes de dados | Email, WhatsApp, notas manuais |
| **Automação** | Workflows automáticos | Ações automáticas baseadas em triggers |
| **Colaboração** | Compartilhamento | Compartilhar insights com equipe/clientes |
| **Mobile** | App mobile | Acesso rápido em qualquer lugar |

---

## Functional Requirements

### FR-1: Ingestão de Transcrições

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-1.1 | Sistema deve aceitar upload de arquivos .txt e .json | P0 |
| FR-1.2 | Sistema deve validar formato do arquivo antes de processar | P0 |
| FR-1.3 | Sistema deve extrair metadados (data, duração, participantes se disponível) | P0 |
| FR-1.4 | Sistema deve exibir progresso do upload/processamento | P0 |
| FR-1.5 | Sistema deve permitir associar tags/tipo à conversa (reunião, treinamento, informal) | P1 |
| FR-1.6 | Sistema deve permitir importar arquivos do Google Drive (fallback) | P0 |
| FR-1.7 | Sistema deve autenticar com Google OAuth para acesso ao Drive | P0 |

### FR-2: Processamento IA

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-2.1 | Sistema deve gerar resumo estruturado da conversa | P0 |
| FR-2.2 | Sistema deve extrair tópicos principais discutidos | P0 |
| FR-2.3 | Sistema deve identificar participantes e suas contribuições | P0 |
| FR-2.4 | Sistema deve detectar oportunidades de negócio mencionadas | P0 |
| FR-2.5 | Sistema deve identificar problemas/dores mencionados | P0 |
| FR-2.6 | Sistema deve conectar insights com conversas anteriores | P0 |
| FR-2.7 | Sistema deve gerar sugestões de conteúdo baseadas nos insights | P1 |

### FR-3: Visualização de Conversas

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-3.1 | Sistema deve listar todas as conversas com cards resumidos | P0 |
| FR-3.2 | Sistema deve permitir filtrar conversas por tipo, data, tags | P0 |
| FR-3.3 | Sistema deve exibir detalhes completos ao selecionar uma conversa | P0 |
| FR-3.4 | Sistema deve destacar insights e oportunidades na transcrição | P1 |
| FR-3.5 | Sistema deve permitir buscar dentro das transcrições | P1 |

### FR-4: Gestão de Oportunidades

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-4.1 | Sistema deve listar todas as oportunidades detectadas | P0 |
| FR-4.2 | Sistema deve vincular oportunidade à conversa de origem | P0 |
| FR-4.3 | Sistema deve permitir classificar oportunidade (produto, serviço, conteúdo, outro) | P0 |
| FR-4.4 | Sistema deve permitir marcar status (nova, em análise, descartada, implementada) | P0 |
| FR-4.5 | Sistema deve mostrar conexões entre oportunidades similares | P1 |

### FR-5: Sugestões de Conteúdo

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-5.1 | Sistema deve listar sugestões de conteúdo geradas pela IA | P1 |
| FR-5.2 | Sistema deve vincular sugestão às conversas que a originaram | P1 |
| FR-5.3 | Sistema deve classificar tipo de conteúdo (post, artigo, vídeo, curso) | P1 |
| FR-5.4 | Sistema deve permitir aprovar/rejeitar sugestões | P1 |

### FR-6: Clone — consulta à base **[IMPLEMENTADO]**

> Substitui o requisito original de "Exportação para Clone". O Clone deixou de ser sistema
> externo alimentado por export; virou chat interno sobre a própria base.

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-6.1 | Sistema deve responder perguntas em linguagem natural sobre a base | P1 |
| FR-6.2 | Sistema deve usar conversas, oportunidades, conteúdos e perfil como contexto | P1 |
| FR-6.3 | Sistema deve transmitir a resposta em streaming | P1 |
| FR-6.4 | Sistema deve respeitar orçamento de tokens antes de chamar o modelo | P1 |
| FR-6.5 | Sistema deve permitir exportar dados em formato estruturado (`/api/export`) | P2 |

### FR-7: Cross-Conversation Intelligence (Diferencial)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-7.1 | Sistema deve detectar padrões recorrentes entre conversas | P0 |
| FR-7.2 | Sistema deve identificar temas mencionados múltiplas vezes | P0 |
| FR-7.3 | Sistema deve sugerir conexões não-óbvias entre conversas diferentes | P0 |
| FR-7.4 | Sistema deve gerar "insight cruzado" combinando informações de múltiplas fontes | P0 |
| FR-7.5 | Sistema deve exibir "Você sabia?" com conexões descobertas | P1 |

---

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requisito | Métrica |
|----|-----------|---------|
| NFR-1.1 | Processamento de transcrição de 1h em menos de 2 minutos | < 120s |
| NFR-1.2 | Interface responsiva com feedback em menos de 200ms | < 200ms |
| NFR-1.3 | Lista de conversas deve carregar em menos de 1 segundo | < 1s |

### NFR-2: Usabilidade

| ID | Requisito |
|----|-----------|
| NFR-2.1 | Interface intuitiva que não requer treinamento |
| NFR-2.2 | Feedback visual claro durante processamento |
| NFR-2.3 | Estados de erro amigáveis com orientação para resolução |
| NFR-2.4 | Design responsivo (desktop first, mas funcional em tablet) |

### NFR-3: Segurança

| ID | Requisito |
|----|-----------|
| NFR-3.1 | Dados armazenados com criptografia em repouso |
| NFR-3.2 | Conexões via HTTPS apenas |
| NFR-3.3 | API keys de IA armazenadas de forma segura (env vars) |
| NFR-3.4 | Uso pessoal - sem necessidade de autenticação complexa no MVP |

### NFR-4: Manutenibilidade

| ID | Requisito |
|----|-----------|
| NFR-4.1 | Código TypeScript com tipos estritamente definidos |
| NFR-4.2 | Componentes reutilizáveis seguindo padrão existente |
| NFR-4.3 | Separação clara entre UI, lógica de negócio e acesso a dados |

---

## UX Principles

### Princípio 1: Simplicidade Operacional
- Upload de uma transcrição deve levar menos de 3 cliques
- Insights devem ser visíveis imediatamente após processamento
- Navegação intuitiva entre conversas, oportunidades e conteúdos

### Princípio 2: Descoberta Passiva
- Conexões e padrões devem aparecer automaticamente
- Usuário não precisa "buscar" insights - eles são apresentados
- Destaques visuais chamam atenção para descobertas importantes

### Princípio 3: Contexto Preservado
- Sempre mostrar de onde veio cada insight
- Links diretos para conversa de origem
- Timeline visual de quando informações foram capturadas

### Princípio 4: Ação Facilitada
- De insight para ação em poucos cliques
- Exportação rápida para Clone
- Status tracking claro (novo → em análise → implementado)

---

## Technical Architecture

### Stack Tecnológica **[IMPLEMENTADO]**

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, TypeScript | UI e API no mesmo projeto |
| **Styling** | Tailwind CSS v4, shadcn/ui | — |
| **State** | Zustand (local), SWR (dados) | — |
| **Backend** | Next.js API Routes | Simplicidade, mesmo stack |
| **IA — análise** | Azure OpenAI via AI SDK | `generateObject` com schema Zod garante saída estruturada |
| **IA — clone** | Anthropic Claude via AI SDK | Streaming de chat sobre a base |
| **Database** | Supabase Postgres + Drizzle ORM | Compartilhado com os agentes n8n |
| **Auth** | Supabase Auth (email/senha) | Sessão validada no middleware a cada request |
| **Ingestão** | API do Plaud | Varredura completa, idempotente |
| **Automação** | n8n (webhooks) | Embeddings e agentes, fora deste app |
| **Deploy** | Docker → Google Cloud Run | Escala a zero; secrets no Secret Manager |

> A decisão original de SQLite/libSQL (Turso) foi revertida: o banco migrou para Supabase
> Postgres, porque os agentes n8n precisam operar sobre os mesmos dados.

### Decisões de arquitetura não-óbvias **[IMPLEMENTADO]**

**`conversations` é uma VIEW, não uma tabela.** Projeta `meetings` + `summaries` com triggers
`INSTEAD OF`. Consequência: **`.returning()` não funciona** — o Postgres não suporta em views
com `INSTEAD OF`. Use fetch-after-write.

**O token do Plaud vive no banco (`app_plaud_tokens`), não em variável de ambiente.** O Plaud
rotaciona o refresh token a cada uso (validade 24h); qualquer cópia estática — env, arquivo,
Secret Manager — invalida no primeiro refresh feito por outra instância. Com Cloud Run em
`min-instances=0`, o estado precisa ser central. O refresh roda sob `SELECT ... FOR UPDATE`
para que instâncias concorrentes não invalidem o token uma da outra. Ver ADR-0001.

**Agrupamento por tema é cacheado** em `app_business_themes`. Sem cache, abrir "Novos
Negócios" consumiria cota da Azure a cada visita.

**Prioridade da oportunidade vive em `app_opportunities`**, não na tabela de temas, para
sobreviver a um reagrupamento.

**O ambiente local roda em container.** `next dev` não reproduz o runtime de produção — um bug
de autenticação (`UntrustedHost`) só apareceu no build standalone, depois de já estar no ar.

### Modelo de Dados **[IMPLEMENTADO]**

15 tabelas. `conversations` é uma VIEW; as tabelas de domínio da app usam prefixo `app_`.

| Tabela | Papel |
|---|---|
| `conversations` (view sobre `meetings` + `summaries`) | Gravação ingerida: transcrição, resumo, participantes, data |
| `app_opportunities` | Oportunidade detectada: dor, contexto, score, tipo, subtipo, status, prioridade |
| `app_opportunity_sources` | Evidências: as conversas que originaram a oportunidade, com o trecho justificador |
| `app_business_themes` | Tema que agrupa ofertas iguais escritas com títulos diferentes |
| `app_business_theme_members` | Vínculo oportunidade → tema (um tema por oportunidade) |
| `app_contents` | Pauta ou artigo completo, com rascunho gerado |
| `app_content_sources` | Evidências da pauta |
| `app_projects` · `app_project_columns` · `app_project_tasks` | Quadro de tarefas por oportunidade |
| `app_idea_enrichment` · `app_idea_enrichment_reference` | Enriquecimento de ideias com material de referência |
| `app_user_profile` | Perfil do usuário |
| `app_plaud_tokens` | Token set do Plaud (linha única `id='default'`) — ver ADR-0001 |
| `app_ingest_runs` | Log de execuções da ingestão |

```typescript
// Oportunidade — campos que carregam a semântica do produto
interface Opportunity {
  id: string;
  conversationId: string | null;  // fonte primária; a lista completa vive em sources
  title: string;
  pain: string;                   // a dor identificada — obrigatória
  context: string | null;
  score: number;                  // confiança da qualificação
  type: 'treinamento' | 'consultoria' | 'sistema';
  subtype: string | null;         // livre, sugerido pela IA: "Treinamento NR-35"
  generatedIdea: string | null;   // proposta redigida pela IA, cacheada
  status: string;                 // default 'nova'
  priority: 'alta' | 'media' | 'baixa' | null;  // marcada à mão; null = não priorizado
  notes: string | null;
  tags: string | null;
  createdAt: Date;
}
```

> **Taxonomia de tipo.** Fechada em `treinamento` (cursos/capacitações), `consultoria`
> (projetos/diagnósticos/assessoria) e `sistema` (software/produto digital). Os tipos
> `produto` e `servico` do PRD original existem apenas em linhas legadas.

### API Routes **[IMPLEMENTADO]**

43 rotas. As principais, por domínio:

| Domínio | Rotas | Papel |
|---|---|---|
| **Ingestão Plaud** | `/api/plaud/ingest` · `/ingest/status` · `/sync` · `/files` · `/files/[id]` · `/analyze` | Varredura (cron autenticado por `INGEST_CRON_SECRET` ou botão da UI), status e análise |
| **Conversas** | `/api/conversations` · `/[id]` · `/[id]/opportunities` · `/upload` | Listagem, detalhe, oportunidades geradas |
| **Oportunidades** | `/api/opportunities` · `/[id]` · `/[id]/sources` · `/analyze` · `/themes` · `/idea` | CRUD, evidências, análise em lote, agrupamento por tema, ideia gerada |
| **Conteúdos** | `/api/contents` · `/[id]` · `/[id]/draft` · `/[id]/sources` · `/analyze` | Pauta, rascunho integral, evidências |
| **Projetos** | `/api/projects` · `/[id]` · `/[id]/columns` · `/[id]/generate` · `/[id]/tasks` · `/api/tasks/[id]` · `/api/columns/[id]` | Quadro de tarefas com geração por IA |
| **Enriquecimento** | `/api/enrichment` · `/interesting` · `/reference` · `/upload` | Assuntos de interesse e material de referência |
| **Clone** | `/api/clone/chat` | Chat com streaming sobre a base |
| **Drive** | `/api/drive/files` · `/folders` · `/import` | Importação alternativa |
| **Outros** | `/api/dashboard` · `/api/profile` · `/api/export` · `/api/process` · `/api/n8n/status` · `/api/auth/[...nextauth]` | — |

Todas exigem sessão, exceto `/api/plaud/ingest` com o header `x-ingest-secret` correto
(usado pelo cron) e as rotas de autenticação.

---

## Risks & Mitigations

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| **Qualidade da IA** - Insights gerados não são úteis | Alto | Médio | Iterar prompts, testar com dados reais, permitir feedback |
| **Custo de API** - Processamento de muitas transcrições fica caro | Médio | Médio | Usar modelos mais baratos para tarefas simples, cache de resultados |
| **Formato Plaud** - Formato de exportação muda | Baixo | Baixo | Abstrair parser, documentar formato esperado |
| **Escopo creep** - Adicionar features demais no MVP | Alto | Alto | Seguir prioridades P0 rigorosamente, revisar antes de implementar |

---

## Assumptions

1. **Plaud AI exporta transcrições** em formato texto ou JSON acessível
2. **Usuária única** - Sistema pessoal para Andresa, sem multi-tenancy
3. **Volume baixo** - Dezenas de conversas por mês, não milhares
4. **Clone tem formato de input** - Existe uma forma de alimentar o Clone externo
5. **Conexão à internet** - Necessária para processamento IA (APIs externas)

---

## Open Questions

| # | Pergunta | Impacto | Status |
|---|----------|---------|--------|
| 1 | Qual o formato exato de exportação do Plaud? | Define parser de ingestão | **Resolvido** — API REST (`/open/third-party/files/`), cliente em `lib/plaud/client.ts` |
| 2 | Clone externo aceita que formato de input? | Define formato de export | **Descartada** — o Clone virou chat interno sobre a base, não sistema externo |
| 3 | Qual provedor de IA usar (OpenAI vs Claude)? | Custo e qualidade | **Resolvido** — Azure OpenAI para análise estruturada, Claude para o chat do Clone |
| 4 | Onde hospedar o app? (Vercel, self-hosted) | Custo e complexidade | **Resolvido** — Google Cloud Run, container, escala a zero |
| 5 | Como paginar/limitar o universo da análise em lote? | Custo de IA e representatividade | Aberta — hoje: 50 conversas mais recentes, com filtro opcional de período |
| 6 | Qual gatilho promove padrão observado a oportunidade real? | Precisão da qualificação | Aberta — critério vive no prompt, não em regra explícita |

---

## Appendix

### A. Contexto de evolução

O PRD original (v1.0/v1.1, dez/2025) descrevia um protótipo frontend com páginas
placeholder. O sistema evoluiu além daquele escopo e está em produção. As divergências
relevantes entre o planejado e o construído:

| Planejado (v1.1) | Construído |
|---|---|
| Upload manual de transcrição | Varredura automática e idempotente da API do Plaud |
| SQLite (MVP) → PostgreSQL | Supabase Postgres desde o início da fase atual, compartilhado com n8n |
| Export para Clone externo | Clone como chat interno sobre a base |
| Tipos `produto`/`servico` | Taxonomia `treinamento`/`consultoria`/`sistema` com subtipo livre |
| Hospedagem a decidir | Google Cloud Run, container, escala a zero |
| Páginas placeholder | 11 páginas funcionais |

Referência: [Documentação do Projeto](./index.md) · [README](../README.md) · [ADR-0001](./adr/0001-tokens-plaud-persistidos-no-banco.md)

### B. Related Documents

| Documento | Descrição |
|-----------|-----------|
| [Architecture](./architecture.md) | Arquitetura atual do frontend |
| [Component Inventory](./component-inventory.md) | Componentes existentes |
| [Data Models](./data-models.md) | Tipos TypeScript atuais |
| [Development Guide](./development-guide.md) | Guia de desenvolvimento |

---

## Document History

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2025-11-28 | Wesley | Versão inicial - Discovery e estrutura |
| 1.1 | 2025-12-01 | PM Agent | Escopo MVP, requisitos funcionais/não-funcionais, arquitetura |
| 1.2 | 2026-09-02 | Claude | Alinhamento com o sistema em produção: stack real (Supabase Postgres, Azure OpenAI, Cloud Run) no lugar de SQLite/indefinidos; taxonomia de oportunidade (`treinamento`/`consultoria`/`sistema`); ingestão automática no lugar de upload manual; Clone como chat interno; modelo de dados com as 15 tabelas; 43 rotas de API; decisões de arquitetura não-óbvias; questões 1–4 fechadas, 5–6 abertas |

---

*PRD gerado pelo workflow BMad Method - /bmad:bmm:workflows:prd*
