#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { evaluateHealth } = require('../lib/monitoring');
const { runtimeRoot } = require('../lib/staging-store');

const inputPath = process.argv[2] || path.join(runtimeRoot(), 'health', 'latest.json');
const report = evaluateHealth(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
console.log(JSON.stringify(report, null, 2));
if (!report.healthy) process.exitCode = 2;
