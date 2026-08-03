#!/usr/bin/env node
// Generates packages/mcp-server/mcpb/package.json from the parent package.json.
//
// mcpb/package.json determines the dependency set `npm ci --omit=dev` (see
// docs/DEPLOYMENT.md §6a) pulls into the packed .mcpb bundle submitted for Anthropic
// MCP Directory review. It used to be hand-maintained as a near-duplicate of
// ../package.json, and because it's gitignored (.gitignore:65) `git status` never
// showed the drift — that's how @x402/evm, @x402/fetch, and viem survived in the
// bundle after removal from the parent's dependencies. There is now exactly one
// place `dependencies` is declared; this script derives the rest so a second copy
// can never go stale again.
//
// The derivation itself lives in the exported `deriveMcpbManifest()` below, which
// is a pure function of the parsed parent package.json — no filesystem access. That
// split exists so src/__tests__/mcpb-manifest.test.ts can import and call it
// directly, unconditionally, without needing mcpb/package.json to already exist on
// disk (it doesn't on a fresh clone or in CI before this script has run).
//
// Run from packages/mcp-server: npm run gen:mcpb

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve relative to this file, not process.cwd() — the release operator may run
// this from the repo root, packages/mcp-server, or anywhere else.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(SCRIPT_DIR, "..");
const PARENT_PATH = path.join(PKG_ROOT, "package.json");
const OUTPUT_PATH = path.join(PKG_ROOT, "mcpb", "package.json");

/**
 * Pure derivation: takes the parsed parent package.json object and returns the
 * mcpb/package.json object to write. Only remove fields that are actively wrong in
 * the packed-bundle context — everything else (including `version`) is inherited
 * from the parent verbatim, so the generated file always tracks the parent's
 * version with no separate bump step.
 */
export function deriveMcpbManifest(parent) {
  const generated = { ...parent };

  // devDependencies: the whole point of generating this file is that nobody
  // hand-maintains a second dependency list. `npm ci --omit=dev` (§6a) already
  // excludes devDependencies at install time, so dropping the key here doesn't
  // change install behavior — it removes the one place a hand-edited copy (e.g.
  // the two `@types/*` entries this file used to carry) could drift from the
  // parent's.
  delete generated.devDependencies;

  // scripts.prepublishOnly: runs `npm test && npm run build`, both of which need
  // devDependencies (vitest, typescript) this manifest no longer lists. This
  // package.json is never the target of `npm publish` — mcpb packs the directory
  // directly via its own manifest.json — so the hook has no legitimate trigger
  // here and would only fail loudly (missing devDependencies) if something ever
  // ran it.
  if (generated.scripts) {
    const { prepublishOnly, ...remainingScripts } = generated.scripts;
    generated.scripts = remainingScripts;
  }

  // files: npm-publish packing metadata (`["dist", "LICENSE"]`). `mcpb pack`
  // doesn't read it — it reads mcpb/manifest.json's own `server.entry_point` to
  // find the bundle's entry point — and keeping it here would misleadingly imply
  // a `dist/` directory exists inside mcpb/, when the compiled output actually
  // lands in mcpb/server/ (per docs/DEPLOYMENT.md §6a: `cp -r dist mcpb/server`).
  delete generated.files;

  return generated;
}

// Same isDirectEntrypoint pattern as src/index.ts: importing this module (as the
// test does) must never write to disk, only running it directly (`node
// scripts/gen-mcpb-manifest.mjs` / `npm run gen:mcpb`) should.
function comparablePath(filePath) {
  const resolvedPath = path.resolve(filePath);
  try {
    return fs.realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function isDirectEntrypoint(argvPath, modulePath) {
  if (argvPath === undefined) return false;
  return comparablePath(argvPath) === comparablePath(modulePath);
}

const isDirectRun = isDirectEntrypoint(process.argv[1], fileURLToPath(import.meta.url));

if (isDirectRun) {
  const parent = JSON.parse(fs.readFileSync(PARENT_PATH, "utf8"));
  const generated = deriveMcpbManifest(parent);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(generated, null, 2)}\n`);

  const dependencyCount = Object.keys(generated.dependencies ?? {}).length;
  const droppedDevDependencyCount = Object.keys(parent.devDependencies ?? {}).length;

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`  version: ${generated.version}`);
  console.log(`  dependencies: ${dependencyCount} package(s), inherited verbatim from ../package.json`);
  console.log(`  devDependencies: dropped (parent had ${droppedDevDependencyCount})`);
  console.log(`  scripts.prepublishOnly: dropped`);
  console.log(`  files: dropped`);
}
