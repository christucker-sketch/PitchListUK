function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function creditPreflight(options = {}) {
  const available = number(options.available, 0);
  const runBudget = number(options.runBudget, 0);
  const reserve = number(options.reserve, 100);
  const queries = number(options.queries, 0);
  const costPerQuery = number(options.costPerQuery, 1);
  const required = queries * costPerQuery;
  const remaining = available - required;
  const balanceConfigured = options.configured !== false && String(options.available ?? '').trim() !== '' && Number.isFinite(Number(options.available));
  const runBudgetConfigured = String(options.runBudget ?? '').trim() !== '' && Number.isFinite(Number(options.runBudget));
  const configured = balanceConfigured || runBudgetConfigured;
  const withinRunBudget = runBudgetConfigured && required <= runBudget;
  const withinAccountBalance = balanceConfigured && remaining >= reserve;
  const allowed = configured && (runBudgetConfigured ? withinRunBudget : true) && (balanceConfigured ? withinAccountBalance : true);
  return {
    configured,
    allowed,
    available,
    balance_configured: balanceConfigured,
    run_budget: runBudget,
    run_budget_configured: runBudgetConfigured,
    required,
    reserve,
    remaining,
    reason: !configured ? 'credit_budget_missing'
      : runBudgetConfigured && !withinRunBudget ? 'run_budget_exceeded'
        : balanceConfigured && !withinAccountBalance ? 'insufficient_credit_budget'
          : allowed ? 'ok' : 'credit_budget_invalid'
  };
}

function preflightFromEnv(queries, env = process.env) {
  return creditPreflight({
    configured: env.SERPER_CREDITS_REMAINING !== undefined,
    available: env.SERPER_CREDITS_REMAINING,
    runBudget: env.PITCHLIST_SERPER_RUN_BUDGET,
    reserve: env.PITCHLIST_SERPER_CREDIT_RESERVE || 100,
    costPerQuery: env.PITCHLIST_SERPER_CREDIT_COST || 1,
    queries
  });
}

module.exports = { creditPreflight, preflightFromEnv };
