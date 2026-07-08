#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const BODY_PARTS = [
  'height',
  'chest',
  'underbust',
  'waist',
  'hips',
  'shoulders',
  'neck',
  'sleeve',
  'inseam',
  'thigh',
  'calf',
  'roundSleeveBicep',
  'roundSleeveElbow',
];

const DEMO_DATA = [
  {
    subjectId: 'demo-001',
    scanId: 'scan-a',
    groundTruth: { chest: 101, waist: 84, hips: 103, thigh: 58 },
    scan: { chest: 99.8, waist: 86.1, hips: 101.7, thigh: 0 },
  },
  {
    subjectId: 'demo-002',
    scanId: 'scan-b',
    groundTruth: { chest: 92, waist: 73, hips: 98, thigh: 54 },
    scan: { chest: 93.5, waist: 74.1, hips: 96.9, thigh: 55.4 },
  },
];

const CSV_TEMPLATE = `subjectId,scanId,bodyPart,groundTruthCm,scanCm,status,condition,notes
p001,scan001,chest,,,completed,front_side_calibrated,
p001,scan001,waist,,,completed,front_side_calibrated,
p001,scan001,hips,,,completed,front_side_calibrated,
p001,scan001,shoulders,,,completed,front_side_calibrated,
p001,scan001,sleeve,,,completed,front_side_calibrated,
p001,scan001,inseam,,,completed,front_side_calibrated,
p001,scan001,thigh,,,completed,front_side_calibrated,
p001,scan001,neck,,,completed,front_side_calibrated,`;

function usage() {
  console.log(`Usage:
  node scripts/accuracy-benchmark.mjs <study.json|study.csv> [--json]
  node scripts/accuracy-benchmark.mjs --demo [--json]
  node scripts/accuracy-benchmark.mjs --template > study-template.csv

JSON records:
  [{
    "subjectId": "p001",
    "scanId": "scan001",
    "groundTruth": { "chest": 101.2, "waist": 82.4 },
    "scan": { "chest": 100.1, "waist": 85.0 }
  }]

CSV long format:
  subjectId,scanId,bodyPart,groundTruthCm,scanCm,status
  p001,scan001,chest,101.2,100.1,completed
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    demo: args.includes('--demo'),
    json: args.includes('--json'),
    template: args.includes('--template'),
    input: args.find(arg => !arg.startsWith('--')),
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function loadInput({ demo, input }) {
  if (demo) return DEMO_DATA;
  if (!input) {
    usage();
    process.exit(1);
  }

  const fullPath = path.resolve(process.cwd(), input);
  const text = fs.readFileSync(fullPath, 'utf8');
  if (input.toLowerCase().endsWith('.csv')) {
    return parseCsv(text);
  }
  return JSON.parse(text);
}

function normalizeRows(records) {
  const rows = [];
  for (const record of records) {
    const status = String(record.status || record.scanStatus || 'completed').toLowerCase();

    if (record.bodyPart) {
      rows.push({
        subjectId: record.subjectId || record.participantId || '',
        scanId: record.scanId || '',
        bodyPart: record.bodyPart,
        truth: toNumber(record.groundTruthCm ?? record.truthCm ?? record.tapeCm),
        scan: toNumber(record.scanCm ?? record.estimateCm ?? record.measurementCm),
        status,
      });
      continue;
    }

    const truth = record.groundTruth || record.truth || record.tape || record.tapeMeasurements || {};
    const scan = record.scan || record.scanOutput || record.measurements || {};
    for (const bodyPart of BODY_PARTS) {
      if (!(bodyPart in truth)) continue;
      rows.push({
        subjectId: record.subjectId || record.participantId || '',
        scanId: record.scanId || record.measurementId || '',
        bodyPart,
        truth: toNumber(truth[bodyPart]),
        scan: toNumber(scan[bodyPart]),
        status,
      });
    }
  }
  return rows.filter(row => row.truth !== null && row.truth > 0);
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function benchmark(rows) {
  const byPart = new Map();

  for (const row of rows) {
    if (!byPart.has(row.bodyPart)) {
      byPart.set(row.bodyPart, { total: 0, failures: 0, errors: [] });
    }
    const bucket = byPart.get(row.bodyPart);
    bucket.total += 1;

    const failed = row.status === 'failed' || row.status === 'error' || row.scan === null || row.scan <= 0;
    if (failed) {
      bucket.failures += 1;
      continue;
    }

    bucket.errors.push(Math.abs(row.scan - row.truth));
  }

  const parts = {};
  for (const [bodyPart, bucket] of [...byPart.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts[bodyPart] = {
      sampleCount: bucket.errors.length,
      attemptedCount: bucket.total,
      failureRate: round(bucket.failures / bucket.total),
      mae: round(mean(bucket.errors)),
      medianError: round(quantile(bucket.errors, 0.5)),
      p90Error: round(quantile(bucket.errors, 0.9)),
      p95Error: round(quantile(bucket.errors, 0.95)),
      maxError: round(bucket.errors.length ? Math.max(...bucket.errors) : null),
    };
  }

  const allErrors = [...byPart.values()].flatMap(bucket => bucket.errors);
  const totalAttempts = [...byPart.values()].reduce((sum, bucket) => sum + bucket.total, 0);
  const totalFailures = [...byPart.values()].reduce((sum, bucket) => sum + bucket.failures, 0);

  return {
    summary: {
      bodyParts: Object.keys(parts).length,
      attemptedCount: totalAttempts,
      sampleCount: allErrors.length,
      failureRate: totalAttempts > 0 ? round(totalFailures / totalAttempts) : null,
      mae: round(mean(allErrors)),
      medianError: round(quantile(allErrors, 0.5)),
      p90Error: round(quantile(allErrors, 0.9)),
      p95Error: round(quantile(allErrors, 0.95)),
    },
    parts,
  };
}

function printMarkdown(result) {
  console.log('# Tailor-X Measurement Benchmark\n');
  console.log(`Attempts: ${result.summary.attemptedCount}`);
  console.log(`Valid samples: ${result.summary.sampleCount}`);
  console.log(`Overall MAE: ${result.summary.mae ?? 'n/a'} cm`);
  console.log(`Overall P95: ${result.summary.p95Error ?? 'n/a'} cm`);
  console.log(`Failure rate: ${result.summary.failureRate === null ? 'n/a' : `${Math.round(result.summary.failureRate * 100)}%`}`);
  console.log('\n| Body part | Valid / Attempted | Failure | MAE cm | Median cm | P90 cm | P95 cm | Max cm |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [bodyPart, row] of Object.entries(result.parts)) {
    const failure = `${Math.round(row.failureRate * 100)}%`;
    console.log(`| ${bodyPart} | ${row.sampleCount}/${row.attemptedCount} | ${failure} | ${row.mae ?? 'n/a'} | ${row.medianError ?? 'n/a'} | ${row.p90Error ?? 'n/a'} | ${row.p95Error ?? 'n/a'} | ${row.maxError ?? 'n/a'} |`);
  }
}

const args = parseArgs(process.argv);
if (args.template) {
  console.log(CSV_TEMPLATE);
  process.exit(0);
}

const records = loadInput(args);
const rows = normalizeRows(records);

if (rows.length === 0) {
  console.error('No benchmark rows found. Check input format and ground-truth values.');
  process.exit(1);
}

const result = benchmark(rows);
if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printMarkdown(result);
}
