// Deterministic derived summary only. Original reports remain immutable.
// Address-coordinate bindings arrive later and MUST be joined live, not frozen.
export function compactProofSql(alias='v') {
  if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(alias))throw Error('proof_sql_alias_invalid');
  return `json_object('status',v.status,'application_close_at',json_extract(v.report_json,'$.application_close_at'),'usable_route',json(json_extract(v.report_json,'$.usable_route')),'facts',json(json_extract(v.report_json,'$.facts')),'reasons',json(json_extract(v.report_json,'$.reasons')),'profile',json_extract(v.report_json,'$.profile'),'source_url',json_extract(v.report_json,'$.source_url'),
    'venue_coordinate_policy',json_extract(v.report_json,'$.venue_coordinate_policy'),'venue_coordinates',json(json_extract(v.report_json,'$.venue_coordinates')),
    'coordinate_evidence',json((SELECT json_group_array(json_object('kind','venue_coordinate_country_proof','source_url',json_extract(x.value,'$.source_url'),'excerpt',json_extract(x.value,'$.excerpt'))) FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='venue_coordinate_country_proof' AND json_extract(v.report_json,'$.venue_coordinate_policy') IS NULL)),
    'application_heading',COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_scope_proof',json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END),'event_source_url',COALESCE(json_extract(v.report_json,'$.event_source_url'),
      (SELECT CASE WHEN json_valid(json_extract(d.value,'$.excerpt')) THEN json_extract(json_extract(d.value,'$.excerpt'),'$.url') END FROM json_each(v.report_json,'$.evidence') d WHERE json_extract(d.value,'$.kind')='event_json_ld' LIMIT 1)),
    'application_landing_url',json_extract(v.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(v.report_json,'$.evidence') x)))`.replace(/\bv\./g,alias+'.');
}

// Original read expression retained for exact parity and cache-miss fallback.
export function inventoryProofSql(){
 return compactProofSql().replace("'coordinate_evidence'", "'address_coordinates',json((SELECT a.position_json FROM venue_address_coordinates a WHERE a.entity_id=e.id AND a.entity_revision=e.revision AND a.verification_sequence=v.sequence LIMIT 1)),\n    'coordinate_evidence'");
}
