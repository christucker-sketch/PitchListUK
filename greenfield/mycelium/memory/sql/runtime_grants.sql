-- Separate explicitly approved role-setup step AFTER migrations. Cluster role names are checked, never adopted/replaced.
-- NOLOGIN deliberately avoids generating/resetting credentials. No application dispatch is enabled.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('mycelium_memory_runtime','mycelium_memory_redactor')) THEN
    RAISE EXCEPTION 'Mycelium role names already exist; inspect before proceeding';
  END IF;
END $$;
-- statement
CREATE ROLE mycelium_memory_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
-- statement
CREATE ROLE mycelium_memory_redactor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
-- statement
GRANT USAGE ON SCHEMA mycelium_memory TO mycelium_memory_runtime, mycelium_memory_redactor;
-- statement
GRANT SELECT, INSERT ON mycelium_memory.nodes, mycelium_memory.edges, mycelium_memory.assessments TO mycelium_memory_runtime;
-- statement
GRANT SELECT ON mycelium_memory.assessment_heads, mycelium_memory.redactions TO mycelium_memory_runtime;
-- statement
GRANT EXECUTE ON FUNCTION mycelium_memory.require_identical_retry(boolean) TO mycelium_memory_runtime;
-- statement
GRANT EXECUTE ON FUNCTION mycelium_memory.redact(text,uuid,text,uuid) TO mycelium_memory_redactor;
