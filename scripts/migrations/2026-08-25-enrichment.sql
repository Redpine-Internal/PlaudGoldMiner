-- Enriquecimento de ideias. Banco SISTEMA. Idempotente. Sem DROP.
CREATE TABLE IF NOT EXISTS app_idea_enrichment (
  id            uuid PRIMARY KEY,
  source_type   text NOT NULL,
  source_id     text NOT NULL,
  interesting   boolean NOT NULL DEFAULT false,
  notes         text,
  text_override text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_idea_enrichment_source_uidx
  ON app_idea_enrichment (source_type, source_id);

CREATE INDEX IF NOT EXISTS app_idea_enrichment_interesting_idx
  ON app_idea_enrichment (interesting);

CREATE TABLE IF NOT EXISTS app_idea_enrichment_reference (
  id            uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES app_idea_enrichment(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  title         text,
  url           text NOT NULL,
  storage_path  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_idea_enrichment_reference_eid_idx
  ON app_idea_enrichment_reference (enrichment_id);
