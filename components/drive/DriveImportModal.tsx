'use client';

import { useState } from 'react';
import { X, HardDrive } from 'lucide-react';
import { DriveFilePicker } from './DriveFilePicker';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

interface DriveImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DriveImportModal({
  isOpen,
  onClose,
  onSuccess,
}: DriveImportModalProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: DriveFile) => {
    setIsImporting(true);
    setError(null);

    try {
      const response = await fetch('/api/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao importar arquivo');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="ds-modal-root fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="ds-modal-backdrop absolute inset-0"
        onClick={isImporting ? undefined : onClose}
      />

      {/* Modal */}
      <div className="ds-modal pgm-drive-modal relative w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Importar do Google Drive</h2>
          </div>
          <button
            onClick={onClose}
            className="icon-btn hover:bg-muted"
            disabled={isImporting}
            aria-label="Fechar importação do Drive"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* File picker */}
        <DriveFilePicker
          onSelect={handleFileSelect}
          onCancel={onClose}
          isImporting={isImporting}
        />
      </div>
    </div>
  );
}
