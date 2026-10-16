-- Additive V3-only custody. No subscription/customer ownership changes.
CREATE TABLE billing_operations(
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
 subscription_id TEXT NOT NULL REFERENCES stripe_subscriptions(id),
 kind TEXT NOT NULL CHECK(kind IN ('cancel','resume','payment')),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 stripe_session_id TEXT UNIQUE, checkout_url TEXT, completed_at TEXT
);
CREATE INDEX billing_operations_customer ON billing_operations(customer_id,created_at);
CREATE TRIGGER billing_operation_owner_immutable BEFORE UPDATE ON billing_operations
 WHEN NEW.id<>OLD.id OR NEW.customer_id<>OLD.customer_id OR NEW.subscription_id<>OLD.subscription_id
 OR NEW.kind<>OLD.kind OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at
 OR (OLD.stripe_session_id IS NOT NULL AND NEW.stripe_session_id IS NOT OLD.stripe_session_id)
 OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS NOT OLD.completed_at)
 BEGIN SELECT RAISE(ABORT,'immutable_billing_operation'); END;
CREATE TRIGGER billing_operation_owner_required BEFORE INSERT ON billing_operations
 WHEN NOT EXISTS(SELECT 1 FROM stripe_subscriptions WHERE id=NEW.subscription_id AND customer_id=NEW.customer_id AND livemode=1)
 BEGIN SELECT RAISE(ABORT,'billing_operation_owner_required'); END;
