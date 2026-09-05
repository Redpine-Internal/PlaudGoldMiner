import { z } from 'zod';

export const profileInput = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(200),
  email: z.email('Informe um e-mail válido.').trim(),
  bio: z.string().max(10000).nullable().optional(),
});
