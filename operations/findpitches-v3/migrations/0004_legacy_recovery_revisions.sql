-- Preserve an earlier recovery attempt when improved evidence rules supersede it.
ALTER TABLE legacy_recovery_runs ADD COLUMN superseded_by TEXT REFERENCES legacy_recovery_runs(id);
