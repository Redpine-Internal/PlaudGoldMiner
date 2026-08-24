# Andresa AI - Epic Breakdown

**Author:** Wesley
**Date:** 2025-12-01
**Project Level:** Low Complexity
**Target Scale:** Personal Use (Single User)

---

## Overview

Este documento fornece a decomposição completa de épicos e stories para o Andresa AI, transformando os requisitos do [PRD](./prd.md) em stories implementáveis.

**Living Document Notice:** Esta é a versão inicial. Será atualizada após os workflows de UX Design e Architecture adicionarem detalhes de interação e técnicos às stories.

### Resumo de Épicos

| Épico | Nome | Stories | Prioridade | Valor Entregue |
|-------|------|---------|------------|----------------|
| 1 | Foundation & Backend Core | 3 | P0 | Base técnica para o MVP |
| 2 | Ingestão de Transcrições | 5 | P0 | Upload e processamento funcionais |
| 3 | Visualização de Conversas | 4 | P0 | Ver e navegar conversas |
| 4 | Gestão de Oportunidades | 4 | P0 | Gerenciar oportunidades detectadas |
| 5 | Cross-Conversation Intelligence | 4 | P0 | **DIFERENCIAL** - Insights que conectam conversas |
| 6 | Conteúdos & Exportação | 3 | P1 | Sugestões de conteúdo + Export para Clone |

**Total: 6 Épicos, 23 Stories, 35 FRs cobertos**

---

## Inventário de Requisitos Funcionais

### FR-1: Ingestão de Transcrições (7 FRs)
- FR-1.1: Upload de arquivos .txt e .json (P0)
- FR-1.2: Validação de formato (P0)
- FR-1.3: Extração de metadados (P0)
- FR-1.4: Progresso de upload/processamento (P0)
- FR-1.5: Tags/tipo de conversa (P1)
- FR-1.6: Importar do Google Drive (P0)
- FR-1.7: Autenticação Google OAuth (P0)

### FR-2: Processamento IA (7 FRs)
- FR-2.1: Resumo estruturado (P0)
- FR-2.2: Extração de tópicos (P0)
- FR-2.3: Identificação de participantes (P0)
- FR-2.4: Detecção de oportunidades (P0)
- FR-2.5: Identificação de problemas/dores (P0)
- FR-2.6: Conexão com conversas anteriores (P0)
- FR-2.7: Sugestões de conteúdo (P1)

### FR-3: Visualização de Conversas (5 FRs)
- FR-3.1: Lista com cards resumidos (P0)
- FR-3.2: Filtros por tipo, data, tags (P0)
- FR-3.3: Detalhes completos (P0)
- FR-3.4: Destaque de insights (P1)
- FR-3.5: Busca em transcrições (P1)

### FR-4: Gestão de Oportunidades (5 FRs)
- FR-4.1: Lista de oportunidades (P0)
- FR-4.2: Vínculo com conversa origem (P0)
- FR-4.3: Classificação de tipo (P0)
- FR-4.4: Status de oportunidade (P0)
- FR-4.5: Conexões entre oportunidades (P1)

### FR-5: Sugestões de Conteúdo (4 FRs)
- FR-5.1: Lista de sugestões (P1)
- FR-5.2: Vínculo com conversas (P1)
- FR-5.3: Classificação de tipo (P1)
- FR-5.4: Aprovar/rejeitar (P1)

### FR-6: Exportação para Clone (3 FRs)
- FR-6.1: Exportar JSON (P1)
- FR-6.2: Incluir contexto/metadados (P1)
- FR-6.3: Seleção do que exportar (P1)

### FR-7: Cross-Conversation Intelligence (5 FRs)
- FR-7.1: Detectar padrões recorrentes (P0)
- FR-7.2: Identificar temas múltiplos (P0)
- FR-7.3: Sugerir conexões não-óbvias (P0)
- FR-7.4: Gerar insight cruzado (P0)
- FR-7.5: Exibir "Você sabia?" (P1)

---

## Mapa de Cobertura FR → Épicos

| Épico | FRs Cobertos |
|-------|--------------|
| Epic 1 (Foundation) | Infraestrutura para todos os FRs |
| Epic 2 (Ingestão) | FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-1.6, FR-1.7, FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-2.5 |
| Epic 3 (Conversas) | FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-3.5 |
| Epic 4 (Oportunidades) | FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-4.5 |
| Epic 5 (Cross-Intelligence) | FR-2.6, FR-7.1, FR-7.2, FR-7.3, FR-7.4, FR-7.5 |
| Epic 6 (Conteúdos & Export) | FR-2.7, FR-5.1, FR-5.2, FR-5.3, FR-5.4, FR-6.1, FR-6.2, FR-6.3 |

**✅ Todos os 35 FRs cobertos!**

---

## Epic 1: Foundation & Backend Core

**Valor:** Estabelecer a base técnica para o MVP (exceção válida: primeiro épico de projeto brownfield)

### Story 1.1: Setup do Banco de Dados

As a desenvolvedor,
I want configurar o SQLite com schema inicial,
So that os dados possam ser persistidos.

**Acceptance Criteria:**

**Given** o projeto Next.js existente
**When** eu executo o setup do banco
**Then** as tabelas conversations, opportunities, content_suggestions, cross_insights são criadas
**And** o arquivo do banco é criado em /data/andresa.db
**And** migrations estão configuradas para versionamento

**Prerequisites:** Nenhum

**Technical Notes:**
- Usar better-sqlite3 ou Drizzle ORM
- Schema baseado nas interfaces do PRD (Conversation, Opportunity, ContentSuggestion, CrossInsight)
- Migrations para versionamento do schema
- Seed com dados de exemplo para desenvolvimento

---

### Story 1.2: API Routes Base

As a desenvolvedor,
I want criar as API routes estruturais,
So that o frontend possa se comunicar com o backend.

**Acceptance Criteria:**

**Given** as rotas definidas no PRD
**When** eu acesso qualquer rota da API
**Then** recebo resposta JSON válida com estrutura correta
**And** rotas implementadas:
  - GET /api/conversations
  - POST /api/conversations
  - GET /api/conversations/[id]
  - GET /api/opportunities
  - PATCH /api/opportunities/[id]
  - GET /api/content-suggestions
  - POST /api/export
  - GET /api/insights/cross

**Prerequisites:** Story 1.1

**Technical Notes:**
- Next.js API Routes (app/api/...)
- Validação de input com Zod
- Error handling padronizado
- Tipos TypeScript compartilhados entre frontend e backend

---

### Story 1.3: Integração com IA

As a desenvolvedor,
I want configurar a integração com OpenAI/Claude,
So that transcrições possam ser processadas.

**Acceptance Criteria:**

**Given** uma API key válida em .env
**When** eu chamo o serviço de IA com texto de transcrição
**Then** recebo resposta estruturada contendo:
  - Resumo da conversa
  - Tópicos principais
  - Participantes identificados
  - Oportunidades detectadas
  - Problemas/dores mencionados
**And** erros de API são tratados graciosamente com retry
**And** timeout de 60 segundos para transcrições longas

**Prerequisites:** Nenhum

**Technical Notes:**
- Criar service abstrato (AIService) para trocar provider facilmente
- Rate limiting básico (10 requests/minuto)
- Retry com exponential backoff (3 tentativas)
- Streaming para feedback de progresso
- Prompts otimizados em arquivo separado (/lib/prompts.ts)

---

## Epic 2: Ingestão de Transcrições

**Valor:** Andresa consegue fazer upload e processar transcrições - primeira funcionalidade real!

### Story 2.1: Upload de Arquivos

As a Andresa,
I want fazer upload de arquivos .txt e .json,
So that minhas transcrições sejam importadas.

**Acceptance Criteria:**

**Given** estou na página de Conversas
**When** clico no botão "Nova Conversa" ou "+"
**Then** vejo um modal com área de drag-and-drop
**And** posso clicar para selecionar arquivo
**And** formatos aceitos: .txt, .json
**And** vejo erro claro se formato inválido
**And** vejo barra de progresso durante upload
**And** limite de 10MB por arquivo

**Prerequisites:** Story 1.2

**Technical Notes:**
- Componente de upload com react-dropzone
- Validação client-side de extensão e tamanho
- Preview do nome do arquivo antes de confirmar
- Skeleton loading durante processamento
- Integrar com componente Button existente do shadcn/ui

**FRs Cobertos:** FR-1.1, FR-1.2, FR-1.4

---

### Story 2.2: Processamento de Transcrição

As a Andresa,
I want que minha transcrição seja processada automaticamente,
So that eu tenha resumo e insights sem esforço.

**Acceptance Criteria:**

**Given** fiz upload de uma transcrição válida
**When** o processamento inicia
**Then** vejo indicador de progresso com etapas:
  - "Enviando arquivo..."
  - "Analisando conteúdo..."
  - "Extraindo insights..."
  - "Finalizando..."
**And** após processamento (< 2 min para 1h de conversa), vejo:
  - Resumo estruturado
  - Tópicos principais (como tags clicáveis)
  - Participantes identificados
  - Oportunidades detectadas (contador)
  - Problemas/dores mencionados
**And** a conversa aparece no topo da lista
**And** posso ver detalhes no OutputPanel

**Prerequisites:** Story 2.1, Story 1.3

**Technical Notes:**
- Processamento assíncrono com status polling ou WebSocket
- Salvar resultado no banco (Story 1.1)
- Atualizar Zustand store após sucesso
- Toast de sucesso/erro

**FRs Cobertos:** FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-2.5

---

### Story 2.3: Autenticação Google OAuth

As a Andresa,
I want conectar minha conta Google,
So that eu possa importar do Drive.

**Acceptance Criteria:**

**Given** estou no modal de upload ou página de Configurações
**When** clico em "Conectar Google Drive"
**Then** sou redirecionada para fluxo OAuth do Google
**And** vejo permissões solicitadas (apenas leitura do Drive)
**And** após autorizar, volto ao app com conexão ativa
**And** vejo indicador "Google Drive conectado ✓"
**And** posso desconectar a qualquer momento

**Prerequisites:** Nenhum

**Technical Notes:**
- next-auth com Google provider
- Escopos: drive.readonly, drive.file
- Armazenar refresh token de forma segura
- Página de callback em /api/auth/callback/google
- Estado de conexão persistido

**FRs Cobertos:** FR-1.7

---

### Story 2.4: Importar do Google Drive

As a Andresa,
I want selecionar arquivos do meu Drive,
So that eu não precise baixar e fazer upload manual.

**Acceptance Criteria:**

**Given** estou com Google conectado
**When** clico em "Importar do Drive" no modal de upload
**Then** vejo file picker integrado do Google Drive
**And** posso navegar pastas
**And** vejo apenas arquivos .txt e .json
**And** posso selecionar múltiplos arquivos
**And** arquivo selecionado é importado diretamente
**And** vejo mesmo progresso de processamento do upload manual

**Prerequisites:** Story 2.3, Story 2.2

**Technical Notes:**
- Google Picker API para UI nativa
- Download do arquivo via Drive API
- Processar igual ao upload manual
- Batch processing se múltiplos arquivos

**FRs Cobertos:** FR-1.6

---

### Story 2.5: Metadados e Tipo de Conversa

As a Andresa,
I want categorizar minhas conversas,
So that eu possa filtrar e organizar depois.

**Acceptance Criteria:**

**Given** estou fazendo upload de uma transcrição
**When** vejo o formulário de metadados (antes ou após upload)
**Then** posso:
  - Editar título da conversa (auto-gerado pela IA)
  - Selecionar tipo: reunião, treinamento, informal, outro
  - Adicionar tags customizadas (autocomplete com tags existentes)
  - Ajustar data da conversa
  - Informar duração (opcional)
**And** posso editar esses dados depois na visualização
**And** metadados são salvos junto com a conversa

**Prerequisites:** Story 2.2

**Technical Notes:**
- Formulário inline no modal ou como step do wizard
- Tags com Combobox do shadcn/ui
- Validação de campos obrigatórios (título, tipo)
- IA sugere tipo baseado no conteúdo

**FRs Cobertos:** FR-1.3, FR-1.5

---

## Epic 3: Visualização de Conversas

**Valor:** Andresa consegue ver e navegar suas conversas processadas

### Story 3.1: Lista de Conversas com Dados Reais

As a Andresa,
I want ver minhas conversas reais na lista,
So that eu possa navegar entre elas.

**Acceptance Criteria:**

**Given** tenho conversas processadas no banco
**When** acesso a página /conversas
**Then** vejo cards com dados reais (substituindo mock data)
**And** cada card mostra:
  - Título
  - Data formatada (ex: "há 2 dias")
  - Tipo (badge colorido)
  - Resumo curto (2-3 linhas, truncado)
  - Quantidade de oportunidades detectadas
**And** cards são ordenados por data (mais recente primeiro)
**And** vejo skeleton loading enquanto carrega
**And** vejo estado vazio amigável se não há conversas

**Prerequisites:** Epic 2 completo

**Technical Notes:**
- Substituir mockConversations por fetch real
- Usar SWR ou React Query para cache
- Manter componentes existentes (ConversationCard)
- Infinite scroll ou paginação para muitas conversas

**FRs Cobertos:** FR-3.1

---

### Story 3.2: Detalhes da Conversa

As a Andresa,
I want ver detalhes completos de uma conversa,
So that eu entenda o que foi discutido.

**Acceptance Criteria:**

**Given** estou na lista de conversas
**When** clico em um card de conversa
**Then** o OutputPanel (coluna direita) mostra detalhes completos:
  - Título e metadados (data, duração, tipo)
  - Resumo estruturado em seções
  - Tópicos como badges clicáveis
  - Lista de participantes
  - Preview de oportunidades detectadas (máx 3, com "ver mais")
  - Botão "Ver transcrição completa"
  - Botão "Editar metadados"
**And** transição suave entre conversas

**Prerequisites:** Story 3.1

**Technical Notes:**
- Atualizar ConversationDetails existente
- Usar Zustand para selectedConversationId
- Lazy load de transcrição completa
- Scroll to top ao trocar conversa

**FRs Cobertos:** FR-3.3

---

### Story 3.3: Filtros de Conversas

As a Andresa,
I want filtrar conversas por tipo, data e tags,
So that eu encontre o que preciso rapidamente.

**Acceptance Criteria:**

**Given** estou na lista de conversas
**When** uso os filtros disponíveis
**Then** posso filtrar por:
  - Tipo (reunião, treinamento, informal, outro) - multi-select
  - Período (hoje, esta semana, este mês, período customizado)
  - Tags (autocomplete com tags existentes)
  - Busca por texto no título/resumo
**And** filtros são combinados (AND)
**And** a lista atualiza em tempo real
**And** vejo contador de resultados
**And** posso limpar todos os filtros
**And** filtros são persistidos na URL (compartilháveis)

**Prerequisites:** Story 3.1

**Technical Notes:**
- Componente de filtros acima da lista
- Debounce na busca por texto (300ms)
- URL params para persistência
- Filtros no servidor para performance

**FRs Cobertos:** FR-3.2, FR-3.5

---

### Story 3.4: Transcrição Completa com Destaques

As a Andresa,
I want ler a transcrição completa com insights destacados,
So that eu possa revisar detalhes e entender o contexto.

**Acceptance Criteria:**

**Given** estou vendo detalhes de uma conversa
**When** clico em "Ver transcrição completa"
**Then** vejo modal ou página com transcrição integral
**And** trechos com oportunidades são destacados (background amarelo)
**And** trechos com problemas/dores são destacados (background vermelho claro)
**And** posso clicar em destaque para ver detalhes do insight
**And** posso buscar texto na transcrição (Ctrl+F)
**And** posso copiar trechos selecionados
**And** botão para voltar à lista

**Prerequisites:** Story 3.2

**Technical Notes:**
- Modal fullscreen ou página /conversas/[id]/transcricao
- Highlight com regex baseado em ranges salvos
- Tooltip ao hover em highlights
- Performance para transcrições longas (virtualização se > 10k palavras)

**FRs Cobertos:** FR-3.4

---

## Epic 4: Gestão de Oportunidades

**Valor:** Andresa consegue ver e gerenciar oportunidades de negócio detectadas

### Story 4.1: Lista de Oportunidades

As a Andresa,
I want ver todas as oportunidades detectadas,
So that eu possa avaliar cada uma.

**Acceptance Criteria:**

**Given** tenho conversas processadas com oportunidades
**When** acesso a página /oportunidades
**Then** vejo cards de oportunidades com:
  - Título
  - Descrição resumida (2-3 linhas)
  - Tipo (produto, serviço, conteúdo, outro) - badge colorido
  - Status (nova, em análise, descartada, implementada) - badge
  - Conversa de origem (link clicável)
  - Data de detecção
**And** oportunidades são ordenadas por data (mais recente primeiro)
**And** vejo filtros por tipo e status
**And** vejo estado vazio amigável se não há oportunidades

**Prerequisites:** Epic 2 completo

**Technical Notes:**
- Nova página /oportunidades (substituir placeholder)
- Componente OpportunityCard similar ao ConversationCard
- Fetch de /api/opportunities
- Badges com cores semânticas (verde=nova, azul=análise, cinza=descartada, roxo=implementada)

**FRs Cobertos:** FR-4.1, FR-4.2

---

### Story 4.2: Detalhes da Oportunidade

As a Andresa,
I want ver detalhes de uma oportunidade,
So that eu possa decidir se vale a pena.

**Acceptance Criteria:**

**Given** estou na lista de oportunidades
**When** clico em um card
**Then** o OutputPanel mostra:
  - Título e descrição completa
  - Tipo e status atuais
  - Conversa de origem (link)
  - Trecho relevante da transcrição (contexto)
  - Confidence score da IA (se disponível)
  - Oportunidades relacionadas (mesma conversa ou tema similar)
  - Data de detecção
**And** posso editar tipo e status inline

**Prerequisites:** Story 4.1

**Technical Notes:**
- Componente OpportunityDetails
- Fetch de contexto da conversa
- Link bidirecional conversa ↔ oportunidade

**FRs Cobertos:** FR-4.2, FR-4.5

---

### Story 4.3: Gerenciar Status de Oportunidade

As a Andresa,
I want mudar o status de uma oportunidade,
So that eu acompanhe meu progresso.

**Acceptance Criteria:**

**Given** estou vendo uma oportunidade
**When** clico no status atual
**Then** vejo dropdown com opções:
  - Nova (padrão)
  - Em análise
  - Descartada
  - Implementada
**And** ao selecionar, a mudança é salva imediatamente
**And** vejo toast de confirmação
**And** posso filtrar por status na lista
**And** contador no topo mostra quantas por status

**Prerequisites:** Story 4.2

**Technical Notes:**
- PATCH /api/opportunities/[id]
- Otimistic update no frontend
- Histórico de mudanças (opcional)

**FRs Cobertos:** FR-4.4

---

### Story 4.4: Classificar e Anotar Oportunidade

As a Andresa,
I want classificar e adicionar notas a uma oportunidade,
So that eu organize e enriqueça com meus pensamentos.

**Acceptance Criteria:**

**Given** estou vendo uma oportunidade
**When** edito a classificação
**Then** posso mudar tipo: produto, serviço, conteúdo, outro
**And** posso adicionar/editar notas pessoais (textarea)
**And** posso adicionar tags customizadas
**And** mudanças são salvas automaticamente (autosave)
**And** vejo indicador "Salvo" ou "Salvando..."

**Prerequisites:** Story 4.2

**Technical Notes:**
- Debounce no autosave (1s)
- Campo notes na tabela opportunities
- Tags compartilhadas com conversas

**FRs Cobertos:** FR-4.3

---

## Epic 5: Cross-Conversation Intelligence ⭐

**Valor:** O DIFERENCIAL do produto - Andresa recebe insights que conectam conversas e geram ideias inovadoras

### Story 5.1: Detecção de Padrões Recorrentes

As a Andresa,
I want que o sistema detecte padrões em minhas conversas,
So that eu veja tendências que não percebi.

**Acceptance Criteria:**

**Given** tenho 3+ conversas processadas
**When** o sistema analisa cross-conversation
**Then** detecta e lista:
  - Temas mencionados em 2+ conversas
  - Problemas recorrentes (ex: "gestão de tempo" em 4 conversas)
  - Pessoas/empresas mencionadas múltiplas vezes
**And** padrões são ordenados por frequência
**And** cada padrão mostra as conversas onde aparece
**And** análise roda automaticamente após cada novo processamento

**Prerequisites:** Epic 2 completo com múltiplas conversas

**Technical Notes:**
- Background job após processamento
- Embeddings para similaridade semântica (opcional: usar IA para agrupar)
- Threshold de 2+ menções para considerar padrão
- Tabela cross_insights para armazenar
- Invalidar cache quando nova conversa é adicionada

**FRs Cobertos:** FR-7.1, FR-7.2

---

### Story 5.2: Conexões Não-Óbvias

As a Andresa,
I want receber sugestões de conexões que eu não fiz,
So that eu tenha ideias inovadoras.

**Acceptance Criteria:**

**Given** tenho conversas sobre temas diferentes
**When** o sistema analisa conexões
**Then** sugere links não-óbvios como:
  - "Problema X (mencionado por Cliente A) + Sua expertise em Y = Oportunidade Z"
  - "Tema recorrente: 3 clientes mencionaram dificuldade com ABC"
  - "Conexão: Conversa 1 sobre produtividade + Conversa 5 sobre ferramentas"
**And** cada conexão tem:
  - Título chamativo
  - Explicação do "porquê" da conexão
  - Links para conversas relacionadas
  - Sugestão de ação
**And** conexões são ranqueadas por relevância/novidade

**Prerequisites:** Story 5.1

**Technical Notes:**
- Prompt engineering cuidadoso para conexões criativas
- Combinar análise de múltiplas conversas em um único prompt
- Ranquear por confidence score
- Evitar conexões óbvias/superficiais

**FRs Cobertos:** FR-2.6, FR-7.3

---

### Story 5.3: Geração de Insights Cruzados

As a Andresa,
I want ver insights que combinam múltiplas fontes,
So that eu tenha o "momento eureka".

**Acceptance Criteria:**

**Given** existem conexões e padrões detectados
**When** acesso a seção de Insights (no Dashboard ou página dedicada)
**Then** vejo cards de "Insight Cruzado" com:
  - Título chamativo (ex: "💡 Nova oportunidade de produto!")
  - Descrição do insight
  - Conversas que contribuíram (links)
  - Ação sugerida (ex: "Criar curso sobre X")
  - Data de geração
**And** posso marcar como:
  - "Útil" (fica destacado)
  - "Ignorar" (some da lista principal)
  - "Implementado" (move para histórico)
**And** insights novos têm badge "Novo"

**Prerequisites:** Story 5.2

**Technical Notes:**
- Componente InsightCard com visual diferenciado
- Animação sutil para destacar novos insights
- Persistir feedback para melhorar futuras sugestões
- GET /api/insights/cross

**FRs Cobertos:** FR-7.4

---

### Story 5.4: "Você Sabia?" no Dashboard

As a Andresa,
I want ver descobertas interessantes no Dashboard,
So that insights me surpreendam ao abrir o app.

**Acceptance Criteria:**

**Given** tenho insights cruzados gerados
**When** acesso o Dashboard (/)
**Then** vejo seção destacada "💡 Você Sabia?" com:
  - 1-3 insights mais recentes ou relevantes
  - Design que chama atenção (card com borda colorida ou ícone)
  - Preview curto do insight
  - Click leva para detalhes completos
**And** se não há insights, mostra dica para adicionar mais conversas
**And** insights rotacionam/atualizam conforme novos são gerados
**And** posso "dispensar" um insight do dashboard

**Prerequisites:** Story 5.3

**Technical Notes:**
- Seção no Dashboard (página /)
- Query para insights mais relevantes não-vistos
- Local storage para track de vistos/dispensados
- Refresh ao adicionar nova conversa

**FRs Cobertos:** FR-7.5

---

## Epic 6: Conteúdos & Exportação

**Valor:** Andresa pode transformar insights em ação - criar conteúdos e alimentar o Clone

### Story 6.1: Lista de Sugestões de Conteúdo

As a Andresa,
I want ver sugestões de conteúdo geradas pela IA,
So that eu tenha ideias do que criar.

**Acceptance Criteria:**

**Given** tenho conversas processadas com sugestões de conteúdo
**When** acesso a página /conteudos
**Then** vejo cards de sugestões com:
  - Título do conteúdo sugerido
  - Tipo (post, artigo, vídeo, curso) - badge
  - Descrição/outline do conteúdo
  - Conversas que inspiraram (links)
  - Status (sugerido, aprovado, rejeitado, criado)
**And** posso filtrar por tipo e status
**And** sugestões são ordenadas por relevância/data
**And** vejo estado vazio se não há sugestões

**Prerequisites:** Epic 2 com FR-2.7 implementado

**Technical Notes:**
- Nova página /conteudos (substituir placeholder)
- Componente ContentSuggestionCard
- Fetch de /api/content-suggestions
- Outline em formato estruturado (bullets)

**FRs Cobertos:** FR-5.1, FR-5.2, FR-5.3

---

### Story 6.2: Gerenciar Sugestões de Conteúdo

As a Andresa,
I want aprovar, rejeitar ou marcar sugestões como criadas,
So that eu mantenha só o que interessa e acompanhe progresso.

**Acceptance Criteria:**

**Given** estou vendo uma sugestão de conteúdo
**When** interajo com ela
**Then** posso:
  - Aprovar (move para lista de "A criar")
  - Rejeitar (some da lista principal, vai para "Rejeitados")
  - Marcar como "Criado" (move para histórico com link opcional)
**And** posso adicionar notas pessoais
**And** posso editar o outline sugerido
**And** sugestões rejeitadas podem ser recuperadas
**And** vejo contadores por status

**Prerequisites:** Story 6.1

**Technical Notes:**
- Ações inline no card ou no OutputPanel
- PATCH /api/content-suggestions/[id]
- Soft delete para rejeitados
- Campo para link do conteúdo criado

**FRs Cobertos:** FR-5.4

---

### Story 6.3: Exportar para Clone

As a Andresa,
I want exportar dados para alimentar meu Clone,
So that ele aprenda com minhas conversas e insights.

**Acceptance Criteria:**

**Given** tenho dados processados (conversas, insights, oportunidades)
**When** acesso a função de exportação (página Clone ou Configurações)
**Then** vejo wizard de exportação com:
  - Seleção do que exportar:
    - [ ] Conversas (com/sem transcrição completa)
    - [ ] Resumos e tópicos
    - [ ] Oportunidades (por status)
    - [ ] Insights cruzados
    - [ ] Sugestões de conteúdo aprovadas
  - Filtro por período (opcional)
  - Preview da quantidade de itens
**And** ao confirmar, recebo arquivo JSON estruturado
**And** formato é documentado (link para docs)
**And** posso copiar para clipboard ou baixar arquivo

**Prerequisites:** Épicos 1-5

**Technical Notes:**
- Página /clone ou modal em Configurações
- POST /api/export com opções
- Formato JSON com schema documentado
- Opção de exportação incremental (desde última export)

**FRs Cobertos:** FR-6.1, FR-6.2, FR-6.3

---

## FR Coverage Matrix

| FR | Descrição | Epic | Story |
|----|-----------|------|-------|
| FR-1.1 | Upload .txt/.json | 2 | 2.1 |
| FR-1.2 | Validação de formato | 2 | 2.1 |
| FR-1.3 | Extração de metadados | 2 | 2.5 |
| FR-1.4 | Progresso de upload | 2 | 2.1 |
| FR-1.5 | Tags/tipo de conversa | 2 | 2.5 |
| FR-1.6 | Importar do Google Drive | 2 | 2.4 |
| FR-1.7 | Google OAuth | 2 | 2.3 |
| FR-2.1 | Resumo estruturado | 2 | 2.2 |
| FR-2.2 | Extração de tópicos | 2 | 2.2 |
| FR-2.3 | Identificação de participantes | 2 | 2.2 |
| FR-2.4 | Detecção de oportunidades | 2 | 2.2 |
| FR-2.5 | Identificação de problemas | 2 | 2.2 |
| FR-2.6 | Conexão com conversas anteriores | 5 | 5.2 |
| FR-2.7 | Sugestões de conteúdo | 6 | 6.1 |
| FR-3.1 | Lista com cards | 3 | 3.1 |
| FR-3.2 | Filtros | 3 | 3.3 |
| FR-3.3 | Detalhes completos | 3 | 3.2 |
| FR-3.4 | Destaque de insights | 3 | 3.4 |
| FR-3.5 | Busca em transcrições | 3 | 3.3 |
| FR-4.1 | Lista de oportunidades | 4 | 4.1 |
| FR-4.2 | Vínculo com conversa | 4 | 4.1, 4.2 |
| FR-4.3 | Classificação de tipo | 4 | 4.4 |
| FR-4.4 | Status de oportunidade | 4 | 4.3 |
| FR-4.5 | Conexões entre oportunidades | 4 | 4.2 |
| FR-5.1 | Lista de sugestões | 6 | 6.1 |
| FR-5.2 | Vínculo com conversas | 6 | 6.1 |
| FR-5.3 | Classificação de tipo | 6 | 6.1 |
| FR-5.4 | Aprovar/rejeitar | 6 | 6.2 |
| FR-6.1 | Exportar JSON | 6 | 6.3 |
| FR-6.2 | Incluir contexto | 6 | 6.3 |
| FR-6.3 | Seleção do que exportar | 6 | 6.3 |
| FR-7.1 | Detectar padrões | 5 | 5.1 |
| FR-7.2 | Identificar temas múltiplos | 5 | 5.1 |
| FR-7.3 | Conexões não-óbvias | 5 | 5.2 |
| FR-7.4 | Insight cruzado | 5 | 5.3 |
| FR-7.5 | "Você sabia?" | 5 | 5.4 |

**✅ 35/35 FRs cobertos (100%)**

---

## Summary

Este documento define a estrutura completa de épicos e stories para o MVP do Andresa AI:

- **6 Épicos** organizados por valor entregue ao usuário
- **23 Stories** bite-sized, implementáveis em sessões focadas
- **35 FRs** do PRD completamente cobertos
- **Sequenciamento lógico** sem dependências circulares

### Ordem de Implementação Sugerida

1. **Epic 1** → Base técnica (DB, API, IA)
2. **Epic 2** → Upload e processamento (primeira funcionalidade real!)
3. **Epic 3** → Visualização (conectar frontend existente)
4. **Epic 4** → Oportunidades (gestão)
5. **Epic 5** → Cross-Intelligence ⭐ (o diferencial!)
6. **Epic 6** → Conteúdos e Export (P1, pode ser pós-MVP)

### Próximos Passos

1. **UX Design** (opcional) - Detalhar wireframes e interações
2. **Architecture** (recomendado) - Decisões técnicas detalhadas
3. **Sprint Planning** - Planejar sprints com stories selecionadas
4. **Implementation** - Começar pelo Epic 1!

---

_Epic breakdown gerado pelo workflow BMad Method - /bmad:bmm:workflows:create-epics-and-stories_
_Data: 2025-12-01_
