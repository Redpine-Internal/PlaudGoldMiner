-- Temas permanentes. Banco SISTEMA. Idempotente. Sem DROP.
--
-- O agrupamento nasceu como CACHE: cada reagrupamento fazia
-- `DELETE FROM app_business_themes` e recriava tudo com ids novos. Isso
-- funcionava enquanto o tema era só uma forma de exibir a lista, mas impede o
-- que o operador precisa: acompanhar um assunto AO LONGO DO TEMPO.
--
-- "Gestão de terceiros" apareceu em 34 conversas desde junho. Quando uma nova
-- reunião toca no assunto, o tema deve ficar mais forte — não virar um registro
-- novo que perde a prioridade marcada, as notas e a data em que foi visto pela
-- primeira vez.
--
-- Esta migração dá identidade estável ao tema. O reagrupamento passa a fazer
-- UPSERT por chave estável em vez de DELETE + INSERT.

-- Chave estável: nome normalizado (minúsculas, sem espaço duplicado). O modelo
-- reescreve o rationale a cada rodada, mas o nome do tema é estável — e quando
-- não é, o roteamento semântico (passo seguinte) é que decide a equivalência.
ALTER TABLE app_business_themes
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE app_business_themes
   SET slug = lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
 WHERE slug IS NULL;

-- Sem índice único o UPSERT não tem em que se apoiar.
CREATE UNIQUE INDEX IF NOT EXISTS app_business_themes_slug_key
  ON app_business_themes (slug);

-- Quando o assunto apareceu pela primeira vez e quando foi visto por último.
-- É o que responde "isso está crescendo ou esfriando?" — a pergunta que decide
-- perseguir um tema. Derivado das conversas, não da data do registro.
ALTER TABLE app_business_themes
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz;

-- Decisão do operador sobre o tema. Sobrevive ao reagrupamento — é justamente
-- o que se perdia a cada DELETE.
--   ativo      — em acompanhamento (padrão)
--   priorizado — escolhido para perseguir
--   arquivado  — decidiu não perseguir; fora da tela principal
ALTER TABLE app_business_themes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

ALTER TABLE app_business_themes
  DROP CONSTRAINT IF EXISTS app_business_themes_status_check;
ALTER TABLE app_business_themes
  ADD CONSTRAINT app_business_themes_status_check
  CHECK (status IN ('ativo', 'priorizado', 'arquivado'));

-- Anotação do operador sobre o tema (por que perseguir, com quem falar).
ALTER TABLE app_business_themes
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill das datas a partir das conversas que sustentam cada tema. Sem isso
-- os temas existentes nasceriam sem história e a tela mostraria "—".
WITH janela AS (
  SELECT m.theme_id,
         min(c.date) AS primeira,
         max(c.date) AS ultima
    FROM app_business_theme_members m
    JOIN app_opportunity_sources s ON s.opportunity_id = m.opportunity_id
    JOIN conversations c ON c.id::text = s.conversation_id::text
   GROUP BY m.theme_id
)
UPDATE app_business_themes t
   SET first_seen_at = COALESCE(t.first_seen_at, j.primeira),
       last_seen_at  = COALESCE(t.last_seen_at,  j.ultima)
  FROM janela j
 WHERE j.theme_id = t.id;

-- A tela ordena por status e por atividade recente.
CREATE INDEX IF NOT EXISTS app_business_themes_status_idx
  ON app_business_themes (status, last_seen_at DESC NULLS LAST);
