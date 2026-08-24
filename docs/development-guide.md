# Andresa AI - Guia de Desenvolvimento

## Pré-requisitos

| Requisito | Versão Mínima |
|-----------|---------------|
| Node.js | 18.x ou superior |
| npm | 9.x ou superior |
| Editor | VS Code (recomendado) |

## Instalação

```bash
# Clonar o repositório (se aplicável)
git clone <repo-url>
cd ehs-insights

# Instalar dependências
npm install
```

## Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev      # Inicia servidor de desenvolvimento (Turbopack)

# Build
npm run build    # Cria build de produção

# Produção
npm run start    # Inicia servidor de produção

# Linting
npm run lint     # Executa ESLint
```

## Desenvolvimento Local

### Iniciar o servidor

```bash
npm run dev
```

Acesse: `http://localhost:3000`

### Hot Reload
O projeto usa Turbopack para hot reload rápido. Alterações em arquivos `.tsx`, `.ts` e `.css` são refletidas automaticamente.

## Estrutura de Pastas

```
ehs-insights/
├── app/           # Rotas e páginas (Next.js App Router)
├── components/    # Componentes React
├── lib/           # Utilitários e mock data
├── stores/        # Estado global (Zustand)
├── types/         # Definições TypeScript
├── hooks/         # Custom hooks
├── services/      # API clients (futuro)
├── public/        # Assets estáticos
└── docs/          # Documentação
```

## Criando Novos Componentes

### 1. Escolher o diretório correto

| Tipo | Diretório |
|------|-----------|
| Layout (shell, sidebar, panels) | `components/layout/` |
| Cards de conteúdo | `components/cards/` |
| Badges/Tags | `components/badges/` |
| Componentes genéricos | `components/common/` |
| Componentes shadcn/ui | `components/ui/` |

### 2. Criar o arquivo

```bash
# Exemplo: novo card
touch components/cards/OpportunityCard.tsx
```

### 3. Estrutura do componente

```typescript
"use client"; // Apenas se usar hooks ou estado

import React from 'react';
import { cn } from '@/lib/utils';

interface OpportunityCardProps {
  id: string;
  title: string;
  // ...
}

export const OpportunityCard = ({ id, title }: OpportunityCardProps) => {
  return (
    <div className={cn("p-4 border rounded-lg")}>
      {/* ... */}
    </div>
  );
};
```

## Adicionando Componentes shadcn/ui

```bash
# Instalar um componente
npx shadcn@latest add button

# Instalar múltiplos
npx shadcn@latest add button input select
```

Os componentes são adicionados em `components/ui/`.

## Gerenciamento de Estado

### Criar uma nova propriedade no store

```typescript
// stores/appStore.ts
interface AppState {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // Nova propriedade
  filterType: string | null;
  setFilterType: (type: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

  // Nova propriedade
  filterType: null,
  setFilterType: (type) => set({ filterType: type }),
}));
```

### Usar no componente

```typescript
"use client";
import { useAppStore } from '@/stores/appStore';

const MyComponent = () => {
  const { filterType, setFilterType } = useAppStore();

  return (
    <button onClick={() => setFilterType('reuniao')}>
      Filtrar
    </button>
  );
};
```

## Adicionando Novas Rotas

### 1. Criar diretório e page.tsx

```bash
mkdir app/nova-rota
touch app/nova-rota/page.tsx
```

### 2. Implementar a página

```typescript
// app/nova-rota/page.tsx
import React from 'react';

const NovaRotaPage = () => {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold font-heading">Nova Rota</h1>
        <p className="text-text-secondary mt-1">
          Descrição da página.
        </p>
      </header>

      {/* Conteúdo */}
    </div>
  );
};

export default NovaRotaPage;
```

### 3. Adicionar na Sidebar

```typescript
// components/layout/Sidebar.tsx
const menuItems = [
  // ...existentes
  { icon: NewIcon, label: 'Nova Rota', path: '/nova-rota' },
];
```

## Estilização

### Classes Tailwind Customizadas

O projeto define tokens de design em `app/globals.css`:

```css
/* Cores */
bg-background     /* #FAFAFA */
bg-foreground     /* #1E293B */
bg-primary        /* #7C3AED */
bg-secondary      /* #F97316 */
bg-muted          /* #F1F5F9 */
text-muted-foreground  /* #64748B */

/* Fontes */
font-sans         /* Inter */
font-heading      /* DM Sans */
font-mono         /* JetBrains Mono */
```

### Composição de classes

```typescript
import { cn } from '@/lib/utils';

// Combinar classes condicionalmente
<div className={cn(
  "p-4 border rounded-lg",
  isActive && "border-primary bg-primary/5",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>
```

## Tipagem

### Adicionar novos tipos

```typescript
// types/index.ts

// 1. Interface de props para card
export interface NewEntityCardProps {
  id: string;
  // ...
}

// 2. Interface de detalhes (estende card)
export interface NewEntityDetails extends NewEntityCardProps {
  extraField: string;
  // ...
}
```

### Importar tipos

```typescript
import { NewEntityCardProps } from '@/types';
```

## Mock Data

### Adicionar novos dados mockados

```typescript
// lib/mock-data.ts
import { NewEntityCardProps } from '@/types';

export const mockNewEntities: NewEntityCardProps[] = [
  { id: 'new-1', /* ... */ },
  { id: 'new-2', /* ... */ },
];
```

## Debugging

### React DevTools
Instale a extensão do navegador para inspecionar componentes.

### Zustand DevTools
```typescript
import { devtools } from 'zustand/middleware';

export const useAppStore = create<AppState>()(
  devtools((set) => ({
    // ...
  }))
);
```

## Convenções de Código

### Nomenclatura
- **Componentes:** PascalCase (`ConversationCard.tsx`)
- **Hooks:** camelCase com prefixo `use` (`useAppStore.ts`)
- **Tipos:** PascalCase (`ConversationCardProps`)
- **Funções:** camelCase (`handleClick`)
- **Constantes:** UPPER_SNAKE_CASE (`MAX_ITEMS`)

### Estrutura de imports
```typescript
// 1. React
import React from 'react';

// 2. Next.js
import Link from 'next/link';

// 3. Bibliotecas externas
import { MessageSquare } from 'lucide-react';

// 4. Componentes internos
import { ConversationCard } from '@/components/cards/ConversationCard';

// 5. Utilitários e tipos
import { cn } from '@/lib/utils';
import { ConversationCardProps } from '@/types';
```

## Troubleshooting

### Erro: "Cannot apply unknown utility class"
O Tailwind CSS v4 requer que as cores sejam definidas no bloco `@theme` com prefixo `--color-`. Verifique `app/globals.css`.

### Erro: "Module not found: @/..."
Verifique se o path alias está configurado em `tsconfig.json`:
```json
"paths": {
  "@/*": ["./*"]
}
```

### Componente não atualiza
Se usar Zustand, certifique-se de que o componente tem `"use client"` no topo.
