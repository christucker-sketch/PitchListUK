-- Central, operator-issued UK-only paid authority. Defaults stay paused.
CREATE TABLE uk_paid_campaigns (
 id TEXT PRIMARY KEY, budget_day TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','paused','complete')),
 max_queries INTEGER NOT NULL CHECK(max_queries BETWEEN 1 AND 25),
 max_credits INTEGER NOT NULL CHECK(max_credits=max_queries),
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json)), actor TEXT NOT NULL CHECK(actor='codex'),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 reviewed_campaign_id TEXT REFERENCES uk_paid_campaigns(id),
 next_query INTEGER NOT NULL DEFAULT 0 CHECK(next_query BETWEEN 0 AND 25),
 baseline_ready_sequence INTEGER NOT NULL CHECK(baseline_ready_sequence>=0),
 stop_reason TEXT, review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1)),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uk_paid_campaign_single_active ON uk_paid_campaigns(status) WHERE status='active';
CREATE TRIGGER uk_campaign_scope_immutable BEFORE UPDATE ON uk_paid_campaigns WHEN
 NEW.id<>OLD.id OR NEW.budget_day<>OLD.budget_day OR NEW.max_queries<>OLD.max_queries OR NEW.max_credits<>OLD.max_credits
 OR NEW.plan_json<>OLD.plan_json OR NEW.actor<>OLD.actor OR NEW.reason<>OLD.reason
 OR NEW.reviewed_campaign_id IS NOT OLD.reviewed_campaign_id OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at
 OR NEW.baseline_ready_sequence<>OLD.baseline_ready_sequence
 OR NEW.next_query<OLD.next_query OR NEW.review_required<OLD.review_required OR (OLD.status<>'active' AND NEW.status<>OLD.status)
 BEGIN SELECT RAISE(ABORT,'uk_campaign_authority_immutable'); END;
CREATE TRIGGER uk_campaign_no_delete BEFORE DELETE ON uk_paid_campaigns BEGIN SELECT RAISE(ABORT,'uk_campaign_authority_immutable'); END;
CREATE TRIGGER uk_campaign_no_replace BEFORE INSERT ON uk_paid_campaigns WHEN EXISTS(SELECT 1 FROM uk_paid_campaigns WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TABLE uk_paid_campaign_programmes (
 programme_id TEXT PRIMARY KEY REFERENCES source_led_programmes(id), campaign_id TEXT NOT NULL REFERENCES uk_paid_campaigns(id),
 plan_offset INTEGER NOT NULL CHECK(plan_offset BETWEEN 0 AND 24), UNIQUE(campaign_id,plan_offset)
);
CREATE TRIGGER uk_campaign_child_scope BEFORE INSERT ON uk_paid_campaign_programmes WHEN NOT EXISTS(
 SELECT 1 FROM source_led_programmes p JOIN uk_paid_campaigns c ON c.id=NEW.campaign_id
 WHERE p.id=NEW.programme_id AND p.id GLOB 'sourceled_uk_campaign_*' AND p.budget_day=c.budget_day
 AND p.status='active' AND c.status='active' AND p.max_queries BETWEEN 1 AND 4
 AND p.expires_at=c.expires_at AND json_array_length(p.plan_json)=p.max_queries
 AND NEW.plan_offset+p.max_queries<=c.next_query
 ) BEGIN SELECT RAISE(ABORT,'uk_campaign_child_scope_required'); END;
CREATE TRIGGER uk_campaign_child_update BEFORE UPDATE ON uk_paid_campaign_programmes BEGIN SELECT RAISE(ABORT,'uk_campaign_child_immutable'); END;
CREATE TRIGGER uk_campaign_child_delete BEFORE DELETE ON uk_paid_campaign_programmes BEGIN SELECT RAISE(ABORT,'uk_campaign_child_immutable'); END;
CREATE TRIGGER uk_campaign_child_replace BEFORE INSERT ON uk_paid_campaign_programmes WHEN EXISTS(SELECT 1 FROM uk_paid_campaign_programmes WHERE programme_id=NEW.programme_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TABLE uk_paid_campaign_targets (
 run_id TEXT PRIMARY KEY REFERENCES source_led_grants(run_id), campaign_id TEXT NOT NULL REFERENCES uk_paid_campaigns(id),
 target_region TEXT NOT NULL, lane TEXT NOT NULL
);
CREATE TRIGGER uk_campaign_target_scope BEFORE INSERT ON uk_paid_campaign_targets WHEN NOT EXISTS(
 SELECT 1 FROM source_led_grants g JOIN uk_paid_campaign_programmes cp ON cp.programme_id=g.programme_id
 JOIN source_led_programmes p ON p.id=cp.programme_id JOIN uk_paid_campaigns c ON c.id=cp.campaign_id
 WHERE g.run_id=NEW.run_id AND c.id=NEW.campaign_id AND g.market='GB' AND g.status='approved'
 AND c.status='active' AND p.status='active'
 AND NEW.target_region=json_extract(p.plan_json,'$['||g.query_index||'].target_region')
 AND NEW.lane=json_extract(p.plan_json,'$['||g.query_index||'].campaign_lane')
 AND g.query=json_extract(c.plan_json,'$['||(cp.plan_offset+g.query_index)||'].query')
 AND g.family=json_extract(c.plan_json,'$['||(cp.plan_offset+g.query_index)||'].family')
 ) BEGIN SELECT RAISE(ABORT,'uk_campaign_target_scope_required'); END;
CREATE TRIGGER uk_campaign_target_update BEFORE UPDATE ON uk_paid_campaign_targets BEGIN SELECT RAISE(ABORT,'uk_campaign_target_immutable'); END;
CREATE TRIGGER uk_campaign_target_delete BEFORE DELETE ON uk_paid_campaign_targets BEGIN SELECT RAISE(ABORT,'uk_campaign_target_immutable'); END;
CREATE TRIGGER uk_campaign_target_replace BEFORE INSERT ON uk_paid_campaign_targets WHEN EXISTS(SELECT 1 FROM uk_paid_campaign_targets WHERE run_id=NEW.run_id) BEGIN SELECT RAISE(IGNORE); END;
