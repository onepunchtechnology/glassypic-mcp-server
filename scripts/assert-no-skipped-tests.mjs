#!/usr/bin/env node
// Runs the mcp-server vitest suite and fails if ANY test reports a
// "skipped"/"pending" status.
//
// Why this exists (Finding 1 — CI never exercises the artifact path):
// several assertions in this suite are `it.skipIf(...)`-guarded on build
// artifacts that are absent on a fresh checkout — mcpb/package.json
// (src/__tests__/mcpb-manifest.test.ts, src/__tests__/version.test.ts) and
// mcpb/server/index.js (src/__tests__/version.test.ts). Before this job
// existed, CI ran `npm test` in a clean checkout where those files never
// exist, so those assertions silently skipped on every run — and vitest
// exits 0 whether they ran or were skipped, so a plain re-run after building
// the artifacts proves nothing on its own.
//
// This script runs the suite with the JSON reporter (in addition to the
// normal console reporter, so failures are still legible), parses the
// per-test status out of the report, and fails loudly if any test —
// skipIf-guarded or otherwise — reports "skipped" or "pending". In the
// mcpb-artifact CI job this script runs in, every skipIf precondition should
// already be satisfied: this is a full monorepo checkout (services/api and
// the root package-lock.json exist) and the mcpb bundle has already been
// built and packed by prior steps. Zero skips is therefore the correct bar
// here — any skip means an artifact-gated assertion silently didn't execute.
//
// Run from packages/mcp-server, after the mcpb bundle has been built,
// validated, and packed: node scripts/assert-no-skipped-tests.mjs

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const reportPath = path.join(os.tmpdir(), `mcp-server-vitest-report-${process.pid}.json`);

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npxBin,
  ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile=${reportPath}`],
  { stdio: "inherit" }
);

if (result.error) {
  console.error(red(`\n✗ assert-no-skipped-tests: failed to run vitest: ${result.error.message}\n`));
  process.exit(1);
}

if (result.status !== 0) {
  // Actual test failures were already printed by the default reporter above;
  // just propagate the failure rather than masking it with a different message.
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
} catch (err) {
  console.error(red(`\n✗ assert-no-skipped-tests: could not read/parse vitest JSON report at ${reportPath}: ${err.message}\n`));
  process.exit(1);
} finally {
  fs.rmSync(reportPath, { force: true });
}

const skipped = [];
for (const testResult of report.testResults ?? []) {
  for (const assertion of testResult.assertionResults ?? []) {
    if (assertion.status === "skipped" || assertion.status === "pending") {
      skipped.push(assertion.fullName);
    }
  }
}

if (skipped.length > 0) {
  console.error(
    red(
      `\n✗ assert-no-skipped-tests: ${skipped.length} test(s) reported "skipped" in a run where every skipIf precondition should hold:\n`
    ) +
      skipped.map((name) => `  - ${name}`).join("\n") +
      dim(
        `\n\nVitest exits 0 on skips — that's the exact blind spot Finding 1 closes. A skip here means an` +
          ` artifact-gated assertion silently didn't run. Rebuild the mcpb bundle first (docs/DEPLOYMENT.md §6a):` +
          ` npm run gen:mcpb && npm run build && cp -r dist mcpb/server && (cd mcpb && npm ci --omit=dev && npx mcpb pack)\n`
      )
  );
  process.exit(1);
}

console.log(
  green(`\n✓ assert-no-skipped-tests: 0 skipped (${report.numTotalTests} total, ${report.numPassedTests} passed)\n`)
);
