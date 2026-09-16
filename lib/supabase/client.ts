import { createBrowserClient } from '@supabase/ssr';

// Cliente Supabase para o navegador. Usado no login (signInWithPassword),
// no SSO da Microsoft (signInWithOAuth) e no logout.
// A anon key é pública por design.
//
// `experimental.appendPkceFlowIdToRedirects` faz o auth-js anexar o
// `sb_flow_id` ao `redirectTo`, para que a rota de callback saiba QUAL fluxo
// PKCE está trocando o code.
//
// Sem a flag, o verifier ainda é gravado num slot por fluxo
// (`{storageKey}-flow-{id}-code-verifier`), mas o id não viaja: o servidor cai
// no slot legado de chave fixa (`{storageKey}-code-verifier`), que o auth-js
// sobrescreve a cada novo fluxo. Com um único fluxo em voo isso funciona; com
// dois (duplo clique no botão, duas abas, ou a pessoa voltando e tentando de
// novo) o slot legado guarda o verifier do ÚLTIMO fluxo, e o callback do
// primeiro troca o code com o verifier errado — o Supabase recusa e a tela
// fica em branco. Foi exatamente esse o padrão do incidente em produção:
// duas tentativas com ~48s de diferença, dois `code` distintos.
//
// A opção é marcada como experimental e pode mudar de nome ou sumir numa
// atualização do pacote. Isso NÃO derruba o login: se a flag deixar de
// existir, o `sb_flow_id` volta a não ser enviado e a rota de callback cai no
// caminho legado — o mesmo de hoje, que atende o caso de fluxo único. Por isso
// `app/auth/callback/route.ts` trata o `sb_flow_id` como opcional em vez de
// exigi-lo.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        experimental: { appendPkceFlowIdToRedirects: true },
      },
    },
  );
}
