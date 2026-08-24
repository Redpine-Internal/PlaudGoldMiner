"use client";

import React from 'react';
import { ConversationCardProps } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { TypeBadge } from '../badges/TypeBadge';
import { StatusBadge } from '../badges/StatusBadge';

export const ConversationCard = ({ id, title, date, duration, type, status, summary }: ConversationCardProps) => {
  const { selectedConversationId, setSelectedConversationId } = useAppStore();
  const isSelected = selectedConversationId === id;

  const handleSelect = () => {
    setSelectedConversationId(id);
  };

  return (
    <div
      onClick={handleSelect}
      className={cn(
        'p-4 border rounded-lg cursor-pointer transition-all',
        'hover:shadow-md hover:border-primary',
        isSelected ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-sidebar'
      )}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-bold font-heading text-lg mb-2">{title}</h3>
        <TypeBadge type={type} />
      </div>
      <p className="text-sm text-text-secondary mb-4">{summary}</p>
      <div className="flex justify-between items-center text-xs text-text-secondary">
        <span>{new Date(date).toLocaleDateString('pt-BR')}</span>
        <span>{duration}</span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
};
