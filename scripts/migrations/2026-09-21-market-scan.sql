-- Leitura de mercado por tema. Banco SISTEMA. Idempotente. Sem DROP.
--
-- A recorrência diz que o assunto aparece nas conversas; não diz se vale
-- perseguir. Um tema muito citado cujo mercado já tem as grandes consultorias
-- é disputa cara; um tema menos citado sem ninguém especializado é campo
-- aberto. Sem essa coluna a tela ordena por demanda e ignora a concorrência.
--
-- O resultado é CACHEADO porque cada varredura custa uma busca na web mais um
-- julgamento, e o mercado não muda de um dia para o outro. A data de quando
-- foi medido acompanha o valor — uma leitura de seis meses atrás não deve ser
-- lida como se fosse de hoje.

ALTER TABLE app_business_themes
  -- 0 a 3: de "ninguém oferece" a "mercado consolidado".
  ADD COLUMN IF NOT EXISTS market_saturation     real,
  -- Concentração da distribuição; baixa significa que os resultados não
  -- deixaram claro, e a leitura merece conferência à mão.
  ADD COLUMN IF NOT EXISTS market_confidence     real,
  -- Probabilidade de haver grande consultoria entre os fornecedores achados.
  ADD COLUMN IF NOT EXISTS market_big_players    real,
  -- A busca achou conteúdo sobre o tema em vez de ofertas comerciais. Sem esta
  -- marca, "não achei fornecedor" viraria "não existe fornecedor" na tela.
  ADD COLUMN IF NOT EXISTS market_content_only   boolean,
  -- As páginas que sustentam a leitura: [{title, url}]. O operador confere na
  -- fonte em vez de confiar no número.
  ADD COLUMN IF NOT EXISTS market_sources        jsonb,
  ADD COLUMN IF NOT EXISTS market_scanned_at     timestamptz;

-- A tela mostra primeiro os temas com leitura recente; e a varredura em lote
-- precisa achar rápido os que nunca foram medidos.
CREATE INDEX IF NOT EXISTS app_business_themes_market_idx
  ON app_business_themes (market_scanned_at DESC NULLS LAST);
