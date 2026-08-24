import React from 'react';
import { cn } from '@/lib/utils';
import { ConversationCardProps } from '@/types';

export const StatusBadge = ({ status }: { status: ConversationCardProps['status'] }) => {
    const colors = {
        processado: 'bg-emerald-100 text-emerald-700',
        pendente: 'bg-yellow-100 text-yellow-700',
        erro: 'bg-red-100 text-red-700',
    };
     return <span className={cn('text-xs font-medium px-2 py-1 rounded-md', colors[status])}>{status}</span>
};
