-- Historical pilot scheduler rows are obsolete now that the global geography catalogue
-- owns scheduler reconciliation. Deploy applies migration files idempotently on every run,
-- so this migration must converge old databases instead of re-seeding the three pilots.
DELETE FROM scheduler_jobs WHERE id LIKE 'shadow-%';
