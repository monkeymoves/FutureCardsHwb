#!/usr/bin/env node
/**
 * build-card-library.mjs
 *
 * Reads `content/cards.csv` (the human-edited source of truth) and emits
 * `src/scripts/data/card-library.js` (the bundle-imported module). The
 * generated file preserves the exact same exports the engine expects:
 *
 *   ACTION_CARDS, CURVEBALL_CARDS, RIPPLE_CARDS, ALL_CARDS,
 *   getCardsByType, getCardById
 *
 * Run via:   npm run cards:build
 * Auto-run:  package.json `prebuild` hook → before `astro build`
 *
 * Why a build-time conversion (not a runtime fetch):
 *   - No CSV parser ships in the client bundle.
 *   - No network round-trip on game boot.
 *   - Same loading semantics as before — drop-in replacement.
 *   - Git diffs on the CSV show content changes cleanly.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const CSV_PATH = resolve(PROJECT_ROOT, 'content/cards.csv');
const OUT_PATH = resolve(PROJECT_ROOT, 'src/scripts/data/card-library.js');

const VALID_TYPES = new Set(['action', 'curveball', 'ripple']);
const REQUIRED_COLUMNS = ['id', 'type', 'title', 'description'];

// ─── CSV parser ──────────────────────────────────────────────────────────────
// Handles RFC-4180-style CSV: double-quoted fields, "" as an escape for a
// literal quote inside a quoted field, commas inside quoted fields. Does NOT
// support embedded newlines inside fields — keep card content on a single line.
function parseCsv(text) {
  // Strip BOM if present (Excel sometimes adds one)
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter((line) => line.trim().length > 0);

  function parseRow(line, lineNumber) {
    const fields = [];
    let i = 0;
    while (i < line.length) {
      let value = '';
      if (line[i] === '"') {
        // Quoted field — read until closing quote, with "" → "
        i++;
        while (i < line.length) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            value += line[i];
            i++;
          }
        }
      } else {
        // Unquoted field — read until next comma
        while (i < line.length && line[i] !== ',') {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (line[i] === ',') i++;
      else if (i < line.length) {
        throw new Error(`Line ${lineNumber}: unexpected character at column ${i}`);
      }
    }
    return fields;
  }

  const header = parseRow(lines[0], 1).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseRow(lines[i], i + 1);
    if (fields.length !== header.length) {
      throw new Error(
        `Line ${i + 1}: expected ${header.length} columns, got ${fields.length} — row was: ${lines[i]}`
      );
    }
    const row = {};
    header.forEach((col, idx) => { row[col] = fields[idx]; });
    rows.push({ ...row, _lineNumber: i + 1 });
  }
  return { header, rows };
}

// ─── Validation ──────────────────────────────────────────────────────────────
function validate({ header, rows }) {
  const errors = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) errors.push(`Missing required column: "${col}"`);
  }

  const seenIds = new Map();
  for (const row of rows) {
    const where = `Line ${row._lineNumber}`;
    if (!row.id?.trim()) errors.push(`${where}: id is required`);
    if (!row.type?.trim()) errors.push(`${where}: type is required`);
    if (!row.title?.trim()) errors.push(`${where}: title is required`);
    if (!row.description?.trim()) errors.push(`${where}: description is required`);
    if (row.type && !VALID_TYPES.has(row.type)) {
      errors.push(`${where}: type must be one of ${[...VALID_TYPES].join(', ')} (got "${row.type}")`);
    }
    if (row.id) {
      if (seenIds.has(row.id)) {
        errors.push(`${where}: duplicate id "${row.id}" (also on line ${seenIds.get(row.id)})`);
      } else {
        seenIds.set(row.id, row._lineNumber);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`CSV validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

// ─── JS literal serialisation ────────────────────────────────────────────────
// Use JSON.stringify on the value (handles quotes, backslashes, unicode
// safely), then strip the leading/trailing quotes for property keys to keep
// the generated file readable.
function serialiseString(value) {
  return JSON.stringify(value);
}

function serialiseCard(row) {
  return [
    '  {',
    `    id: ${serialiseString(row.id)},`,
    `    type: ${serialiseString(row.type)},`,
    `    title: ${serialiseString(row.title)},`,
    `    description: ${serialiseString(row.description)},`,
    '  },',
  ].join('\n');
}

function serialiseGroup(name, cards) {
  if (cards.length === 0) {
    return `export const ${name} = [];\n`;
  }
  return [
    `export const ${name} = [`,
    ...cards.map(serialiseCard),
    '];',
    '',
  ].join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────
function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`[build-card-library] CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  const csvText = readFileSync(CSV_PATH, 'utf8');
  const parsed = parseCsv(csvText);
  validate(parsed);

  const byType = {
    action: parsed.rows.filter((r) => r.type === 'action'),
    curveball: parsed.rows.filter((r) => r.type === 'curveball'),
    ripple: parsed.rows.filter((r) => r.type === 'ripple'),
  };

  const out = [
    '// ─────────────────────────────────────────────────────────────',
    '// AUTO-GENERATED — DO NOT EDIT BY HAND.',
    '// Source: content/cards.csv',
    '// Regenerate with: npm run cards:build',
    '// ─────────────────────────────────────────────────────────────',
    '',
    serialiseGroup('ACTION_CARDS', byType.action),
    serialiseGroup('CURVEBALL_CARDS', byType.curveball),
    serialiseGroup('RIPPLE_CARDS', byType.ripple),
    'export const ALL_CARDS = [...ACTION_CARDS, ...CURVEBALL_CARDS, ...RIPPLE_CARDS];',
    '',
    'export function getCardsByType(type) {',
    '  return ALL_CARDS.filter((card) => card.type === type);',
    '}',
    '',
    'export function getCardById(id) {',
    '  return ALL_CARDS.find((card) => card.id === id) || null;',
    '}',
    '',
  ].join('\n');

  writeFileSync(OUT_PATH, out, 'utf8');

  const total = parsed.rows.length;
  console.log(
    `[build-card-library] ${total} card${total === 1 ? '' : 's'} → ${OUT_PATH.replace(PROJECT_ROOT + '/', '')}`
    + ` (${byType.action.length} action / ${byType.curveball.length} curveball / ${byType.ripple.length} ripple)`
  );
}

try {
  main();
} catch (err) {
  console.error(`[build-card-library] ${err.message}`);
  process.exit(1);
}
