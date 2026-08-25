# Autenticação por E-mail/Senha (Supabase Auth) — Design

**Data:** 2026-08-25
**Objetivo:** Proteger o sistema (hoje 100% público no Cloud Run) com login por e-mail/senha, usando o **Supabase Auth** nativo. Sem OAuth para o login. Usuários criados/gerenciados pelo painel do Supabase.

---

## Contexto atual

- Next.js 16 (App Router), React 19, TypeScript. Deploy no Cloud Run (`plaudgoldminer`), imagem standalone.
- Dados via **Drizzle + `pg` pool** direto no Postgres do Supabase SISTEMA (`MEETINGS_DATABASE_URL`). Isso **não muda**.
- **NextAuth v5** existe, mas hoje serve só ao **Google/Drive** (`session.accessToken` alimenta `/api/drive/*`). Nunca protegeu o app (não há middleware).
- Não existe `middleware.ts`. O app é público.
- O Sidebar já tem um item **"Sair"** inerte (`<a href="#sair">`) pronto para ser ligado.
- `.env` já contém `SUPABASE_URL_SISTEMA` e `SUPABASE_ANON_KEY_SISTEMA` (projeto ref `rxugnepuvdhsmibakyij`). **Sempre usar `_SISTEMA`, nunca `_EMBEDINGS`.**

## Decisão de arquitetura

**Usar Supabase Auth** (login nativo) em vez de tabela própria + bcrypt + NextAuth Credentials. Motivo: é a opção mais segura para "login simples" — hash de senha, rate limiting anti-força-bruta, rotação de token e gestão de usuários vêm prontos e mantidos pelo Supabase, em vez de código de segurança escrito e mantido à mão.

**Google/Drive fica isolado e descartável.** O login do sistema passa a ser Supabase Auth; o NextAuth Google permanece apenas como conexão opcional do Drive (`GoogleConnectButton`). O Drive será possivelmente removido no futuro — o desacoplamento torna esse corte cirúrgico.

## Componentes (arquivos)

- **`lib/supabase/client.ts`** — browser client (`createBrowserClient` de `@supabase/ssr`), usa `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Responsável por `signInWithPassword` / `signOut` no navegador.
- **`lib/supabase/server.ts`** — server client (`createServerClient` de `@supabase/ssr`) que lê/escreve cookies via `next/headers`. Responsável por `getUser()` no servidor (rotas, server components).
- **`middleware.ts`** (raiz) — refresca a sessão e **protege todas as rotas**. Sem sessão → redirect `/login`. Liberadas: `/login`, `/_next/*`, assets estáticos, favicon, e `/api/auth/*` (NextAuth/Google do Drive).
- **`app/login/page.tsx`** — tela de login (e-mail + senha). Sucesso → redirect `/`. Falha → mensagem genérica "E-mail ou senha inválidos." Não revela se o e-mail existe.
- **`app/auth/signout/route.ts`** — rota POST que faz `signOut` no servidor (limpa cookies) e redireciona para `/login`.
- **`components/layout/Sidebar.tsx`** (modificar) — ligar o item "Sair" existente ao signout. Mostrar o e-mail real do usuário no rodapé (substituir `andreza@example.com` fixo).

## Fluxo de dados

1. Usuário acessa qualquer rota → `middleware.ts` lê cookies via server client → sem sessão → `/login`.
2. `/login` chama `supabase.auth.signInWithPassword({ email, password })` no browser client → Supabase grava sessão em cookies httpOnly.
3. Redirect para `/` → middleware agora encontra sessão → libera.
4. "Sair" → POST `/auth/signout` → `signOut()` limpa cookies → `/login`.
5. Drive: inalterado. `GoogleConnectButton` → `signIn('google')` (NextAuth) → `session.accessToken` → `/api/drive/*`.

## Tratamento de erros

- Login inválido: mensagem única e genérica, sem distinguir e-mail inexistente de senha errada.
- Erros de rede no login: mensagem "Não foi possível entrar. Tente novamente."
- Middleware nunca "vaza" rota protegida: em qualquer dúvida sobre a sessão, redireciona para `/login`.

## Variáveis de ambiente (novas)

O SDK do browser exige prefixo `NEXT_PUBLIC_`:

- `NEXT_PUBLIC_SUPABASE_URL` = mesmo valor de `SUPABASE_URL_SISTEMA`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = mesmo valor de `SUPABASE_ANON_KEY_SISTEMA`

A `anon key` é pública por design → pode ir como env var comum (não-secreta) no `cloudbuild.yaml`. A `service_role` **não** é usada neste fluxo.

## Gestão de usuários

Feita **no painel do Supabase** (Authentication → Users → Add user). Sem tela de admin, sem seed, sem tabela `app_users` nesta versão. Extensível depois (tela de admin usando `service_role` via Secret Manager) se desejado.

## Testes / verificação

Projeto **não tem framework de testes**. Verificação:
- `npx tsc --noEmit` → exit 0 (autoridade; ignorar falsos-positivos de LSP sobre `@/components/ds`).
- `npm run build` → sucesso (standalone).
- Smoke local (`npm run dev`): rota protegida sem login redireciona a `/login`; login com usuário válido do painel entra; "Sair" volta a `/login`; Drive (se conectado) segue funcionando.

## Deploy

Após implementar e verificar: adicionar as duas env vars ao `cloudbuild.yaml` e **rebuild + redeploy** no Cloud Run.

## Caminho de remoção do Drive (futuro, fora deste escopo)

Quando o Drive for removido: apagar `lib/drive/`, `app/api/drive/`, `components/drive/`, `GoogleConnectButton`, e o provider Google de `lib/auth/config.ts`. O login por e-mail/senha (Supabase Auth) permanece intacto.

## Fora de escopo

- Reset de senha por e-mail, confirmação de e-mail, MFA (disponíveis no Supabase; podem ser ligados depois).
- Tela de gestão de usuários dentro do app.
- Papéis/roles e autorização por permissão (todos os usuários autenticados têm acesso pleno nesta versão).
