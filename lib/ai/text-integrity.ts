/**
 * Detecção de texto corrompido pelo modelo.
 *
 * O gerador ocasionalmente troca um token do meio de uma palavra por outro de
 * alfabeto completamente diferente — o caso observado em produção foi
 * "EPIs կիրառados" (armênio dentro de "aplicados"). O texto continua bem-formado
 * e a rota o persiste sem reclamar, então o defeito só aparece na tela, para o
 * usuário. A checagem abaixo roda antes de gravar.
 */

/**
 * Blocos Unicode que não têm o que fazer num texto em português: grego, cirílico,
 * armênio, hebraico, árabe, devanágari, CJK e hangul. Latim acentuado, pontuação
 * e símbolos comuns ficam de fora de propósito — só o alfabeto errado acusa.
 */
const ALFABETO_ESTRANHO =
  /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ　-鿿가-힯]/u;

export interface ProblemaDeTexto {
  /** Por que o texto foi rejeitado — mensagem curta, já em português. */
  motivo: string;
  /** Recorte ao redor da ocorrência, para o log. Vazio quando não se aplica. */
  trecho: string;
}

/**
 * Devolve o problema encontrado, ou `null` se o texto passa.
 * Rejeita apenas o que é inequivocamente defeito de geração: alfabeto errado e
 * caracteres de substituição. Não julga estilo nem tamanho.
 */
export function detectarTextoCorrompido(texto: string): ProblemaDeTexto | null {
  const alfabeto = texto.match(
    new RegExp(`.{0,40}${ALFABETO_ESTRANHO.source}+.{0,40}`, 'u')
  );
  if (alfabeto) {
    return { motivo: 'caracteres de outro alfabeto no meio do texto', trecho: alfabeto[0] };
  }

  // U+FFFD é o que sobra de um byte que não decodificou; nunca é intencional.
  const substituicao = texto.match(/.{0,40}�+.{0,40}/u);
  if (substituicao) {
    return { motivo: 'caractere de substituição (encoding quebrado)', trecho: substituicao[0] };
  }

  return null;
}
