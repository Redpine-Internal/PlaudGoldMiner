import { describe, expect, it } from 'vitest';
import { isAllowedUserEmail } from '@/lib/auth/access';

describe('isAllowedUserEmail', () => {
  it.each([
    'fabio.marques@ehsbrasil.com',
    'Fabio.Marques@ehsbrasil.com',
    ' andreza.araujo@ehsbrasil.com ',
  ])('permite somente uma conta autorizada: %s', (email) => {
    expect(isAllowedUserEmail(email)).toBe(true);
  });

  it.each([
    'outro.usuario@ehsbrasil.com',
    'fabio.marques@outrodominio.com',
    '',
    null,
    undefined,
  ])('recusa qualquer outra conta: %s', (email) => {
    expect(isAllowedUserEmail(email)).toBe(false);
  });
});
