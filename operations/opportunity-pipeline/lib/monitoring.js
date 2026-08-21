function evaluateHealth(input = {}, thresholds = {}) {
  const maxAgeHours = Number(thresholds.max_dataset_age_hours || 48);
  const minCredits = Number(thresholds.min_credits || 100);
  const alerts = [];
  const add = (code, detail) => alerts.push({ code, detail });
  if (input.discovery_status && input.discovery_status !== 'ok') add('discovery_failure', input.discovery_status);
  if (input.publish_status && input.publish_status !== 'ok' && input.publish_status !== 'paused') add('publish_failure', input.publish_status);
  if (Number.isFinite(input.serper_credits) && input.serper_credits < minCredits) add('serper_credits_low', input.serper_credits);
  if (Number(input.dataset_age_hours) > maxAgeHours) add('production_dataset_stale', input.dataset_age_hours);
  if (Number(input.promoted_valid_growth) === 0) add('zero_promoted_valid_growth', 0);
  if (Number(input.non_uk_count) > 0) add('non_uk_records', input.non_uk_count);
  if (Number(input.expired_or_closed_count) > 0) add('expired_or_closed_records', input.expired_or_closed_count);
  if (Number(input.broken_application_links) > 0) add('broken_application_links', input.broken_application_links);
  if (input.coverage_regression === true) add('geographic_coverage_regression', true);
  if (input.required_headers_ok === false) add('required_security_headers_missing', true);
  if (input.production_sha && input.github_main_sha && input.production_sha !== input.github_main_sha) add('production_sha_mismatch', `${input.production_sha} != ${input.github_main_sha}`);
  return { healthy: alerts.length === 0, alerts };
}

module.exports = { evaluateHealth };
