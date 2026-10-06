-- Additive V3-only indexes for source recovery and identity/readiness auditing.
CREATE INDEX source_facts_record ON source_facts(record_id,field_name);
CREATE INDEX entity_records_entity ON entity_records(entity_id,record_id);
CREATE INDEX reconciliation_entity_outcome ON reconciliation_decisions(entity_id,outcome,created_at,record_id);
CREATE INDEX selection_audit_proposed_fact ON selection_audit(proposed_fact_id,decision,reason);
