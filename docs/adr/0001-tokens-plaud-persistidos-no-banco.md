# Tokens do Plaud persistidos no banco (app_plaud_tokens)

A ingestão diária automática precisa autenticar no Plaud sem ninguém logado; guardar tokens em arquivo local (`~/.plaud/tokens*.json`) não funciona para um job agendado no Cloud Scheduler nem sobrevive a redeploys. Decidimos persistir access/refresh tokens na tabela `app_plaud_tokens` no Supabase Postgres, com renovação single-flight (uma renovação por vez, os demais chamadores aguardam e reusam o token novo).

**Considered options:** (a) stateless com re-login manual quando o token expira — rejeitado porque quebra a garantia "todas as gravações chegam sempre" sem intervenção humana; (b) secret manager externo — rejeitado por adicionar infraestrutura nova para um único segredo rotativo que o próprio app já precisa ler/escrever a cada refresh.

**Consequences:** a tabela contém credenciais vivas — nunca imprimir seu conteúdo em logs, respostas ou verificações; acesso só via role de serviço do sistema (`SUPABASE_*_SISTEMA`). Se o refresh token for revogado no Plaud, é preciso um re-login manual único para repovoar a linha.
