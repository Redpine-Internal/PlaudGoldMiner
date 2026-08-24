import React from 'react';
import { cn } from '@/lib/utils';
import { ConversationCardProps } from '@/types';

export const TypeBadge = ({ type }: { type: ConversationCardProps['type'] }) => {
    const colors = {
      reuniao: 'bg-blue-100 text-blue-700',
      treinamento: 'bg-green-100 text-green-700',
      informal: 'bg-amber-100 text-amber-700',
      outro: 'bg-slate-100 text-slate-700',
    };
    return <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', colors[type])}>{type}</span>
};
