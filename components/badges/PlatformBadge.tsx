import React from 'react';
import { cn } from '@/lib/utils';
import { ContentSuggestionCardProps } from '@/types';

export const PlatformBadge = ({ platform }: { platform: ContentSuggestionCardProps['platform'] }) => {
    const colors = {
      youtube: 'bg-red-100 text-red-700',
      linkedin: 'bg-blue-100 text-blue-700',
      blog: 'bg-purple-100 text-purple-700',
    };
    return <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', colors[platform])}>{platform}</span>
};
