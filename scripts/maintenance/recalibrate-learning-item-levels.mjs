#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const levels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function fail(message) {
  throw new Error(message);
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path, value) {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function openDatabase(path, readOnly = true) {
  return new DatabaseSync(resolve(path), { readOnly });
}

function activeItems(database) {
  return database.prepare(`
    SELECT id, language, title, sense, cefr AS currentCefr
    FROM learning_items
    WHERE status = 'active'
    ORDER BY id
  `).all();
}

function distribution(items, key = "currentCefr") {
  const result = Object.fromEntries([...levels].map((level) => [level, 0]));
  for (const item of items) result[item[key]] += 1;
  return result;
}

function validateInput(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items) ||
    value.items.length === 0) fail("Invalid recalibration input");
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.id !== "string" || !item.id ||
      typeof item.language !== "string" || !item.language ||
      typeof item.title !== "string" || !item.title ||
      typeof item.sense !== "string" || !item.sense ||
      !levels.has(item.currentCefr) || ids.has(item.id)) {
      fail("Invalid or duplicate recalibration input item");
    }
    ids.add(item.id);
  }
  return value.items;
}

function validateResults(inputItems, value) {
  if (!value || !Array.isArray(value.assessments) ||
    value.assessments.length !== inputItems.length) {
    fail("Recalibration result count does not match input");
  }
  const expected = new Set(inputItems.map(({ id }) => id));
  const result = new Map();
  for (const assessment of value.assessments) {
    if (!assessment || typeof assessment.id !== "string" ||
      !expected.has(assessment.id) || result.has(assessment.id) ||
      !levels.has(assessment.cefr) ||
      typeof assessment.reason !== "string" || !assessment.reason.trim()) {
      fail("Invalid, duplicate, or unexpected recalibration assessment");
    }
    result.set(assessment.id, assessment);
  }
  return result;
}

function assertCurrentInput(database, inputItems) {
  const current = activeItems(database);
  if (current.length !== inputItems.length) {
    fail("Active learning-item count changed after export");
  }
  for (let index = 0; index < current.length; index += 1) {
    const actual = current[index];
    const expected = inputItems[index];
    for (const key of ["id", "language", "title", "sense", "currentCefr"]) {
      if (actual[key] !== expected[key]) {
        fail(`Active learning item changed after export: ${expected.id}`);
      }
    }
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableRows(database, table) {
  return database.prepare(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY rowid`).all();
}

function verifyOnlyCefrChanged(databasePath, backupPath, results) {
  const current = openDatabase(databasePath);
  const backup = openDatabase(backupPath);
  try {
    const tables = backup.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(({ name }) => name);
    const currentTables = current.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(({ name }) => name);
    if (JSON.stringify(tables) !== JSON.stringify(currentTables)) {
      fail("Database table set changed during recalibration");
    }
    for (const table of tables) {
      const before = tableRows(backup, table);
      const after = tableRows(current, table);
      if (before.length !== after.length) fail(`Row count changed in ${table}`);
      if (table !== "learning_items") {
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          fail(`Non-learning-item table changed: ${table}`);
        }
        continue;
      }
      for (let index = 0; index < before.length; index += 1) {
        const oldRow = { ...before[index] };
        const newRow = { ...after[index] };
        const id = oldRow.id;
        const expected = results.get(id);
        const expectedCefr = oldRow.status === "active" && expected
          ? expected.cefr
          : oldRow.cefr;
        delete oldRow.cefr;
        delete newRow.cefr;
        if (JSON.stringify(oldRow) !== JSON.stringify(newRow) ||
          after[index].cefr !== expectedCefr) {
          fail(`Unexpected learning-item mutation: ${id}`);
        }
      }
    }
  } finally {
    current.close();
    backup.close();
  }
}

function exportInput(databasePath, outputPath) {
  const database = openDatabase(databasePath);
  try {
    const items = activeItems(database);
    writeJson(outputPath, {
      version: 1,
      rubric: "F68-frequency-based-cefr-v1",
      generatedAt: new Date().toISOString(),
      items
    });
    return { count: items.length, distribution: distribution(items) };
  } finally {
    database.close();
  }
}

function blindInput(inputPath, outputPath) {
  const items = validateInput(loadJson(inputPath));
  const blindItems = items.map(({ id, language, title, sense }) => ({
    id,
    language,
    title,
    sense
  }));
  writeJson(outputPath, {
    version: 1,
    rubric: "F68-frequency-based-cefr-v1",
    items: blindItems
  });
  return { count: blindItems.length, excludesPreviousCefr: true };
}

function splitBlindInput(blindInputPath, outputDirectory, batchSizeValue) {
  const value = loadJson(blindInputPath);
  const batchSize = Number(batchSizeValue);
  if (!value || !Array.isArray(value.items) || value.items.length === 0 ||
    !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    fail("Invalid blind input or batch size");
  }
  const directory = resolve(outputDirectory);
  mkdirSync(directory, { recursive: false });
  const paths = [];
  for (let start = 0; start < value.items.length; start += batchSize) {
    const number = String(paths.length + 1).padStart(2, "0");
    const path = join(directory, `batch-${number}.json`);
    writeJson(path, {
      version: 1,
      rubric: value.rubric,
      items: value.items.slice(start, start + batchSize)
    });
    paths.push(path);
  }
  return { count: value.items.length, batches: paths.length, paths };
}

function writeBatchSchemas(batchDirectory) {
  const directory = resolve(batchDirectory);
  const inputs = readdirSync(directory)
    .filter((name) => /^batch-\d+\.json$/.test(name))
    .sort();
  for (const inputName of inputs) {
    const input = loadJson(join(directory, inputName));
    const ids = input.items.map(({ id }) => id);
    const schemaName = inputName.replace(/\.json$/, ".schema.json");
    writeJson(join(directory, schemaName), {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["assessments"],
      properties: {
        assessments: {
          type: "array",
          minItems: ids.length,
          maxItems: ids.length,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "cefr", "reason"],
            properties: {
              id: { enum: ids },
              cefr: { enum: [...levels] },
              reason: { type: "string", minLength: 1, maxLength: 180 }
            }
          }
        }
      }
    });
  }
  return { batches: inputs.length };
}

function mergeResults(inputPath, outputPath, batchPaths) {
  const inputItems = validateInput(loadJson(inputPath));
  if (batchPaths.length === 0) fail("No result batches supplied");
  const assessments = batchPaths.flatMap((path) => {
    const value = loadJson(path);
    if (!value || !Array.isArray(value.assessments)) {
      fail(`Invalid result batch: ${path}`);
    }
    return value.assessments;
  });
  validateResults(inputItems, { assessments });
  writeJson(outputPath, { assessments });
  return { count: assessments.length, batches: batchPaths.length };
}

function applyResults(databasePath, inputPath, resultsPath, backupPath, reportPath) {
  const inputItems = validateInput(loadJson(inputPath));
  const results = validateResults(inputItems, loadJson(resultsPath));
  if (existsSync(resolve(backupPath))) fail("Backup path already exists");
  const database = openDatabase(databasePath, false);
  try {
    assertCurrentInput(database, inputItems);
    const escapedBackup = resolve(backupPath).replaceAll("'", "''");
    database.exec(`VACUUM INTO '${escapedBackup}'`);
    const update = database.prepare(`
      UPDATE learning_items SET cefr = ?
      WHERE id = ? AND status = 'active' AND cefr = ?
    `);
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const item of inputItems) {
        const next = results.get(item.id);
        if (next.cefr === item.currentCefr) continue;
        const outcome = update.run(next.cefr, item.id, item.currentCefr);
        if (outcome.changes !== 1) fail(`Failed to update ${item.id}`);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
  verifyOnlyCefrChanged(databasePath, backupPath, results);
  const assessments = [...results.values()];
  const changed = inputItems.filter((item) =>
    results.get(item.id).cefr !== item.currentCefr
  ).length;
  const report = {
    version: 1,
    completedAt: new Date().toISOString(),
    databasePath: resolve(databasePath),
    backupPath: resolve(backupPath),
    activeCount: inputItems.length,
    changedCount: changed,
    unchangedCount: inputItems.length - changed,
    beforeDistribution: distribution(inputItems),
    afterDistribution: distribution(assessments, "cefr"),
    verification: "Only active learning_items.cefr values changed"
  };
  writeJson(reportPath, report);
  return report;
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "vocabreader-f68-"));
  try {
    const databasePath = join(root, "items.sqlite");
    const inputPath = join(root, "input.json");
    const blindPath = join(root, "blind.json");
    const batchDirectory = join(root, "batches");
    const resultsPath = join(root, "results.json");
    const backupPath = join(root, "backup.sqlite");
    const reportPath = join(root, "report.json");
    const database = openDatabase(databasePath, false);
    database.exec(`
      CREATE TABLE learning_items (
        id TEXT PRIMARY KEY, language TEXT, title TEXT, sense TEXT, cefr TEXT,
        status TEXT, updated_at TEXT
      );
      CREATE TABLE learning_review_events (id TEXT PRIMARY KEY, payload TEXT);
      INSERT INTO learning_items VALUES
        ('a', 'en', 'lid', 'cover for a container', 'B1', 'active', 'same'),
        ('b', 'en', 'arcane', 'known by few people', 'B2', 'active', 'same'),
        ('c', 'en', 'trash', 'discarded item', 'A2', 'trashed', 'same');
      INSERT INTO learning_review_events VALUES ('r1', 'unchanged');
    `);
    database.close();
    const exported = exportInput(databasePath, inputPath);
    if (exported.count !== 2) fail("Self-test export failed");
    const blinded = blindInput(inputPath, blindPath);
    const blindItems = loadJson(blindPath).items;
    if (blinded.count !== 2 || blindItems.some((item) => "currentCefr" in item)) {
      fail("Self-test blind input failed");
    }
    const split = splitBlindInput(blindPath, batchDirectory, "1");
    if (split.batches !== 2) fail("Self-test split failed");
    writeJson(resultsPath, { assessments: [
      { id: "a", cefr: "A2", reason: "common everyday object" },
      { id: "b", cefr: "C1", reason: "low-frequency general usage" }
    ] });
    const report = applyResults(
      databasePath, inputPath, resultsPath, backupPath, reportPath
    );
    if (report.changedCount !== 2 || report.activeCount !== 2) {
      fail("Self-test report failed");
    }
    return report;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const [command, ...args] = process.argv.slice(2);
let result;
if (command === "export" && args.length === 2) {
  result = exportInput(args[0], args[1]);
} else if (command === "blind" && args.length === 2) {
  result = blindInput(args[0], args[1]);
} else if (command === "split" && args.length === 3) {
  result = splitBlindInput(args[0], args[1], args[2]);
} else if (command === "schemas" && args.length === 1) {
  result = writeBatchSchemas(args[0]);
} else if (command === "merge" && args.length >= 3) {
  result = mergeResults(args[0], args[1], args.slice(2));
} else if (command === "apply" && args.length === 5) {
  result = applyResults(args[0], args[1], args[2], args[3], args[4]);
} else if (command === "self-test" && args.length === 0) {
  result = selfTest();
} else {
  fail("Usage: recalibrate-learning-item-levels.mjs export <db> <input> | blind <input> <blind-input> | split <blind-input> <directory> <batch-size> | schemas <batch-directory> | merge <input> <results> <batch-results...> | apply <db> <input> <results> <backup> <report> | self-test");
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
