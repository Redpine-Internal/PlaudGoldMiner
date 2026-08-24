# Andresa AI - Análise da Árvore de Fontes

## Estrutura do Projeto

```
ehs-insights/
├── app/                          # Next.js App Router - Rotas e páginas
│   ├── globals.css               # Estilos globais + Tailwind @theme
│   ├── layout.tsx                # Layout raiz com AppShell
│   ├── page.tsx                  # Dashboard (placeholder)
│   ├── conversas/
│   │   └── page.tsx              # ✅ Página de Conversas (funcional)
│   ├── oportunidades/
│   │   └── page.tsx              # Oportunidades (placeholder)
│   ├── conteudos/
│   │   └── page.tsx              # Conteúdos (placeholder)
│   ├── clone/
│   │   └── page.tsx              # Clone (placeholder)
│   └── configuracoes/
│       └── page.tsx              # Configurações (placeholder)
│
├── components/                   # Componentes React reutilizáveis
│   ├── layout/                   # Componentes de estrutura
│   │   ├── AppShell.tsx          # Shell principal (3 colunas)
│   │   ├── Sidebar.tsx           # Menu lateral de navegação
│   │   └── OutputPanel.tsx       # Painel de detalhes à direita
│   │
│   ├── badges/                   # Componentes de badge/tag
│   │   ├── TypeBadge.tsx         # Badge de tipo de conversa
│   │   ├── StatusBadge.tsx       # Badge de status
│   │   └── PlatformBadge.tsx     # Badge de plataforma
│   │
│   ├── cards/                    # Componentes de card
│   │   └── ConversationCard.tsx  # Card de conversa
│   │
│   ├── common/                   # Componentes comuns/utilitários
│   │   ├── EmptyState.tsx        # Estado vazio genérico
│   │   └── LoadingSkeleton.tsx   # Skeletons de carregamento
│   │
│   └── ui/                       # Componentes shadcn/ui (vazio)
│
├── lib/                          # Utilitários e dados
│   ├── utils.ts                  # Função cn() para classes
│   └── mock-data.ts              # Dados mockados para desenvolvimento
│
├── stores/                       # Estado global (Zustand)
│   └── appStore.ts               # Store principal da aplicação
│
├── types/                        # Definições TypeScript
│   └── index.ts                  # Todas as interfaces do projeto
│
├── hooks/                        # Custom hooks (vazio)
├── services/                     # Serviços/API clients (vazio)
├── public/                       # Assets estáticos
│
├── docs/                         # Documentação do projeto
│   ├── sprint-artifacts/         # Artefatos de sprint
│   └── bmm-workflow-status.yaml  # Status do workflow BMad
│
├── .bmad/                        # Configuração BMad Method
├── .claude/                      # Comandos Claude Code
├── .cursor/                      # Regras Cursor IDE
│
├── package.json                  # Dependências e scripts
├── tsconfig.json                 # Configuração TypeScript
├── components.json               # Configuração shadcn/ui
├── next.config.ts                # Configuração Next.js
├── postcss.config.mjs            # Configuração PostCSS
├── eslint.config.mjs             # Configuração ESLint
├── README.md                     # README padrão Next.js
└── PROGRESS_SUMMARY.md           # Resumo do progresso do projeto
```

## Diretórios Críticos

### `/app` - Rotas e Páginas
Entry point da aplicação. Utiliza o App Router do Next.js 16.
- `layout.tsx` é o ponto de entrada que envolve todas as páginas com o `AppShell`
- Cada subdiretório representa uma rota

### `/components` - Componentes React
Organizado por categoria:
- **layout/** - Estrutura da aplicação (shell, sidebar, panels)
- **badges/** - Elementos visuais de categorização
- **cards/** - Cards de conteúdo
- **common/** - Componentes reutilizáveis genéricos
- **ui/** - Reservado para componentes shadcn/ui

### `/stores` - Estado Global
Gerenciamento de estado com Zustand. Atualmente contém apenas o estado de seleção de conversa.

### `/types` - Definições de Tipo
Todas as interfaces TypeScript centralizadas. Define a estrutura de dados para conversas, oportunidades, conteúdos e clone.

### `/lib` - Utilitários
- `utils.ts` - Função `cn()` para composição de classes Tailwind
- `mock-data.ts` - Dados mockados para desenvolvimento

## Padrões de Código

### Convenções de Nomenclatura
- **Componentes:** PascalCase (`ConversationCard.tsx`)
- **Hooks:** camelCase com prefixo `use` (`useAppStore`)
- **Tipos:** PascalCase com sufixo `Props` ou `Details`
- **Arquivos de página:** `page.tsx` (padrão Next.js)

### Estrutura de Componentes
```typescript
// Padrão de componente
"use client"; // Se usa hooks/estado

import React from 'react';
import { cn } from '@/lib/utils';

interface ComponentProps {
  // props tipadas
}

export const Component = ({ ...props }: ComponentProps) => {
  return (
    // JSX
  );
};
```

## Dependências entre Arquivos

```
app/layout.tsx
└── components/layout/AppShell.tsx
    ├── components/layout/Sidebar.tsx
    │   └── lib/utils.ts (cn)
    └── components/layout/OutputPanel.tsx
        ├── stores/appStore.ts
        ├── lib/mock-data.ts
        └── components/common/EmptyState.tsx

app/conversas/page.tsx
├── lib/mock-data.ts
├── components/cards/ConversationCard.tsx
│   ├── stores/appStore.ts
│   ├── types/index.ts
│   ├── components/badges/TypeBadge.tsx
│   └── components/badges/StatusBadge.tsx
├── components/common/LoadingSkeleton.tsx
└── components/common/EmptyState.tsx
```
