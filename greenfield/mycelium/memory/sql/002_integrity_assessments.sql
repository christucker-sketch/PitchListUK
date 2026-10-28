-- 002: what the BRIX exchange of 28 Oct 2026 agreed (tasks MYC-20261028-001..004; see
-- greenfield/docs/mycelium/BRIX_MEMORY_COLLAB_RESULT_2026-10-28.md). Offline only; nothing is applied to any cloud database.
-- C5: asserted validity of an observation, separate from when it was recorded (recorded_at).
ALTER TABLE mycelium_memory.nodes
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN valid_to timestamptz,
  ADD CONSTRAINT nodes_validity_order CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from);
-- statement
-- X2: bounded payloads (the 1 GB ceiling is also guarded at admission by the API).
ALTER TABLE mycelium_memory.nodes
  ADD CONSTRAINT nodes_body_bound CHECK (octet_length(body) <= 65536),
  ADD CONSTRAINT nodes_title_bound CHECK (octet_length(title) <= 1024),
  ADD CONSTRAINT nodes_attributes_bound CHECK (octet_length(attributes::text) <= 16384),
  ADD CONSTRAINT nodes_provenance_bound CHECK (octet_length(provenance::text) <= 16384);
-- statement
ALTER TABLE mycelium_memory.edges
  ADD CONSTRAINT edges_attributes_bound CHECK (octet_length(attributes::text) <= 16384),
  ADD CONSTRAINT edges_provenance_bound CHECK (octet_length(provenance::text) <= 16384);
-- statement
-- C2 + turn 2 DDL + turn 3 fixes + turn 4 consolidation: a weighted, revisable stance on exactly one node OR edge.
CREATE TABLE mycelium_memory.assessments (
  id uuid PRIMARY KEY,
  node_id uuid REFERENCES mycelium_memory.nodes(id),
  edge_id uuid REFERENCES mycelium_memory.edges(id),
  stance text NOT NULL CHECK (stance IN ('supports','contradicts','neutral')),
  weight real NOT NULL CHECK (weight BETWEEN 0 AND 1),
  assessor text NOT NULL CHECK (btrim(assessor) <> '' AND octet_length(assessor) <= 256),
  basis_id uuid NOT NULL REFERENCES mycelium_memory.nodes(id),
  independence_key text NOT NULL CHECK (btrim(independence_key) <> '' AND octet_length(independence_key) <= 256),
  supersedes uuid REFERENCES mycelium_memory.assessments(id),
  valid_from timestamptz,
  valid_to timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(node_id, edge_id) = 1),
  CHECK (supersedes IS NULL OR supersedes <> id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);
-- statement
CREATE UNIQUE INDEX assessments_one_successor ON mycelium_memory.assessments (supersedes) WHERE supersedes IS NOT NULL;
-- statement
CREATE INDEX assessments_node_assessor_idx ON mycelium_memory.assessments (node_id, assessor) WHERE node_id IS NOT NULL;
-- statement
CREATE INDEX assessments_edge_assessor_idx ON mycelium_memory.assessments (edge_id, assessor) WHERE edge_id IS NOT NULL;
-- statement
CREATE INDEX assessments_basis_idx ON mycelium_memory.assessments (basis_id);
-- statement
-- Turn 4: supersession keeps subject and assessor. A superseded row must already exist (FK), so with immutable rows a
-- chain can never become a cycle; self-reference is rejected by the CHECK above.
CREATE FUNCTION mycelium_memory.check_supersession() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p mycelium_memory.assessments%ROWTYPE;
BEGIN
  IF NEW.supersedes IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO p FROM mycelium_memory.assessments WHERE id = NEW.supersedes;
  IF NOT FOUND THEN RETURN NEW; END IF;  -- the foreign key reports it
  IF p.node_id IS DISTINCT FROM NEW.node_id OR p.edge_id IS DISTINCT FROM NEW.edge_id OR p.assessor <> NEW.assessor THEN
    RAISE EXCEPTION 'an assessment may only supersede one with the same subject and assessor';
  END IF;
  RETURN NEW;
END $$;
-- statement
CREATE TRIGGER assessments_supersession BEFORE INSERT ON mycelium_memory.assessments
  FOR EACH ROW EXECUTE FUNCTION mycelium_memory.check_supersession();
-- statement
-- X1 + turn 3: append-only is enforced, not a convention. Defence in depth beside runtime SELECT/INSERT-only grants
-- (owners bypass grants, not triggers). No row of history can be changed or removed through SQL.
CREATE FUNCTION mycelium_memory.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'mycelium memory is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME; END $$;
-- statement
CREATE TRIGGER nodes_append_only BEFORE UPDATE OR DELETE ON mycelium_memory.nodes FOR EACH ROW EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE TRIGGER nodes_no_truncate BEFORE TRUNCATE ON mycelium_memory.nodes FOR EACH STATEMENT EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE TRIGGER edges_append_only BEFORE UPDATE OR DELETE ON mycelium_memory.edges FOR EACH ROW EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE TRIGGER edges_no_truncate BEFORE TRUNCATE ON mycelium_memory.edges FOR EACH STATEMENT EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE TRIGGER assessments_append_only BEFORE UPDATE OR DELETE ON mycelium_memory.assessments FOR EACH ROW EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE TRIGGER assessments_no_truncate BEFORE TRUNCATE ON mycelium_memory.assessments FOR EACH STATEMENT EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
-- Turn 3: current = heads (not superseded). Two heads for one (subject, assessor) are kept and reported, never merged.
CREATE VIEW mycelium_memory.assessment_heads AS
  SELECT a.* FROM mycelium_memory.assessments a
  WHERE NOT EXISTS (SELECT 1 FROM mycelium_memory.assessments s WHERE s.supersedes = a.id);
-- statement
REVOKE ALL ON ALL TABLES IN SCHEMA mycelium_memory FROM PUBLIC;
-- statement
REVOKE ALL ON FUNCTION mycelium_memory.check_supersession(), mycelium_memory.reject_mutation() FROM PUBLIC;
