import { z } from 'zod';

// Validation constants
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ACCEPTED_EXTENSIONS = ['.txt', '.json'];
export const ACCEPTED_MIME_TYPES = ['text/plain', 'application/json'];

// Schema for upload metadata
export const uploadMetadataSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.enum(['reuniao', 'treinamento', 'informal', 'outro']).optional(),
  date: z.coerce.date().optional(),
  duration: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;

// Validate file extension
export function isValidFileExtension(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return ACCEPTED_EXTENSIONS.includes(ext);
}

// Validate file size
export function isValidFileSize(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
