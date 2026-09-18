import { describe, expect, it } from 'vitest';
import { staleVerifierCookieNames } from '@/lib/auth/pkce-cookies';

const STORAGE_KEY = 'sb-abcdefghijklmnop-auth-token';

describe('cookies de code verifier a limpar', () => {
  it('apaga o slot do fluxo que acabou de trocar o code', () => {
    const nomes = [`${STORAGE_KEY}-flow-c5fb3a66f3bd242b3526329615c136c9-code-verifier`];
    expect(staleVerifierCookieNames(nomes)).toEqual(nomes);
  });

  it('apaga slots órfãos de fluxos abandonados', () => {
    // O caso que engordou o header em produção: tentativas de login que nunca
    // chegaram ao callback deixaram o verifier para trás.
    const nomes = [
      `${STORAGE_KEY}-flow-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-code-verifier`,
      `${STORAGE_KEY}-flow-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-code-verifier`,
      `${STORAGE_KEY}-flow-cccccccccccccccccccccccccccccccc-code-verifier`,
    ];
    expect(staleVerifierCookieNames(nomes)).toEqual(nomes);
  });

  it('apaga a chave legada de posição fixa', () => {
    const nomes = [`${STORAGE_KEY}-code-verifier`];
    expect(staleVerifierCookieNames(nomes)).toEqual(nomes);
  });

  it('apaga o índice de fluxos', () => {
    // Sem remover o índice sobraria um cookie apontando para slots inexistentes.
    const nomes = [`${STORAGE_KEY}-flows-code-verifier`];
    expect(staleVerifierCookieNames(nomes)).toEqual(nomes);
  });

  it('preserva o cookie de sessão', () => {
    // A regressão que importa: varrer demais desloga quem acabou de entrar.
    const nomes = [STORAGE_KEY, `${STORAGE_KEY}.0`, `${STORAGE_KEY}.1`];
    expect(staleVerifierCookieNames(nomes)).toEqual([]);
  });

  it('preserva cookies alheios à autenticação', () => {
    const nomes = ['theme', 'NEXT_LOCALE', '_ga'];
    expect(staleVerifierCookieNames(nomes)).toEqual([]);
  });

  it('separa verifier de sessão quando os dois convivem', () => {
    const nomes = [
      `${STORAGE_KEY}.0`,
      `${STORAGE_KEY}-flow-dddddddddddddddddddddddddddddddd-code-verifier`,
      `${STORAGE_KEY}.1`,
      `${STORAGE_KEY}-code-verifier`,
      'theme',
    ];
    expect(staleVerifierCookieNames(nomes)).toEqual([
      `${STORAGE_KEY}-flow-dddddddddddddddddddddddddddddddd-code-verifier`,
      `${STORAGE_KEY}-code-verifier`,
    ]);
  });

  it('alcança os pedaços de um verifier fatiado', () => {
    // Um verifier tem ~90 bytes e hoje não é fatiado; se passar a ser, deixar
    // os pedaços para trás recriaria o acúmulo que esta limpeza existe para
    // evitar.
    const nomes = [
      `${STORAGE_KEY}-flow-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-code-verifier.0`,
      `${STORAGE_KEY}-flow-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-code-verifier.1`,
    ];
    expect(staleVerifierCookieNames(nomes)).toEqual(nomes);
  });

  it('não confunde um cookie que apenas menciona verifier no meio do nome', () => {
    const nomes = [`${STORAGE_KEY}-code-verifier-backup`, 'code-verifier-algo'];
    expect(staleVerifierCookieNames(nomes)).toEqual([]);
  });

  it('lida com a ausência de cookies', () => {
    expect(staleVerifierCookieNames([])).toEqual([]);
  });
});
