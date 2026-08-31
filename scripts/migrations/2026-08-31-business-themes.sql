-- Temas de negócio e prioridade. Banco SISTEMA. Idempotente. Sem DROP.
--
-- Um tema agrupa negócios que são a mesma oferta escrita com títulos
-- diferentes ("Programa de cultura, liderança e percepção de risco" e
-- "Fortalecimento da cultura e liderança em segurança" são um só). O
-- agrupamento vem de uma chamada de IA e é CACHEADO aqui — sem cache, abrir a
-- página gastaria cota da Azure toda vez.

CREATE TABLE IF NOT EXISTS app_business_themes (
  id          text PRIMARY KEY,
  -- Nome curto do tema, como aparece no cabeçalho do grupo.
  name        text NOT NULL,
  -- Uma frase dizendo o que une os negócios do grupo. É o que justifica a
  -- decisão de perseguir o tema, então precisa ser legível sem abrir os cards.
  rationale   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Vínculo negócio→tema. Tabela separada (em vez de uma coluna em
-- app_opportunities) porque app_opportunities é reescrita pelo gerador e por
-- rotas que não sabem de tema; manter o vínculo fora evita que uma dessas
-- rotas apague o agrupamento sem querer.
--
-- Um negócio pertence a no máximo um tema, daí opportunity_id ser a PK.
CREATE TABLE IF NOT EXISTS app_business_theme_members (
  opportunity_id text PRIMARY KEY
                 REFERENCES app_opportunities(id) ON DELETE CASCADE,
  theme_id       text NOT NULL
                 REFERENCES app_business_themes(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_business_theme_members_theme_idx
  ON app_business_theme_members (theme_id);

-- Prioridade marcada à mão. Fica em app_opportunities porque é atributo do
-- negócio, não do agrupamento: a marca precisa sobreviver a um reagrupamento.
-- NULL = não priorizado, o estado da maioria.
ALTER TABLE app_opportunities
  ADD COLUMN IF NOT EXISTS priority text;
