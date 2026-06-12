const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const ts = require("../umzugshelfer-pwa/node_modules/typescript");

const file = path.join(__dirname, "..", "supabase", "functions", "_shared", "reminder-core.ts");
const source = fs.readFileSync(file, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
  reportDiagnostics: true,
  fileName: file,
});

assert.strictEqual(output.diagnostics.length, 0, "reminder-core.ts must transpile");
const testModule = new Module(file, module);
testModule.filename = file;
testModule.paths = Module._nodeModulePaths(path.dirname(file));
testModule._compile(output.outputText, file);

const {
  dateThresholdKey,
  dayDiff,
  resolveOwnedRecipients,
  shoppingReminderDueDate,
  zonedDateParts,
} = testModule.exports;

assert.strictEqual(dayDiff("2026-06-11", "2026-06-12"), 1);
assert.strictEqual(dateThresholdKey("2026-06-18", "2026-06-11"), "7d");
assert.strictEqual(dateThresholdKey("2026-06-13", "2026-06-11"), null);
assert.deepStrictEqual(
  resolveOwnedRecipients({ created_by_user_id: "two" }, ["one", "two"]),
  ["two"],
);
assert.deepStrictEqual(
  resolveOwnedRecipients({ created_by_user_id: "outside" }, ["one", "two"]),
  ["one", "two"],
);

const vienna = zonedDateParts(new Date("2026-06-11T06:00:00.000Z"), "Europe/Vienna");
assert.strictEqual(vienna.date, "2026-06-11");
assert.strictEqual(vienna.minutes, 8 * 60);

assert.strictEqual(
  shoppingReminderDueDate("2026-06-11", 7 * 60 + 59, "08:00", null),
  null,
);
assert.strictEqual(
  shoppingReminderDueDate("2026-06-11", 8 * 60, "08:00", null),
  "2026-06-11",
);
assert.strictEqual(
  shoppingReminderDueDate("2026-06-11", 8 * 60 + 30, "08:00", "2026-06-11"),
  null,
);
assert.strictEqual(
  shoppingReminderDueDate("2026-06-12", 0, "23:50", "2026-06-10"),
  "2026-06-11",
);
assert.strictEqual(
  shoppingReminderDueDate("2026-06-12", 0, "23:50", "2026-06-11"),
  null,
);
assert.strictEqual(
  shoppingReminderDueDate("2026-06-11", 8 * 60, "ungueltig", null),
  null,
);

console.log("Push edge core tests passed.");
