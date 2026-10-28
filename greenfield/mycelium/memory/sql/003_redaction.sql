-- Sanctioned exception to append-only payloads. Identity/topology remain; original content is not audited/copied.
CREATE TABLE mycelium_memory.redactions (
  id uuid PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('node','edge','assessment')),
  subject_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('credential','privacy','legal','owner_request')),
  requested_by name NOT NULL DEFAULT session_user,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id)
);
-- statement
-- Private, transaction-local capability: runtime cannot insert one; each token is consumed by exactly one UPDATE.
CREATE TABLE mycelium_memory.redaction_authorizations (
  backend integer NOT NULL,
  transaction_id bigint NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  PRIMARY KEY (backend, transaction_id, table_name, row_id)
);
-- statement
REVOKE ALL ON mycelium_memory.redactions, mycelium_memory.redaction_authorizations FROM PUBLIC;
-- statement
CREATE OR REPLACE FUNCTION mycelium_memory.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, mycelium_memory AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME IN ('nodes','edges','assessments') THEN
    DELETE FROM mycelium_memory.redaction_authorizations
      WHERE backend = pg_backend_pid() AND transaction_id = txid_current()
        AND table_name = TG_TABLE_NAME AND row_id = OLD.id;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'mycelium memory is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END $$;
-- statement
CREATE TRIGGER redactions_append_only BEFORE UPDATE OR DELETE ON mycelium_memory.redactions
  FOR EACH ROW EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE TRIGGER redactions_no_truncate BEFORE TRUNCATE ON mycelium_memory.redactions
  FOR EACH STATEMENT EXECUTE FUNCTION mycelium_memory.reject_mutation();
-- statement
CREATE FUNCTION mycelium_memory.redact(p_type text, p_subject uuid, p_reason text, p_event uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, mycelium_memory AS $$
DECLARE prior uuid; target_table text;
BEGIN
  target_table := CASE p_type WHEN 'node' THEN 'nodes' WHEN 'edge' THEN 'edges' WHEN 'assessment' THEN 'assessments' END;
  IF target_table IS NULL OR p_reason IS NULL OR p_reason NOT IN ('credential','privacy','legal','owner_request')
    OR p_subject IS NULL OR p_event IS NULL THEN RAISE EXCEPTION 'invalid redaction request'; END IF;
  -- Serializes concurrent requests on the same subject. Does not expose the original row/payload.
  EXECUTE format('SELECT id FROM mycelium_memory.%I WHERE id=$1 FOR UPDATE', target_table) INTO prior USING p_subject;
  IF prior IS NULL THEN RAISE EXCEPTION 'redaction subject not found'; END IF;
  SELECT id INTO prior FROM mycelium_memory.redactions WHERE subject_type=p_type AND subject_id=p_subject;
  IF FOUND THEN RETURN prior; END IF;
  INSERT INTO mycelium_memory.redactions(id,subject_type,subject_id,reason_code)
    VALUES(p_event,p_type,p_subject,p_reason);
  INSERT INTO mycelium_memory.redaction_authorizations VALUES(pg_backend_pid(),txid_current(),target_table,p_subject);
  IF p_type='node' THEN
    UPDATE mycelium_memory.nodes SET kind='redacted', title='[redacted]', body='', attributes='{}', provenance='{}' WHERE id=p_subject;
  ELSIF p_type='edge' THEN
    UPDATE mycelium_memory.edges SET relation='redacted', attributes='{}', provenance='{}' WHERE id=p_subject;
  ELSE
    UPDATE mycelium_memory.assessments SET stance='neutral', weight=0, assessor='redacted',
      independence_key='redacted:' || id::text WHERE id=p_subject;
  END IF;
  RETURN p_event;
END $$;
-- statement
REVOKE ALL ON FUNCTION mycelium_memory.redact(text,uuid,text,uuid) FROM PUBLIC;
-- statement
-- Atomic idempotency guard usable by the batch HTTPS transaction adapter; FALSE/NULL aborts the entire transaction.
CREATE FUNCTION mycelium_memory.require_identical_retry(p_same boolean) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF p_same IS DISTINCT FROM true THEN RAISE EXCEPTION 'id already exists with a different payload; nothing written'; END IF;
  RETURN true;
END $$;
-- statement
REVOKE ALL ON FUNCTION mycelium_memory.reject_mutation() FROM PUBLIC;

-- statement
REVOKE ALL ON FUNCTION mycelium_memory.require_identical_retry(boolean) FROM PUBLIC;
