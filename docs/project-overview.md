# Andresa AI - Visão Geral do Projeto

## Resumo Executivo

**Andresa AI** é uma plataforma de gestão de conversas e insights que processa reuniões e interações para extrair oportunidades de negócio, sugestões de conteúdo e alimentar uma base de conhecimento ("Clone").

**Status:** Protótipo Frontend em desenvolvimento

## Informações do Projeto

| Aspecto | Valor |
|---------|-------|
| **Nome** | Andresa AI |
| **Tipo** | Aplicação Web SPA |
| **Repository Type** | Monolith |
| **Framework** | Next.js 16 (App Router) |
| **Linguagem** | TypeScript |
| **Status** | Protótipo - Página de Conversas funcional |

## Stack de Tecnologia

| Categoria | Tecnologia | Versão |
|-----------|------------|--------|
| Framework | Next.js | 16.0.5 |
| UI Library | React | 19.2.0 |
| Styling | Tailwind CSS | v4 |
| Components | shadcn/ui | new-york |
| State | Zustand | 5.0.8 |
| Icons | Lucide React | 0.555.0 |
| Linguagem | TypeScript | 5.x |

## Funcionalidades Principais

### Implementadas
- Layout de 3 colunas (Sidebar, Main Content, Output Panel)
- Navegação com 6 rotas
- Página de Conversas com lista e painel de detalhes
- Estado global com Zustand
- Componentes reutilizáveis (Badges, Cards, Skeletons)
- Estados de loading e empty

### Planejadas (Placeholders)
- Dashboard com métricas
- Página de Oportunidades
- Página de Conteúdos
- Página do Clone
- Página de Configurações
- API Backend real

## Rotas da Aplicação

| Rota | Página | Status |
|------|--------|--------|
| `/` | Dashboard | Placeholder |
| `/conversas` | Conversas | ✅ Funcional |
| `/oportunidades` | Oportunidades | Placeholder |
| `/conteudos` | Conteúdos | Placeholder |
| `/clone` | Clone | Placeholder |
| `/configuracoes` | Configurações | Placeholder |

## Design System

### Cores
- **Primary:** `#7C3AED` (Violet)
- **Secondary:** `#F97316` (Orange)
- **Background:** `#FAFAFA`
- **Foreground:** `#1E293B`

### Fontes
- **Sans:** Inter
- **Heading:** DM Sans
- **Mono:** JetBrains Mono

## Links para Documentação Detalhada

- [Arquitetura](./architecture.md)
- [Árvore de Fontes](./source-tree-analysis.md)
- [Inventário de Componentes](./component-inventory.md)
- [Guia de Desenvolvimento](./development-guide.md)
- [Modelos de Dados](./data-models.md)
