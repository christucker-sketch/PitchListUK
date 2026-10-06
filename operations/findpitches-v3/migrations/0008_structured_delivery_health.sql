CREATE TABLE structured_delivery_contacts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('rechecks','import')),
  environment TEXT NOT NULL CHECK(environment IN ('test','shadow')),
  received_at TEXT NOT NULL,
  records INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  batch_hash TEXT,
  source_last_checked TEXT
);
CREATE INDEX structured_delivery_recent ON structured_delivery_contacts(environment,kind,received_at);
CREATE TRIGGER structured_contacts_no_update BEFORE UPDATE ON structured_delivery_contacts
BEGIN SELECT RAISE(ABORT,'delivery_contact_immutable'); END;
CREATE TRIGGER structured_contacts_no_delete BEFORE DELETE ON structured_delivery_contacts
BEGIN SELECT RAISE(ABORT,'delivery_contact_retained'); END;
