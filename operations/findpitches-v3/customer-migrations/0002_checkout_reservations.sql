-- One canonical Checkout attempt across concurrent requests and calendar days.
CREATE TABLE checkout_reservations(customer_id TEXT PRIMARY KEY REFERENCES customers(id),attempt_id TEXT NOT NULL,expires_at TEXT NOT NULL);
