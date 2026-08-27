'use strict';

const { DISCOVERY_REGIONS, DISCOVERY_TEMPLATES, EXCLUDED_DISCOVERY_SITES, templateKeyForQuery } = require('../acquisition/source-discovery');

const VIABLE = new Set(['auto-approvable-first-party', 'manual-review-required']);
const BLOCKED_FAILURE = /robots_|access_denied|http_error|robots_unavailable/i;

function batchId(region, templateId) {
  return `${String(region).toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${templateId}`;
}

function queryMetrics(records = []) {
  const byTemplate = new Map();
  for (const record of records) {
    const templateId = templateKeyForQuery(record.discovery_query);
    if (!templateId) continue;
    const metric = byTemplate.get(templateId) || { template_id: templateId, candidates: 0, viable: 0, approved: 0, blocked: 0, rejected: 0 };
    metric.candidates++;
    if (VIABLE.has(record.classification)) metric.viable++;
    if (record.approval_status === 'approved') metric.approved++;
    if (record.classification === 'fetch-failed' && BLOCKED_FAILURE.test(record.rejection_reason)) metric.blocked++;
    if (String(record.classification || '').startsWith('rejected-')) metric.rejected++;
    byTemplate.set(templateId, metric);
  }
  return byTemplate;
}

function completedFromReports(reports = []) {
  const completed = new Set();
  for (const report of reports) for (const plan of report.queries || []) {
    const templateId = plan.template_id || templateKeyForQuery(plan.query);
    if (plan.region && templateId) completed.add(batchId(plan.region, templateId));
  }
  return completed;
}

function templateScore(template, metric = {}) {
  const candidates = Number(metric.candidates || 0);
  const viable = Number(metric.viable || 0);
  const approved = Number(metric.approved || 0);
  const blocked = Number(metric.blocked || 0);
  const rejected = Number(metric.rejected || 0);
  const observed = candidates ? ((approved * 8) + (viable * 5) - (blocked * 4) - (rejected * 2)) / candidates : 0;
  return Number(template.priority || 0) + observed * 10;
}

function isLowYield(metric = {}) {
  const candidates = Number(metric.candidates || 0);
  if (candidates < 5) return false;
  const viable = Number(metric.viable || 0);
  const blocked = Number(metric.blocked || 0);
  const rejected = Number(metric.rejected || 0);
  return viable === 0 && (blocked + rejected) / candidates >= 0.8;
}

function planAcceleratedDiscovery(options = {}) {
  const regions = options.regions?.length ? options.regions : DISCOVERY_REGIONS;
  const templates = options.templates?.length ? options.templates : DISCOVERY_TEMPLATES;
  const metrics = queryMetrics(options.records || []);
  const completed = new Set([...(options.completed || []), ...completedFromReports(options.reports || [])]);
  const limit = Math.max(1, Number(options.limit || 8));
  const completedByRegion = new Map(regions.map(region => [region, [...completed].filter(id => id.startsWith(`${String(region).toLowerCase().replace(/[^a-z0-9]+/g, '-')}:`)).length]));
  const rankedRegions = [...regions].sort((a, b) => (completedByRegion.get(a) || 0) - (completedByRegion.get(b) || 0) || regions.indexOf(a) - regions.indexOf(b));
  const plans = [];
  const suppressedTemplates = [];
  for (const region of rankedRegions) {
    const rankedTemplates = [...templates].sort((a, b) => templateScore(b, metrics.get(b.id)) - templateScore(a, metrics.get(a.id)));
    for (const template of rankedTemplates) {
      const id = batchId(region, template.id);
      if (completed.has(id)) continue;
      if (isLowYield(metrics.get(template.id))) { suppressedTemplates.push(template.id); continue; }
      plans.push({ batch_id: id, region, template_id: template.id, query: `${template.query(region)} ${EXCLUDED_DISCOVERY_SITES}`.trim(), score: Math.round(templateScore(template, metrics.get(template.id)) * 10) / 10 });
      if (plans.length >= limit) return { plans, completed, metrics, suppressed_templates: [...new Set(suppressedTemplates)] };
    }
  }
  return { plans, completed, metrics, suppressed_templates: [...new Set(suppressedTemplates)] };
}

module.exports = { VIABLE, BLOCKED_FAILURE, batchId, queryMetrics, completedFromReports, templateScore, isLowYield, planAcceleratedDiscovery };
