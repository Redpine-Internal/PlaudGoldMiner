'use client';

import { cn } from '@/lib/utils';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface UploadProgressProps {
  status: UploadStatus;
  progress: number; // 0-100
  stage?: string;
  error?: string;
  className?: string;
}

const statusConfig = {
  idle: { color: 'bg-muted', icon: null },
  uploading: { color: 'bg-blue-500', icon: Loader2 },
  processing: { color: 'bg-yellow-500', icon: Loader2 },
  success: { color: 'bg-green-500', icon: CheckCircle },
  error: { color: 'bg-destructive', icon: XCircle },
};

export function UploadProgress({
  status,
  progress,
  stage,
  error,
  className,
}: UploadProgressProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  if (status === 'idle') {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300 ease-out',
            config.color
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status text */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon
              className={cn(
                'h-4 w-4',
                status === 'uploading' || status === 'processing'
                  ? 'animate-spin'
                  : '',
                status === 'success' && 'text-green-500',
                status === 'error' && 'text-destructive'
              )}
            />
          )}
          <span className="text-muted-foreground">
            {error || stage || getDefaultStage(status, progress)}
          </span>
        </div>
        <span className="font-medium">{progress}%</span>
      </div>
    </div>
  );
}

function getDefaultStage(status: UploadStatus, progress: number): string {
  switch (status) {
    case 'uploading':
      return 'Enviando arquivo...';
    case 'processing':
      if (progress < 50) return 'Analisando conteúdo...';
      if (progress < 90) return 'Extraindo insights...';
      return 'Finalizando...';
    case 'success':
      return 'Concluído!';
    case 'error':
      return 'Erro no processamento';
    default:
      return '';
  }
}
