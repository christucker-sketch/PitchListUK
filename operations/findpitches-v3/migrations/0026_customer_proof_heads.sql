-- Bounded disposable read model, NOT source evidence or a READY cache.
-- One row per entity. Rebuild from retained immutable source_verifications.
-- All live revision/hold/clock/expiry checks remain on catalogue reads.
CREATE TABLE customer_proof_heads (
 entity_id TEXT PRIMARY KEY REFERENCES entities(id),
 verification_sequence INTEGER NOT NULL UNIQUE REFERENCES source_verifications(sequence),
 proof_json TEXT NOT NULL CHECK(json_valid(proof_json))
);
CREATE TRIGGER customer_proof_head_insert_guard BEFORE INSERT ON customer_proof_heads
WHEN NOT EXISTS(SELECT 1 FROM source_verifications v WHERE v.entity_id=NEW.entity_id
 AND v.sequence=NEW.verification_sequence
 AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id)
 AND NEW.proof_json=json_object('status',v.status,'application_close_at',json_extract(v.report_json,'$.application_close_at'),'usable_route',json(json_extract(v.report_json,'$.usable_route')),'facts',json(json_extract(v.report_json,'$.facts')),'reasons',json(json_extract(v.report_json,'$.reasons')),'profile',json_extract(v.report_json,'$.profile'),'source_url',json_extract(v.report_json,'$.source_url'),
    'venue_coordinate_policy',json_extract(v.report_json,'$.venue_coordinate_policy'),'venue_coordinates',json(json_extract(v.report_json,'$.venue_coordinates')),
    'coordinate_evidence',json((SELECT json_group_array(json_object('kind','venue_coordinate_country_proof','source_url',json_extract(x.value,'$.source_url'),'excerpt',json_extract(x.value,'$.excerpt'))) FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='venue_coordinate_country_proof' AND json_extract(v.report_json,'$.venue_coordinate_policy') IS NULL)),
    'application_heading',COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_scope_proof',json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END),'event_source_url',COALESCE(json_extract(v.report_json,'$.event_source_url'),
      (SELECT CASE WHEN json_valid(json_extract(d.value,'$.excerpt')) THEN json_extract(json_extract(d.value,'$.excerpt'),'$.url') END FROM json_each(v.report_json,'$.evidence') d WHERE json_extract(d.value,'$.kind')='event_json_ld' LIMIT 1)),
    'application_landing_url',json_extract(v.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(v.report_json,'$.evidence') x))))
BEGIN SELECT RAISE(ABORT,'source_bound_proof_head_required'); END;
CREATE TRIGGER customer_proof_head_update_guard BEFORE UPDATE ON customer_proof_heads
WHEN NEW.entity_id<>OLD.entity_id OR NOT EXISTS(SELECT 1 FROM source_verifications v WHERE v.entity_id=NEW.entity_id
 AND v.sequence=NEW.verification_sequence
 AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id)
 AND NEW.proof_json=json_object('status',v.status,'application_close_at',json_extract(v.report_json,'$.application_close_at'),'usable_route',json(json_extract(v.report_json,'$.usable_route')),'facts',json(json_extract(v.report_json,'$.facts')),'reasons',json(json_extract(v.report_json,'$.reasons')),'profile',json_extract(v.report_json,'$.profile'),'source_url',json_extract(v.report_json,'$.source_url'),
    'venue_coordinate_policy',json_extract(v.report_json,'$.venue_coordinate_policy'),'venue_coordinates',json(json_extract(v.report_json,'$.venue_coordinates')),
    'coordinate_evidence',json((SELECT json_group_array(json_object('kind','venue_coordinate_country_proof','source_url',json_extract(x.value,'$.source_url'),'excerpt',json_extract(x.value,'$.excerpt'))) FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='venue_coordinate_country_proof' AND json_extract(v.report_json,'$.venue_coordinate_policy') IS NULL)),
    'application_heading',COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_scope_proof',json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END),'event_source_url',COALESCE(json_extract(v.report_json,'$.event_source_url'),
      (SELECT CASE WHEN json_valid(json_extract(d.value,'$.excerpt')) THEN json_extract(json_extract(d.value,'$.excerpt'),'$.url') END FROM json_each(v.report_json,'$.evidence') d WHERE json_extract(d.value,'$.kind')='event_json_ld' LIMIT 1)),
    'application_landing_url',json_extract(v.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(v.report_json,'$.evidence') x))))
BEGIN SELECT RAISE(ABORT,'source_bound_proof_head_required'); END;
CREATE TRIGGER verification_refresh_customer_proof AFTER INSERT ON source_verifications BEGIN
 INSERT INTO customer_proof_heads(entity_id,verification_sequence,proof_json)
 VALUES(NEW.entity_id,NEW.sequence,json_object('status',NEW.status,'application_close_at',json_extract(NEW.report_json,'$.application_close_at'),'usable_route',json(json_extract(NEW.report_json,'$.usable_route')),'facts',json(json_extract(NEW.report_json,'$.facts')),'reasons',json(json_extract(NEW.report_json,'$.reasons')),'profile',json_extract(NEW.report_json,'$.profile'),'source_url',json_extract(NEW.report_json,'$.source_url'),
    'venue_coordinate_policy',json_extract(NEW.report_json,'$.venue_coordinate_policy'),'venue_coordinates',json(json_extract(NEW.report_json,'$.venue_coordinates')),
    'coordinate_evidence',json((SELECT json_group_array(json_object('kind','venue_coordinate_country_proof','source_url',json_extract(x.value,'$.source_url'),'excerpt',json_extract(x.value,'$.excerpt'))) FROM json_each(NEW.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='venue_coordinate_country_proof' AND json_extract(NEW.report_json,'$.venue_coordinate_policy') IS NULL)),
    'application_heading',COALESCE(json_extract(NEW.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(NEW.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_scope_proof',json_object('trader_application',json_extract(NEW.report_json,'$.application_scope_proof.trader_application'),'restricted_audience',json_extract(NEW.report_json,'$.application_scope_proof.restricted_audience'),'guaranteed_vendor_space',json_extract(NEW.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(NEW.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(NEW.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(NEW.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(NEW.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(NEW.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(NEW.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END),'event_source_url',COALESCE(json_extract(NEW.report_json,'$.event_source_url'),
      (SELECT CASE WHEN json_valid(json_extract(d.value,'$.excerpt')) THEN json_extract(json_extract(d.value,'$.excerpt'),'$.url') END FROM json_each(NEW.report_json,'$.evidence') d WHERE json_extract(d.value,'$.kind')='event_json_ld' LIMIT 1)),
    'application_landing_url',json_extract(NEW.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(NEW.report_json,'$.evidence') x))))
 ON CONFLICT(entity_id) DO UPDATE SET verification_sequence=excluded.verification_sequence,proof_json=excluded.proof_json
 WHERE excluded.verification_sequence>customer_proof_heads.verification_sequence;
END;
INSERT INTO customer_proof_heads(entity_id,verification_sequence,proof_json)
 SELECT v.entity_id,v.sequence,json_object('status',v.status,'application_close_at',json_extract(v.report_json,'$.application_close_at'),'usable_route',json(json_extract(v.report_json,'$.usable_route')),'facts',json(json_extract(v.report_json,'$.facts')),'reasons',json(json_extract(v.report_json,'$.reasons')),'profile',json_extract(v.report_json,'$.profile'),'source_url',json_extract(v.report_json,'$.source_url'),
    'venue_coordinate_policy',json_extract(v.report_json,'$.venue_coordinate_policy'),'venue_coordinates',json(json_extract(v.report_json,'$.venue_coordinates')),
    'coordinate_evidence',json((SELECT json_group_array(json_object('kind','venue_coordinate_country_proof','source_url',json_extract(x.value,'$.source_url'),'excerpt',json_extract(x.value,'$.excerpt'))) FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='venue_coordinate_country_proof' AND json_extract(v.report_json,'$.venue_coordinate_policy') IS NULL)),
    'application_heading',COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_scope_proof',json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END),'event_source_url',COALESCE(json_extract(v.report_json,'$.event_source_url'),
      (SELECT CASE WHEN json_valid(json_extract(d.value,'$.excerpt')) THEN json_extract(json_extract(d.value,'$.excerpt'),'$.url') END FROM json_each(v.report_json,'$.evidence') d WHERE json_extract(d.value,'$.kind')='event_json_ld' LIMIT 1)),
    'application_landing_url',json_extract(v.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(v.report_json,'$.evidence') x))) FROM source_verifications v
 WHERE v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=v.entity_id);
