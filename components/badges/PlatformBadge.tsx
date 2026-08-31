import React from 'react';
import { cn } from '@/lib/utils';
import { ContentSuggestionCardProps } from '@/types';

export const PlatformBadge = ({ platform }: { platform: ContentSuggestionCardProps['platform'] }) => {
    // Formatos de conteúdo (taxonomia 2026-08-28).
    const colors = {
      artigo: 'bg-purple-100 text-purple-700',
      post: 'bg-blue-100 text-blue-700',
      carrossel: 'bg-green-100 text-green-700',
      roteiro: 'bg-red-100 text-red-700',
    };
    return <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', colors[platform])}>{platform}</span>
};
