'use client';

import { useState, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { DropZone } from './DropZone';
import { UploadProgress, type UploadStatus } from './UploadProgress';
import { MetadataForm } from './MetadataForm';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'metadata' | 'processing';

interface Metadata {
  title: string;
  type: 'reuniao' | 'treinamento' | 'informal' | 'outro';
  date: Date;
  duration?: string;
  tags: string[];
}

interface AIResult {
  suggestedTitle?: string;
  suggestedType?: 'reuniao' | 'treinamento' | 'informal' | 'outro';
}

export function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({
    title: '',
    type: 'outro',
    date: new Date(),
    tags: [],
  });

  const handleFileSelect = async (file: File) => {
    setStatus('uploading');
    setProgress(0);
    setError(null);

    try {
      setProgress(25);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/conversations/upload', {
        method: 'POST',
        body: formData,
      });

      setProgress(50);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { data: conversation } = await response.json();
      setConversationId(conversation.id);

      // Process to get AI suggestions
      setStatus('processing');
      setProgress(60);

      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      });

      setProgress(90);

      if (!processResponse.ok) {
        const data = await processResponse.json();
        throw new Error(data.error || 'Processing failed');
      }

      const processResult = await processResponse.json();
      setProgress(100);
      setStatus('success');

      // Set AI suggestions
      setAiResult({
        suggestedTitle: processResult.data?.suggestedTitle || conversation.title,
        suggestedType: processResult.data?.suggestedType,
      });

      // Move to metadata step after a brief pause
      setTimeout(() => {
        setStep('metadata');
        setStatus('idle');
      }, 500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleMetadataChange = useCallback((data: Metadata) => {
    setMetadata(data);
  }, []);

  const handleSaveMetadata = async () => {
    if (!conversationId) return;

    setStep('processing');
    setStatus('processing');
    setProgress(50);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: metadata.title,
          type: metadata.type,
          date: metadata.date.toISOString(),
          duration: metadata.duration,
          tags: JSON.stringify(metadata.tags),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save metadata');
      }

      setProgress(100);
      setStatus('success');

      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('metadata');
    }
  };

  const handleClose = () => {
    if (status === 'uploading' || (status === 'processing' && step !== 'metadata')) {
      return;
    }
    setStep('upload');
    setStatus('idle');
    setProgress(0);
    setError(null);
    setConversationId(null);
    setAiResult(null);
    setMetadata({
      title: '',
      type: 'outro',
      date: new Date(),
      tags: [],
    });
    onClose();
  };

  const handleBack = () => {
    if (step === 'metadata') {
      // Can't go back to upload after file was uploaded
      // Could delete conversation and restart, but for simplicity just close
      handleClose();
    }
  };

  if (!isOpen) return null;

  const isProcessing = status === 'uploading' || status === 'processing';

  return (
    <div className="ds-modal-root fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="ds-modal-backdrop absolute inset-0"
        onClick={isProcessing ? undefined : handleClose}
      />

      {/* Modal */}
      <div className="ds-modal pgm-upload-modal relative w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {step === 'metadata' && (
              <button
                onClick={handleBack}
                className="icon-btn"
                aria-label="Cancelar envio"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-xl font-semibold">
              {step === 'upload' && 'Nova Conversa'}
              {step === 'metadata' && 'Informações da Conversa'}
              {step === 'processing' && 'Salvando...'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="icon-btn disabled:opacity-50"
            aria-label="Fechar nova conversa"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
              step === 'upload'
                ? 'bg-primary text-primary-foreground'
                : 'bg-green-500 text-white'
            }`}
          >
            {step === 'upload' ? '1' : <Check className="h-3 w-3" />}
          </div>
          <div className="flex-1 h-0.5 bg-border">
            <div
              className={`h-full bg-primary transition-all ${
                step !== 'upload' ? 'w-full' : 'w-0'
              }`}
            />
          </div>
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
              step === 'metadata'
                ? 'bg-primary text-primary-foreground'
                : step === 'processing'
                ? 'bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {step === 'processing' ? <Check className="h-3 w-3" /> : '2'}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {step === 'upload' && (
            <>
              <DropZone
                onFileSelect={handleFileSelect}
                disabled={isProcessing}
              />
              <UploadProgress
                status={status}
                progress={progress}
                error={error || undefined}
              />
            </>
          )}

          {step === 'metadata' && (
            <>
              <MetadataForm
                suggestedTitle={aiResult?.suggestedTitle}
                suggestedType={aiResult?.suggestedType}
                onChange={handleMetadataChange}
                disabled={isProcessing}
              />

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="min-h-[48px] rounded-[6px] border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMetadata}
                  disabled={isProcessing || !metadata.title}
                  className="flex min-h-[48px] items-center gap-2 rounded-[6px] bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Salvar Conversa
                </button>
              </div>
            </>
          )}

          {step === 'processing' && (
            <UploadProgress
              status={status}
              progress={progress}
              error={error || undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
