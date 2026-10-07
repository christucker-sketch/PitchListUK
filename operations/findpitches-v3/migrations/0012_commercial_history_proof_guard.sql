-- Cache updates can never manufacture a first proved READY KPI.
CREATE TRIGGER commercial_history_ready_proof BEFORE INSERT ON commercial_readiness_history
WHEN NEW.status='ready' AND NOT EXISTS (
 SELECT 1 FROM source_verifications v JOIN entities e ON e.id=v.entity_id
 WHERE v.id=NEW.verification_id AND v.entity_id=NEW.entity_id
 AND v.entity_revision=NEW.entity_revision AND e.revision=NEW.entity_revision
 AND e.environment='shadow' AND v.status='verified' AND v.verifier_version='source-proof-v1'
 AND json_array_length(json_extract(v.report_json,'$.reasons'))=0
 AND julianday(v.checked_at)<=julianday(NEW.occurred_at)
 AND julianday(v.expires_at)>julianday(NEW.occurred_at)
) BEGIN SELECT RAISE(IGNORE); END;
