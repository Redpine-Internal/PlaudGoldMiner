# Andresa AI - Product Requirements Document

**Author:** Wesley
**Date:** 2025-11-28
**Version:** 1.0

---

## Executive Summary

**Andresa AI** é uma plataforma pessoal de gestão de conversas e insights que processa reuniões e interações da Andresa para extrair oportunidades de negócio, sugestões de conteúdo e alimentar uma base de conhecimento personalizada ("Clone").

A plataforma captura conversas (reuniões, treinamentos, conversas informais), processa via IA para extrair insights estruturados, e mais importante - **conecta pontos entre diferentes conversas** para gerar ideias inovadoras que a usuária não teria sozinha.

### O que Torna Este Produto Especial

A IA vai além da simples transcrição e organização. Ela:
- **Detecta padrões** across múltiplas conversas ao longo do tempo
- **Conecta problemas** mencionados com a expertise da Andresa
- **Sugere ideias inovadoras** combinando insights de fontes diferentes
- **Aprende continuamente** através do Clone, refinando sugestões com base no conhecimento acumulado

Exemplo: "Você mencionou dificuldade com gestão de projetos em 3 reuniões diferentes. Combinando isso com sua expertise em produtividade, você poderia criar um sistema de gestão simplificado."

---

## Project Classification

**Technical Type:** Web App (SPA)
**Domain:** General (Produtividade/IA Pessoal)
**Complexity:** Low

Este é um projeto brownfield com protótipo frontend já implementado:
- Layout de 3 colunas funcional
- Página de Conversas com lista e detalhes
- Componentes reutilizáveis (Badges, Cards, Skeletons)
- 4 páginas ainda como placeholders (Dashboard, Oportunidades, Conteúdos, Clone, Configurações)

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

### Fontes de Dados
- **Plaud AI:** Dispositivo de gravação que processa áudio e gera transcrições. É a fonte primária de dados para o sistema.
- **Google Drive:** Fonte secundária/fallback para transcrições. Permite importar arquivos de texto armazenados no Drive.

### Sistemas Externos
- **Clone (externo):** Base de conhecimento personalizada que será alimentada pela Andresa AI. O Clone aprende com as conversas processadas e refina suas capacidades ao longo do tempo.

### Fluxo de Dados
```
┌─────────────┐
│  Plaud AI   │──────┐
│ (primário)  │      │     ┌──────────────────┐     ┌─────────────┐
└─────────────┘      ├────▶│   Andresa AI     │────▶│ Clone       │
┌─────────────┐      │     │   (processa +    │     │ (aprende +  │
│Google Drive │──────┘     │   extrai)        │     │ refina)     │
│ (fallback)  │            └──────────────────┘     └─────────────┘
└─────────────┘
```

---

## Scope Definition

### 📦 MVP Scope (Mínimo Viável)

O MVP foca em entregar valor imediato com o mínimo de complexidade técnica.

| Área | Funcionalidade | Prioridade | Descrição |
|------|----------------|------------|-----------|
| **Ingestão** | Upload manual de transcrições | P0 | Aceitar arquivos txt/json do Plaud AI |
| **Ingestão** | Importar do Google Drive | P0 | Fallback para buscar transcrições no Drive |
| **Processamento** | Extração de insights via IA | P0 | Usar OpenAI/Claude para analisar transcrições |
| **Conversas** | Lista e detalhes | P0 | Visualizar todas as conversas processadas (já existe frontend) |
| **Oportunidades** | Detecção automática | P0 | IA identifica oportunidades de negócio nas conversas |
| **Conexões** | Cross-conversation insights | P0 | IA conecta pontos entre múltiplas conversas |
| **Conteúdos** | Sugestões de conteúdo | P1 | Gerar ideias de conteúdo baseadas nos insights |
| **Clone Export** | Exportar para Clone | P1 | Formato estruturado para alimentar Clone externo |

#### MVP User Flow
```
Fluxo Principal (Plaud AI):
1. Andresa grava reunião com Plaud AI
2. Plaud processa e gera transcrição
3. Andresa abre Andresa AI e faz upload da transcrição
4. Sistema processa via IA e extrai insights
5. Andresa revisa insights e exporta para Clone

Fluxo Alternativo (Google Drive):
1. Andresa tem transcrição salva no Google Drive
2. Andresa abre Andresa AI e conecta ao Drive (OAuth)
3. Andresa seleciona arquivo do Drive para importar
4. Sistema processa via IA e extrai insights
5. Andresa revisa insights e exporta para Clone
```

### 🚀 Growth Scope (Pós-MVP)

| Área | Funcionalidade | Descrição |
|------|----------------|-----------|
| **Ingestão** | Integração automática Plaud API | Sincronização automática de novas gravações |
| **Dashboard** | Métricas e visualizações | Overview de insights, tendências, padrões |
| **Clone** | Integração bidirecional | Consultar e atualizar Clone via API |
| **Configurações** | Preferências de IA | Customizar tipos de insights desejados |
| **Busca** | Busca semântica | Encontrar informações em conversas passadas |

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

### FR-6: Exportação para Clone

| ID | Requisito | Prioridade |
|----|-----------|------------|
| FR-6.1 | Sistema deve permitir exportar dados em formato estruturado (JSON) | P1 |
| FR-6.2 | Sistema deve incluir contexto e metadados na exportação | P1 |
| FR-6.3 | Sistema deve permitir selecionar o que exportar (conversas, insights, oportunidades) | P1 |

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

### Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| **Frontend** | Next.js 16, React 19, TypeScript | Já implementado no protótipo |
| **Styling** | Tailwind CSS v4, shadcn/ui | Já implementado no protótipo |
| **State** | Zustand | Já implementado no protótipo |
| **Backend** | Next.js API Routes | Simplicidade, mesmo stack |
| **IA** | OpenAI GPT-4 ou Claude | APIs maduras, qualidade de output |
| **Database** | SQLite (MVP) → PostgreSQL | Simplicidade inicial, escalável depois |
| **Storage** | Local filesystem (MVP) | Dados pessoais, baixo volume |

### Estrutura de Dados

```typescript
// Conversa processada
interface Conversation {
  id: string;
  title: string;
  type: 'reuniao' | 'treinamento' | 'informal' | 'outro';
  date: Date;
  duration?: number;
  participants: string[];
  transcription: string;
  summary: string;
  topics: string[];
  tags: string[];
  createdAt: Date;
  processedAt: Date;
}

// Oportunidade detectada
interface Opportunity {
  id: string;
  title: string;
  description: string;
  type: 'produto' | 'servico' | 'conteudo' | 'outro';
  status: 'nova' | 'analise' | 'descartada' | 'implementada';
  sourceConversationIds: string[];
  confidence: number; // 0-1
  createdAt: Date;
}

// Sugestão de conteúdo
interface ContentSuggestion {
  id: string;
  title: string;
  description: string;
  type: 'post' | 'artigo' | 'video' | 'curso';
  status: 'sugerido' | 'aprovado' | 'rejeitado' | 'criado';
  sourceConversationIds: string[];
  createdAt: Date;
}

// Conexão cross-conversation
interface CrossInsight {
  id: string;
  title: string;
  description: string;
  conversationIds: string[];
  pattern: string; // descrição do padrão detectado
  createdAt: Date;
}
```

### API Routes (MVP)

| Route | Method | Descrição |
|-------|--------|-----------|
| `/api/conversations` | GET | Listar conversas |
| `/api/conversations` | POST | Upload e processar nova conversa |
| `/api/conversations/[id]` | GET | Detalhes de uma conversa |
| `/api/opportunities` | GET | Listar oportunidades |
| `/api/opportunities/[id]` | PATCH | Atualizar status |
| `/api/content-suggestions` | GET | Listar sugestões |
| `/api/export` | POST | Exportar para Clone |
| `/api/insights/cross` | GET | Insights cross-conversation |

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
| 1 | Qual o formato exato de exportação do Plaud AI? | Define parser de ingestão | Pendente |
| 2 | Clone externo aceita que formato de input? | Define formato de export | Pendente |
| 3 | Qual provedor de IA usar (OpenAI vs Claude)? | Custo e qualidade | A decidir |
| 4 | Onde hospedar o app? (Vercel, self-hosted) | Custo e complexidade | A decidir |

---

## Appendix

### A. Brownfield Context

Este PRD considera o código existente:
- **Frontend funcional:** Layout 3 colunas, página de Conversas, componentes reutilizáveis
- **Stack definida:** Next.js 16, React 19, TypeScript, Tailwind v4, Zustand
- **Páginas placeholder:** Dashboard, Oportunidades, Conteúdos, Clone, Configurações

Referência: [Documentação do Projeto](./index.md)

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

---

*PRD gerado pelo workflow BMad Method - /bmad:bmm:workflows:prd*
