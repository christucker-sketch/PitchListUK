-- Isolated D-014 production customer database; never apply to the preview/evidence database.
PRAGMA foreign_keys=ON;
CREATE TABLE customers(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,profile_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
CREATE TABLE login_challenges(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,next_path TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE customer_sessions(token_hash TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),expires_at TEXT NOT NULL,revoked_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE preview_access(token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE customer_rate_limits(key TEXT PRIMARY KEY,window TEXT NOT NULL,count INTEGER NOT NULL);
CREATE TABLE stripe_customers(customer_id TEXT PRIMARY KEY REFERENCES customers(id),stripe_id TEXT NOT NULL UNIQUE,livemode INTEGER NOT NULL CHECK(livemode=1),created_at TEXT NOT NULL);
CREATE TABLE stripe_subscriptions(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),stripe_customer_id TEXT NOT NULL,price_id TEXT NOT NULL,market TEXT NOT NULL CHECK(market='GLOBAL'),status TEXT NOT NULL,period_end TEXT,trial_end TEXT,cancel_at_period_end INTEGER NOT NULL,livemode INTEGER NOT NULL CHECK(livemode=1),checked_at TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency IN ('GBP','USD','EUR')),stripe_product_id TEXT NOT NULL);
CREATE INDEX stripe_subscription_customer ON stripe_subscriptions(customer_id);
CREATE TABLE checkout_attempts(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),market TEXT NOT NULL,created_at TEXT NOT NULL,stripe_session_id TEXT,checkout_url TEXT,completed_at TEXT,currency TEXT NOT NULL CHECK(currency IN ('GBP','USD','EUR')),price_id TEXT NOT NULL);
CREATE TABLE stripe_webhook_receipts(id TEXT PRIMARY KEY,type TEXT NOT NULL,livemode INTEGER NOT NULL CHECK(livemode=1),payload_hash TEXT NOT NULL,received_at TEXT NOT NULL,processed_at TEXT,error_code TEXT);
CREATE TABLE saved_opportunities(customer_id TEXT NOT NULL REFERENCES customers(id),entity_id TEXT NOT NULL,saved_at TEXT NOT NULL,PRIMARY KEY(customer_id,entity_id));
CREATE TABLE customer_alerts(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),name TEXT NOT NULL,query_json TEXT NOT NULL,frequency TEXT NOT NULL CHECK(frequency IN ('instant','daily','weekly')),paused INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE customer_inbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE customer_operation_events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,outcome TEXT NOT NULL,occurred_at TEXT NOT NULL);
CREATE TABLE preview_inventory_state(entity_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,visible INTEGER NOT NULL,proof_expires_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE preview_inventory_changes(sequence INTEGER PRIMARY KEY AUTOINCREMENT,entity_id TEXT NOT NULL,kind TEXT NOT NULL,occurred_at TEXT NOT NULL);
-- One canonical Checkout attempt across concurrent requests and calendar days.
CREATE TABLE checkout_reservations(customer_id TEXT PRIMARY KEY REFERENCES customers(id),attempt_id TEXT NOT NULL,expires_at TEXT NOT NULL);

CREATE TABLE customer_runtime(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode='production_public'),schema_version INTEGER NOT NULL CHECK(schema_version=1));
INSERT INTO customer_runtime VALUES(1,'production_public',1);
CREATE TRIGGER runtime_no_update BEFORE UPDATE ON customer_runtime BEGIN SELECT RAISE(ABORT,'immutable_runtime'); END;
CREATE TRIGGER runtime_no_delete BEFORE DELETE ON customer_runtime BEGIN SELECT RAISE(ABORT,'immutable_runtime'); END;
CREATE TRIGGER stripe_owner_no_update BEFORE UPDATE ON stripe_customers WHEN NEW.customer_id<>OLD.customer_id OR NEW.stripe_id<>OLD.stripe_id OR NEW.livemode<>OLD.livemode BEGIN SELECT RAISE(ABORT,'immutable_stripe_owner'); END;
CREATE TRIGGER subscription_owner_no_update BEFORE UPDATE ON stripe_subscriptions WHEN NEW.customer_id<>OLD.customer_id OR NEW.stripe_customer_id<>OLD.stripe_customer_id OR NEW.price_id<>OLD.price_id OR NEW.stripe_product_id<>OLD.stripe_product_id OR NEW.currency<>OLD.currency OR NEW.market<>OLD.market OR NEW.livemode<>OLD.livemode BEGIN SELECT RAISE(ABORT,'immutable_subscription_owner'); END;

CREATE TRIGGER subscription_owner_insert BEFORE INSERT ON stripe_subscriptions WHEN NOT EXISTS(SELECT 1 FROM stripe_customers WHERE customer_id=NEW.customer_id AND stripe_id=NEW.stripe_customer_id AND livemode=1) BEGIN SELECT RAISE(ABORT,'subscription_owner_required'); END;
CREATE TRIGGER stripe_owner_no_delete BEFORE DELETE ON stripe_customers BEGIN SELECT RAISE(ABORT,'retain_stripe_owner'); END;
CREATE TRIGGER webhook_receipt_immutable BEFORE UPDATE ON stripe_webhook_receipts WHEN NEW.id<>OLD.id OR NEW.livemode<>OLD.livemode OR NEW.payload_hash<>OLD.payload_hash OR NEW.type<>OLD.type BEGIN SELECT RAISE(ABORT,'immutable_webhook_receipt'); END;
