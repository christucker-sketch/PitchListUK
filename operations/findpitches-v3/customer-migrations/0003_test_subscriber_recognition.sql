-- Reviewed synthetic TEST associations only. No live subscriber import.
CREATE TABLE subscriber_associations (
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id),
 stripe_customer_id TEXT NOT NULL UNIQUE,
 stripe_subscription_id TEXT NOT NULL UNIQUE,
 price_id TEXT NOT NULL,
 market TEXT NOT NULL CHECK(market='GB'),
 legacy_vendor_id TEXT NOT NULL,
 ownership_evidence_hash TEXT NOT NULL CHECK(length(ownership_evidence_hash)=64),
 scope TEXT NOT NULL CHECK(scope='synthetic_test'),
 livemode INTEGER NOT NULL CHECK(livemode=0),
 reviewed_at TEXT NOT NULL
);
CREATE TABLE subscriber_recognition_decisions (
 id TEXT PRIMARY KEY,
 association_id TEXT NOT NULL REFERENCES subscriber_associations(id),
 canonical_hash TEXT NOT NULL,
 status TEXT NOT NULL,
 period_end TEXT,
 cancel_at_period_end INTEGER NOT NULL,
 checked_at TEXT NOT NULL
);
CREATE TRIGGER association_synthetic_owner BEFORE INSERT ON subscriber_associations
WHEN NOT EXISTS(SELECT 1 FROM customers c JOIN login_challenges l ON l.email=c.email
 WHERE c.id=NEW.customer_id AND l.consumed_at IS NOT NULL
 AND (c.email GLOB '*@example.com' OR c.email GLOB '*@example.org' OR c.email GLOB '*@example.net'))
BEGIN SELECT RAISE(ABORT,'verified_synthetic_owner_required'); END;
CREATE TRIGGER association_existing_mapping BEFORE INSERT ON subscriber_associations
WHEN EXISTS(SELECT 1 FROM stripe_customers s WHERE
 (s.customer_id=NEW.customer_id AND s.stripe_id<>NEW.stripe_customer_id)
 OR (s.stripe_id=NEW.stripe_customer_id AND s.customer_id<>NEW.customer_id))
BEGIN SELECT RAISE(ABORT,'subscriber_mapping_conflict'); END;
CREATE TRIGGER association_pending_checkout BEFORE INSERT ON subscriber_associations
WHEN EXISTS(SELECT 1 FROM checkout_reservations WHERE customer_id=NEW.customer_id AND expires_at>NEW.reviewed_at)
 OR EXISTS(SELECT 1 FROM checkout_attempts WHERE customer_id=NEW.customer_id AND completed_at IS NULL)
BEGIN SELECT RAISE(ABORT,'pending_checkout_requires_review'); END;
CREATE TRIGGER association_update BEFORE UPDATE ON subscriber_associations BEGIN SELECT RAISE(ABORT,'subscriber_association_immutable'); END;
CREATE TRIGGER association_delete BEFORE DELETE ON subscriber_associations BEGIN SELECT RAISE(ABORT,'subscriber_association_immutable'); END;
CREATE TRIGGER association_replace BEFORE INSERT ON subscriber_associations
WHEN EXISTS(SELECT 1 FROM subscriber_associations WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER recognition_decision_update BEFORE UPDATE ON subscriber_recognition_decisions BEGIN SELECT RAISE(ABORT,'recognition_decision_immutable'); END;
CREATE TRIGGER recognition_decision_delete BEFORE DELETE ON subscriber_recognition_decisions BEGIN SELECT RAISE(ABORT,'recognition_decision_immutable'); END;
CREATE TRIGGER recognition_decision_replace BEFORE INSERT ON subscriber_recognition_decisions
WHEN EXISTS(SELECT 1 FROM subscriber_recognition_decisions WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER stripe_mapping_association BEFORE INSERT ON stripe_customers
WHEN EXISTS(SELECT 1 FROM subscriber_associations a WHERE
 (a.customer_id=NEW.customer_id AND a.stripe_customer_id<>NEW.stripe_id)
 OR (a.stripe_customer_id=NEW.stripe_id AND a.customer_id<>NEW.customer_id))
BEGIN SELECT RAISE(ABORT,'subscriber_mapping_conflict'); END;
CREATE TRIGGER stripe_mapping_update BEFORE UPDATE ON stripe_customers BEGIN SELECT RAISE(ABORT,'stripe_owner_mapping_immutable'); END;
CREATE TRIGGER stripe_mapping_delete BEFORE DELETE ON stripe_customers BEGIN SELECT RAISE(ABORT,'stripe_owner_mapping_immutable'); END;
CREATE TRIGGER recognized_checkout_reservation BEFORE INSERT ON checkout_reservations
WHEN EXISTS(SELECT 1 FROM subscriber_associations WHERE customer_id=NEW.customer_id)
BEGIN SELECT RAISE(ABORT,'recognized_subscriber_checkout_forbidden'); END;
CREATE TRIGGER recognized_checkout_reservation_update BEFORE UPDATE ON checkout_reservations
WHEN EXISTS(SELECT 1 FROM subscriber_associations WHERE customer_id=NEW.customer_id)
BEGIN SELECT RAISE(ABORT,'recognized_subscriber_checkout_forbidden'); END;
CREATE TRIGGER stripe_subscription_identity BEFORE UPDATE OF customer_id,stripe_customer_id,livemode ON stripe_subscriptions
WHEN OLD.customer_id<>NEW.customer_id OR OLD.stripe_customer_id<>NEW.stripe_customer_id OR OLD.livemode<>NEW.livemode
BEGIN SELECT RAISE(ABORT,'stripe_subscription_identity_immutable'); END;
