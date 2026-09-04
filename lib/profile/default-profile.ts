export const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Fabio Marques',
  email: 'fabio.marques@ehsbrasil.com',
  bio: 'Atuação em segurança do trabalho com foco em prevenção de eventos graves, leitura de energia e controles críticos. Trabalho com liderança de primeira linha e com a diferença entre cumprir norma e controlar risco.',
} as const;

export function profileFirstName(name: string | null | undefined): string {
  return (name?.trim() || DEFAULT_PROFILE.name).split(/\s+/)[0] ?? '';
}
