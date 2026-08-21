function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function creditPreflight(options = {}) {
  const available = number(options.available, 0);
  const reserve = number(options.reserve, 100);
  const queries = number(options.queries, 0);
  const costPerQuery = number(options.costPerQuery, 1);
  const required = queries * costPerQuery;
  const remaining = available - required;
  const configured = options.configured !== false && Number.isFinite(Number(options.available));
  const allowed = configured && remaining >= reserve;
  return {
    configured,
    allowed,
    available,
    required,
    reserve,
    remaining,
    reason: !configured ? 'credit_balance_missing' : allowed ? 'ok' : 'insufficient_credit_budget'
  };
}

function preflightFromEnv(queries, env = process.env) {
  return creditPreflight({
    configured: env.SERPER_CREDITS_REMAINING !== undefined,
    available: env.SERPER_CREDITS_REMAINING,
    reserve: env.PITCHLIST_SERPER_CREDIT_RESERVE || 100,
    costPerQuery: env.PITCHLIST_SERPER_CREDIT_COST || 1,
    queries
  });
}

module.exports = { creditPreflight, preflightFromEnv };
