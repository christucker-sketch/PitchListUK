CREATE TABLE producer_recheck_acknowledgements (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  requested_at TEXT NOT NULL,
  request_reason TEXT NOT NULL,
  producer_record_id TEXT NOT NULL,
  accepted_record_id TEXT NOT NULL REFERENCES producer_records(id),
  source_last_checked TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  UNIQUE(entity_id,requested_at)
);
CREATE INDEX producer_recheck_ack_time ON producer_recheck_acknowledgements(acknowledged_at);
CREATE TRIGGER producer_recheck_ack_no_update BEFORE UPDATE ON producer_recheck_acknowledgements BEGIN SELECT RAISE(ABORT,'recheck_ack_immutable'); END;
CREATE TRIGGER producer_recheck_ack_no_delete BEFORE DELETE ON producer_recheck_acknowledgements BEGIN SELECT RAISE(ABORT,'recheck_ack_immutable'); END;
CREATE TRIGGER producer_recheck_ack_no_replace BEFORE INSERT ON producer_recheck_acknowledgements WHEN EXISTS(SELECT 1 FROM producer_recheck_acknowledgements WHERE id=NEW.id OR (entity_id=NEW.entity_id AND requested_at=NEW.requested_at)) BEGIN SELECT RAISE(IGNORE); END;
