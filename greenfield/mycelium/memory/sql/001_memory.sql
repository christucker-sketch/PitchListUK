CREATE SCHEMA mycelium_memory;
-- statement
REVOKE ALL ON SCHEMA mycelium_memory FROM PUBLIC;
-- statement
CREATE TABLE mycelium_memory.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE mycelium_memory.nodes (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (length(btrim(kind)) > 0),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  observed_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE mycelium_memory.edges (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES mycelium_memory.nodes(id),
  target_id uuid NOT NULL REFERENCES mycelium_memory.nodes(id),
  relation text NOT NULL CHECK (length(btrim(relation)) > 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX nodes_kind_recorded_idx ON mycelium_memory.nodes (kind, recorded_at DESC);
-- statement
CREATE INDEX edges_source_relation_idx ON mycelium_memory.edges (source_id, relation);
-- statement
CREATE INDEX edges_target_relation_idx ON mycelium_memory.edges (target_id, relation);
-- statement
REVOKE ALL ON ALL TABLES IN SCHEMA mycelium_memory FROM PUBLIC;
