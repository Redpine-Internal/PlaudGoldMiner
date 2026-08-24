import { z } from 'zod';

// Schema for creating a new conversation
export const conversationCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  date: z.coerce.date(),
  duration: z.string().optional(),
  type: z.enum(['reuniao', 'treinamento', 'informal', 'outro']),
  transcription: z.string().optional(),
  summary: z.string().optional(),
  topics: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  source: z.enum(['plaud', 'drive', 'upload']),
  sourceFileId: z.string().optional(),
});

// Schema for updating a conversation (all fields optional)
export const conversationUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  date: z.coerce.date().optional(),
  duration: z.string().optional(),
  type: z.enum(['reuniao', 'treinamento', 'informal', 'outro']).optional(),
  status: z.enum(['pendente', 'processando', 'processado', 'erro']).optional(),
  transcription: z.string().optional(),
  summary: z.string().optional(),
  topics: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

// Schema for list query parameters
export const conversationListSchema = z.object({
  status: z.enum(['pendente', 'processando', 'processado', 'erro']).optional(),
  type: z.enum(['reuniao', 'treinamento', 'informal', 'outro']).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

// Type exports
export type ConversationCreate = z.infer<typeof conversationCreateSchema>;
export type ConversationUpdate = z.infer<typeof conversationUpdateSchema>;
export type ConversationListParams = z.infer<typeof conversationListSchema>;

// Utility to format Zod errors for API response
export function formatZodError(error: z.ZodError<unknown>) {
  return {
    error: 'Validation failed',
    details: error.issues.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  };
}
