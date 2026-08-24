# Andresa AI - Inventário de Componentes

## Resumo

| Categoria | Quantidade | Status |
|-----------|------------|--------|
| Layout | 3 | ✅ Implementados |
| Cards | 1 | ✅ Implementado |
| Badges | 3 | ✅ Implementados |
| Common | 3 | ✅ Implementados |
| UI (shadcn) | 0 | ⚠️ Pendente |
| **Total** | **10** | |

---

## Layout Components

### AppShell
**Arquivo:** `components/layout/AppShell.tsx`
**Tipo:** Server Component

Shell principal que define a estrutura de 3 colunas da aplicação.

```typescript
interface Props {
  children: React.ReactNode;
}
```

**Dependências:** `Sidebar`, `OutputPanel`

---

### Sidebar
**Arquivo:** `components/layout/Sidebar.tsx`
**Tipo:** Client Component (`"use client"`)

Menu de navegação lateral com logo, busca, menu e perfil.

**Dependências:**
- `next/link`, `next/navigation`
- `lucide-react` (LayoutDashboard, MessageSquare, etc.)
- `lib/utils` (cn)

**Features:**
- Navegação dinâmica com estado ativo
- Barra de busca (placeholder)
- Seção de perfil do usuário

---

### OutputPanel
**Arquivo:** `components/layout/OutputPanel.tsx`
**Tipo:** Client Component (`"use client"`)

Painel lateral direito que exibe detalhes do item selecionado.

```typescript
// Usa o Zustand store para:
const { selectedConversationId, setSelectedConversationId } = useAppStore();
```

**Dependências:**
- `stores/appStore`
- `lib/mock-data`
- `lucide-react` (FileText, X)
- `EmptyState`

**Features:**
- Exibe detalhes da conversa selecionada
- Botão de fechar
- Tabs (Resumo, Transcrição, Insights) - placeholder

---

## Card Components

### ConversationCard
**Arquivo:** `components/cards/ConversationCard.tsx`
**Tipo:** Client Component (`"use client"`)

Card clicável que exibe resumo de uma conversa.

```typescript
interface ConversationCardProps {
  id: string;
  title: string;
  date: Date;
  duration: string;
  type: 'reuniao' | 'treinamento' | 'informal' | 'outro';
  status: 'processado' | 'pendente' | 'erro';
  summary?: string;
}
```

**Dependências:**
- `stores/appStore`
- `types/index`
- `lib/utils` (cn)
- `TypeBadge`, `StatusBadge`

**Features:**
- Estado de seleção visual
- Hover effect
- Click handler para selecionar

---

## Badge Components

### TypeBadge
**Arquivo:** `components/badges/TypeBadge.tsx`
**Tipo:** Function Component

Badge colorido para tipo de conversa.

```typescript
type Type = 'reuniao' | 'treinamento' | 'informal' | 'outro';
```

| Tipo | Cor |
|------|-----|
| reuniao | blue |
| treinamento | green |
| informal | amber |
| outro | slate |

---

### StatusBadge
**Arquivo:** `components/badges/StatusBadge.tsx`
**Tipo:** Function Component

Badge colorido para status de processamento.

```typescript
type Status = 'processado' | 'pendente' | 'erro';
```

| Status | Cor |
|--------|-----|
| processado | emerald |
| pendente | yellow |
| erro | red |

---

### PlatformBadge
**Arquivo:** `components/badges/PlatformBadge.tsx`
**Tipo:** Function Component

Badge colorido para plataforma de conteúdo.

```typescript
type Platform = 'youtube' | 'linkedin' | 'blog';
```

| Platform | Cor |
|----------|-----|
| youtube | red |
| linkedin | blue |
| blog | purple |

---

## Common Components

### EmptyState
**Arquivo:** `components/common/EmptyState.tsx`
**Tipo:** Function Component

Estado vazio genérico com ícone, título e mensagem.

```typescript
interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  message: string;
}
```

**Uso:**
```tsx
<EmptyState
  Icon={MessageSquare}
  title="Nenhuma conversa encontrada"
  message="Suas conversas aparecerão aqui."
/>
```

---

### LoadingSkeleton / ConversationCardSkeleton
**Arquivo:** `components/common/LoadingSkeleton.tsx`
**Tipo:** Function Components

Skeletons para estados de carregamento.

**Componentes exportados:**
- `Skeleton` - Base skeleton com animação pulse
- `ConversationCardSkeleton` - Skeleton específico para cards de conversa

---

## Componentes Planejados (Não Implementados)

### Cards
- [ ] `OpportunityCard` - Card de oportunidade
- [ ] `ContentCard` - Card de sugestão de conteúdo
- [ ] `CloneUpdateCard` - Card de atualização do clone

### Badges
- [ ] `OpportunityStatusBadge`
- [ ] `ContentStatusBadge`
- [ ] `CloneStatusBadge`
- [ ] `ScoreBadge` - Para exibir scores (0-100)

### UI (shadcn)
- [ ] `Button`
- [ ] `Input`
- [ ] `Select`
- [ ] `Tabs`
- [ ] `Dialog`
- [ ] `Dropdown`
- [ ] `Toast`

### Layout
- [ ] `PageHeader` - Header padrão de página
- [ ] `FilterBar` - Barra de filtros reutilizável

---

## Padrões de Implementação

### Estrutura de Arquivo
```typescript
// 1. Diretiva de cliente (se necessário)
"use client";

// 2. Imports
import React from 'react';
import { cn } from '@/lib/utils';

// 3. Interface de Props
interface ComponentProps {
  // ...
}

// 4. Componente (export named)
export const Component = ({ ...props }: ComponentProps) => {
  return (
    // JSX
  );
};
```

### Convenções de Estilo
- Usar `cn()` para composição de classes
- Preferir Tailwind utilities a CSS customizado
- Usar variáveis CSS do tema (`bg-primary`, `text-foreground`)
- Manter componentes pequenos e focados
