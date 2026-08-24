# Andresa AI - Documentação do Projeto

> Plataforma de gestão de conversas e insights para extração de oportunidades de negócio, sugestões de conteúdo e alimentação de base de conhecimento.

---

## Visão Geral do Projeto

| Aspecto | Valor |
|---------|-------|
| **Tipo** | Monolith - Aplicação Web SPA |
| **Linguagem** | TypeScript |
| **Framework** | Next.js 16 (App Router) |
| **Padrão** | Component-based Architecture |
| **Status** | Protótipo Frontend |

## Quick Reference

### Stack Tecnológica
- **Frontend:** Next.js 16, React 19, TypeScript 5
- **Styling:** Tailwind CSS v4, shadcn/ui (new-york)
- **State:** Zustand 5.0.8
- **Icons:** Lucide React
- **Build:** Turbopack

### Entry Point
- `app/layout.tsx` - Layout raiz
- `app/page.tsx` - Dashboard (placeholder)

### Comandos Principais
```bash
npm run dev      # Desenvolvimento
npm run build    # Build produção
npm run start    # Servidor produção
npm run lint     # Linting
```

---

## Documentação Gerada

### Arquitetura e Estrutura
- [Visão Geral do Projeto](./project-overview.md) - Resumo executivo e features
- [Arquitetura](./architecture.md) - Padrões, decisões, stack tecnológica
- [Árvore de Fontes](./source-tree-analysis.md) - Estrutura de diretórios anotada

### Componentes e Dados
- [Inventário de Componentes](./component-inventory.md) - Todos os componentes React
- [Modelos de Dados](./data-models.md) - Interfaces TypeScript e entidades

### Desenvolvimento
- [Guia de Desenvolvimento](./development-guide.md) - Setup, convenções, troubleshooting

---

## Documentação Existente

- [README.md](../README.md) - README padrão Next.js
- [PROGRESS_SUMMARY.md](../PROGRESS_SUMMARY.md) - Resumo do progresso (14 tarefas)

---

## Artefatos de Workflow

- [bmm-workflow-status.yaml](./bmm-workflow-status.yaml) - Status do workflow BMad Method

---

## Rotas da Aplicação

| Rota | Página | Status |
|------|--------|--------|
| `/` | Dashboard | Placeholder |
| `/conversas` | Conversas | ✅ Funcional |
| `/oportunidades` | Oportunidades | Placeholder |
| `/conteudos` | Conteúdos | Placeholder |
| `/clone` | Clone | Placeholder |
| `/configuracoes` | Configurações | Placeholder |

---

## Funcionalidades por Status

### Implementadas
- Layout de 3 colunas (Sidebar 240px, Main flex-1, OutputPanel 400px)
- Navegação com menu ativo e ícones
- Página de Conversas com lista de cards
- Seleção de conversa → exibe detalhes no OutputPanel
- Estados de loading (skeletons) e empty
- Componentes reutilizáveis (Badges, Cards)
- Design system com cores e fontes customizadas

### Planejadas (Não Implementadas)
- Dashboard com métricas reais
- Página de Oportunidades funcional
- Página de Conteúdos funcional
- Página do Clone funcional
- Página de Configurações funcional
- Backend API real
- Autenticação
- Persistência de dados

---

## Getting Started

### Desenvolvimento
```bash
cd ehs-insights
npm install
npm run dev
```

Acesse: `http://localhost:3000`

### Para Desenvolvimento AI-Assistido
1. Leia este `index.md` para contexto geral
2. Consulte `architecture.md` para decisões técnicas
3. Use `component-inventory.md` ao criar novos componentes
4. Siga `development-guide.md` para convenções

---

## Próximos Passos (Brownfield PRD)

Quando estiver pronto para planejar novas features, execute o workflow PRD do BMad Method:

```
/bmad:bmm:workflows:prd
```

Use esta documentação como contexto para o PRD brownfield.

---

*Documentação gerada em 2025-11-28 pelo workflow document-project do BMad Method.*
