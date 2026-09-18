/**
 * Limpeza dos cookies de code verifier do PKCE.
 *
 * O auth-js guarda cada verifier num slot endereçado pelo id do fluxo
 * (`{storageKey}-flow-{id}-code-verifier`) e mantém um índice para evictar os
 * mais antigos, limitando a PKCE_MAX_CONCURRENT_FLOWS (5) os slots vivos. Esse
 * índice é lido-modificado-escrito sem trava: duas aberturas concorrentes (duas
 * abas, duplo clique no botão de entrar) podem perder uma atualização. O fluxo
 * perdedor ainda funciona — seu slot é endereçado direto pela chave — mas fica
 * fora do índice, e por isso escapa tanto da eviction quanto do
 * `removeAllPKCEVerifiers` do teardown. Cada corrida deixa um órfão que só
 * expira com o max age do cookie.
 *
 * Órfãos acumulados engordam o header `Cookie` de toda requisição ao domínio.
 * Somados ao cookie de sessão, levaram o header ao teto de 16KB do Node, que
 * passou a responder 431 — tela branca após um SSO bem-sucedido.
 *
 * Depois de uma troca bem-sucedida não existe fluxo PKCE pendente legítimo:
 * o code virou sessão. Todo verifier remanescente é lixo, inclusive os órfãos
 * invisíveis ao índice. Varrer os cookies pelo sufixo alcança o que o auth-js
 * estruturalmente não consegue alcançar.
 */

/**
 * Sufixo comum a todas as chaves de verifier: os slots por fluxo
 * (`-flow-{id}-code-verifier`), a chave legada de posição fixa
 * (`-code-verifier`) e o índice de fluxos (`-flows-code-verifier`).
 *
 * O @supabase/ssr fatia cookies grandes como `{chave}.{n}`, então os pedaços
 * terminam em `.0`, `.1` — e não no sufixo. Um verifier tem ~90 bytes e nunca
 * é fatiado na prática, mas o padrão aceita o sufixo seguido de um índice de
 * chunk para que a limpeza não deixe metade de um cookie para trás caso isso
 * mude.
 */
const VERIFIER_COOKIE_PATTERN = /-code-verifier(\.\d+)?$/;

/**
 * Nomes de cookie a apagar após a troca do code pela sessão.
 *
 * Recebe os nomes já presentes na requisição em vez de ler o cookie store:
 * mantém a decisão pura e testável, e deixa o efeito colateral na rota.
 */
export function staleVerifierCookieNames(cookieNames: readonly string[]): string[] {
  return cookieNames.filter((name) => VERIFIER_COOKIE_PATTERN.test(name));
}
