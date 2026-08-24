'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  FileText,
  Folder,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

interface DriveFilePickerProps {
  onSelect: (file: DriveFile) => void;
  onCancel: () => void;
  isImporting?: boolean;
}

export function DriveFilePicker({
  onSelect,
  onCancel,
  isImporting = false,
}: DriveFilePickerProps) {
  const { data: session } = useSession();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>(
    []
  );

  const currentFolderId =
    folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined;

  const fetchFilesAndFolders = async (folderId?: string) => {
    setLoading(true);
    setError(null);

    try {
      const [filesRes, foldersRes] = await Promise.all([
        fetch(`/api/drive/files${folderId ? `?folderId=${folderId}` : ''}`),
        fetch(`/api/drive/folders${folderId ? `?parentId=${folderId}` : ''}`),
      ]);

      if (!filesRes.ok || !foldersRes.ok) {
        throw new Error('Failed to fetch from Drive');
      }

      const filesData = await filesRes.json();
      const foldersData = await foldersRes.json();

      setFiles(filesData.files || []);
      setFolders(foldersData.files || []);
    } catch (err) {
      setError('Erro ao carregar arquivos do Google Drive');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.accessToken) {
      fetchFilesAndFolders(currentFolderId);
    }
  }, [session?.accessToken, currentFolderId]);

  const navigateToFolder = (folder: DriveFile) => {
    setSelectedFile(null);
    setFolderStack([...folderStack, { id: folder.id, name: folder.name }]);
  };

  const navigateBack = () => {
    setSelectedFile(null);
    setFolderStack(folderStack.slice(0, -1));
  };

  const handleImport = () => {
    if (selectedFile) {
      onSelect(selectedFile);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className="h-5 w-5 text-yellow-500" />;
    }
    return <FileText className="h-5 w-5 text-blue-500" />;
  };

  if (!session?.accessToken) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">
          Conecte sua conta Google para acessar o Drive
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {folderStack.length > 0 && (
            <button
              onClick={navigateBack}
              className="p-1 hover:bg-muted rounded"
              disabled={loading || isImporting}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">Drive</span>
            {folderStack.map((folder, idx) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span
                  className={
                    idx === folderStack.length - 1 ? 'font-medium' : ''
                  }
                >
                  {folder.name}
                </span>
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => fetchFilesAndFolders(currentFolderId)}
          className="p-1 hover:bg-muted rounded"
          disabled={loading || isImporting}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-destructive">{error}</p>
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Nenhum arquivo encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Folders first */}
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => navigateToFolder(folder)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left"
                disabled={isImporting}
              >
                {getFileIcon(folder.mimeType)}
                <span className="flex-1 truncate">{folder.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}

            {/* Files */}
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left ${
                  selectedFile?.id === file.id
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : ''
                }`}
                disabled={isImporting}
              >
                {getFileIcon(file.mimeType)}
                <div className="flex-1 min-w-0">
                  <p className="truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(file.modifiedTime)}
                  </p>
                </div>
                {selectedFile?.id === file.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted"
          disabled={isImporting}
        >
          <X className="h-4 w-4" />
          <span>Cancelar</span>
        </button>
        <button
          onClick={handleImport}
          disabled={!selectedFile || isImporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Importando...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              <span>Importar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
