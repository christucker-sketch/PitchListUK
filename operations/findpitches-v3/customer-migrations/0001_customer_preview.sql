-- Separate V3 customer database. No evidence, legacy store or live billing rows.
PRAGMA foreign_keys=ON;
CREATE TABLE customers(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,profile_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
CREATE TABLE login_challenges(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,next_path TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE customer_sessions(token_hash TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),expires_at TEXT NOT NULL,revoked_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE preview_access(token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE customer_rate_limits(key TEXT PRIMARY KEY,window TEXT NOT NULL,count INTEGER NOT NULL);
CREATE TABLE stripe_customers(customer_id TEXT PRIMARY KEY REFERENCES customers(id),stripe_id TEXT NOT NULL UNIQUE,livemode INTEGER NOT NULL CHECK(livemode=0),created_at TEXT NOT NULL);
CREATE TABLE stripe_subscriptions(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),stripe_customer_id TEXT NOT NULL,price_id TEXT NOT NULL,market TEXT NOT NULL,status TEXT NOT NULL,period_end TEXT,trial_end TEXT,cancel_at_period_end INTEGER NOT NULL,livemode INTEGER NOT NULL CHECK(livemode=0),checked_at TEXT NOT NULL);
CREATE INDEX stripe_subscription_customer ON stripe_subscriptions(customer_id);
CREATE TABLE checkout_attempts(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),market TEXT NOT NULL,created_at TEXT NOT NULL,stripe_session_id TEXT,checkout_url TEXT,completed_at TEXT);
CREATE TABLE stripe_webhook_receipts(id TEXT PRIMARY KEY,type TEXT NOT NULL,livemode INTEGER NOT NULL CHECK(livemode=0),payload_hash TEXT NOT NULL,received_at TEXT NOT NULL,processed_at TEXT,error_code TEXT);
CREATE TABLE saved_opportunities(customer_id TEXT NOT NULL REFERENCES customers(id),entity_id TEXT NOT NULL,saved_at TEXT NOT NULL,PRIMARY KEY(customer_id,entity_id));
CREATE TABLE customer_alerts(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),name TEXT NOT NULL,query_json TEXT NOT NULL,frequency TEXT NOT NULL CHECK(frequency IN ('instant','daily','weekly')),paused INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE customer_inbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE customer_operation_events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,outcome TEXT NOT NULL,occurred_at TEXT NOT NULL);
CREATE TABLE preview_inventory_state(entity_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,visible INTEGER NOT NULL,proof_expires_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE preview_inventory_changes(sequence INTEGER PRIMARY KEY AUTOINCREMENT,entity_id TEXT NOT NULL,kind TEXT NOT NULL,occurred_at TEXT NOT NULL);
