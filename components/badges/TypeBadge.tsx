import React from 'react';
import { cn } from '@/lib/utils';
import { ConversationCardProps } from '@/types';
import { formatConversationType } from '@/lib/presentation/labels';

export const TypeBadge = ({ type }: { type: ConversationCardProps['type'] }) => {
    const colors: Record<ConversationCardProps['type'], string> = {
      nao_classificado: 'bg-slate-100 text-slate-700',
      reuniao_comercial: 'bg-blue-100 text-blue-700',
      diagnostico: 'bg-blue-100 text-blue-700',
      projeto_cliente: 'bg-blue-100 text-blue-700',
      mentoria: 'bg-blue-100 text-blue-700',
      reuniao_interna: 'bg-blue-100 text-blue-700',
      reuniao: 'bg-blue-100 text-blue-700',
      treinamento: 'bg-green-100 text-green-700',
      informal: 'bg-amber-100 text-amber-700',
      outro: 'bg-slate-100 text-slate-700',
    };
    return <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', colors[type])}>{formatConversationType(type)}</span>
};
