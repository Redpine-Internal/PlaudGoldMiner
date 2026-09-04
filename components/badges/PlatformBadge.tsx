import React from 'react';
import { cn } from '@/lib/utils';
import { ContentSuggestionCardProps } from '@/types';
import { formatContentFormat } from '@/lib/presentation/labels';

export const PlatformBadge = ({ platform }: { platform: ContentSuggestionCardProps['platform'] }) => {
    // Formatos de conteúdo (taxonomia 2026-08-28).
    const colors = {
      artigo: 'text-[var(--bronze-deep)]',
      post: 'text-[var(--bronze-deep)]',
      carrossel: 'text-[var(--badge-green)]',
      roteiro: 'text-[var(--badge-red)]',
    };
    return <span className={cn('rounded-[4px] bg-[var(--badge-bg)] px-2 py-1 text-xs font-semibold', colors[platform])}>{formatContentFormat(platform)}</span>
};
