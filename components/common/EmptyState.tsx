import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  message: string;
}

export const EmptyState = ({ Icon, title, message }: EmptyStateProps) => {
  return (
    <div className="p-8 bg-slate-50 border-2 border-dashed border-border rounded-lg text-center flex flex-col items-center justify-center">
      <Icon className="w-12 h-12 text-slate-400 mb-4" />
      <h3 className="font-heading font-semibold text-lg">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-xs">{message}</p>
    </div>
  );
};
