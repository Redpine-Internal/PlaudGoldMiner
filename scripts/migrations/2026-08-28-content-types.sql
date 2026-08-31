-- Nova taxonomia de conteúdo: tipo (formato) + subtipo (variação livre).
--
-- A coluna `platform` deixa de ser "onde publica" e passa a ser o FORMATO do
-- conteúdo: artigo | post | carrossel | roteiro. O canal (LinkedIn, YouTube,
-- blog...) vira `subtype`, que é texto livre para não travar o vocabulário.
--
-- Mapeamento das linhas existentes:
--   linkedin -> post     (subtype LinkedIn)
--   youtube  -> roteiro  (subtype YouTube)
--   blog     -> artigo   (sem subtype)
--   artigo   -> artigo   (inalterado)

BEGIN;

ALTER TABLE app_contents ADD COLUMN IF NOT EXISTS subtype text;

UPDATE app_contents SET subtype = 'LinkedIn', platform = 'post'
 WHERE platform = 'linkedin';

UPDATE app_contents SET subtype = 'YouTube', platform = 'roteiro'
 WHERE platform = 'youtube';

UPDATE app_contents SET platform = 'artigo'
 WHERE platform = 'blog';

COMMIT;
