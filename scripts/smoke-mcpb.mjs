#!/usr/bin/env node
// Archive smoke test for the packed .mcpb bundle.
//
// This test operates on the REAL PACKED ARCHIVE, not the staging tree. An
// earlier version of this script spawned mcpb/server/index.js directly out of
// the staging directory (mcpb/server/ + mcpb/node_modules/) — which proves the
// staging tree works, but says nothing about the archive `mcpb pack` actually
// produces. `mcpb pack` applies its own inclusion/exclusion rules (.mcpbignore,
// manifest-declared files); a packaging omission there — a file silently
// excluded that the server needs at runtime — went completely undetected by a
// staging-tree test. The name "pack-level smoke test" was wrong for exactly
// that reason: it ran before packing, not after, and never touched the .mcpb.
//
// This script instead:
//   1. Extracts the packed .mcpb (an ordinary zip) to a temp directory via the
//      platform `unzip` binary (Node has no bundled unzip).
//   2. Reads the extracted manifest.json to find the declared server entry
//      point, and asserts it actually exists in the extracted tree.
//   3. Asserts the extracted node_modules contains no @x402/* or viem package
//      — the crypto-payment removal gate, checked against what actually
//      shipped, not the staging tree or the lockfile.
//   4. Spawns the server FROM THE EXTRACTED COPY (not mcpb/server/) and drives
//      the same initialize -> tools/list sequence as before, keeping every
//      existing assertion (five tools, non-empty title + annotations object,
//      status.readOnlyHint=true with no destructiveHint key,
//      optimize_image.destructiveHint=false).
//   5. Reports the SDK / supabase-js versions read from the EXTRACTED tree, so
//      the versions printed are the ones that actually shipped in this archive.
//
// Requires a packed archive (see docs/DEPLOYMENT.md §6a):
//   cd mcpb && npx mcpb pack && cd ..
// `npx mcpb` (never `npx @anthropic-ai/mcpb` or a global `mcpb`) resolves the
// CLI pinned in ../package.json devDependencies, so the archive this script
// checks was packed by the same CLI version CI used — see DEPLOYMENT.md §6a.
// which produces mcpb/mcpb.mcpb (mcpb pack's default output name, independent
// of the manifest's `name`/`version` fields — only renamed to
// glassypic-X.Y.Z.mcpb by the release step that follows this smoke test).
//
// Deliberately NOT part of `npm test` or CI's `mcp-server` job — it needs a
// packed archive that doesn't exist in a fresh checkout. It IS run in CI's
// `mcpb-artifact` job, which reproduces the full release sequence from a clean
// checkout specifically so this path gets exercised.
//
// Usage: node scripts/smoke-mcpb.mjs [path/to/archive.mcpb]
// Defaults to mcpb/mcpb.mcpb resolved relative to this script's own location
// (not process.cwd()), so it works whether invoked from the repo root,
// packages/mcp-server, or CI's working-directory.

import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ARCHIVE = path.join(PKG_ROOT, "mcpb", "mcpb.mcpb");
const ARCHIVE_PATH = path.resolve(process.argv[2] ?? DEFAULT_ARCHIVE);

const TIMEOUT_MS = 8000;
const EXPECTED_TOOLS = ["optimize_image", "login", "logout", "status", "upgrade"];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ── Preconditions ────────────────────────────────────────────────────────────
if (!fs.existsSync(ARCHIVE_PATH)) {
  console.error(red(`\n✗ smoke-mcpb: archive not found at ${ARCHIVE_PATH}`));
  console.error(
    dim(
      "  Pack it first (docs/DEPLOYMENT.md §6a): cd mcpb && npm ci --omit=dev && npx mcpb pack && cd ..\n"
    )
  );
  process.exit(1);
}

const unzipCheck = spawnSync("unzip", ["-v"]);
if (unzipCheck.error) {
  console.error(
    red(
      `\n✗ smoke-mcpb: the "unzip" binary is required to extract the packed .mcpb archive but was not found on PATH.\n`
    )
  );
  process.exit(1);
}

// ── Minimal MCP stdio client ──────────────────────────────────────────────────
class MCPClient {
  constructor(serverEntry, cwd) {
    this._serverEntry = serverEntry;
    this._cwd = cwd;
    this._proc = null;
    this._pending = new Map();
    this._nextId = 1;
    this._stderr = "";
  }

  start() {
    this._proc = spawn("node", [this._serverEntry], { cwd: this._cwd, stdio: ["pipe", "pipe", "pipe"] });

    const rl = createInterface({ input: this._proc.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return; // ignore non-JSON stdout noise
      }
      if (msg.id !== undefined && this._pending.has(msg.id)) {
        const { resolve, reject } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        msg.error ? reject(new Error(`server returned an error: ${msg.error.message}`)) : resolve(msg.result);
      }
    });

    this._proc.stderr.on("data", (chunk) => {
      this._stderr += chunk.toString();
    });

    const onEarlyExit = (code, signal) => {
      const err = new Error(
        `server process exited early (code=${code}, signal=${signal})` +
          (this._stderr ? `\n  stderr:\n${this._stderr}` : "")
      );
      for (const { reject } of this._pending.values()) reject(err);
      this._pending.clear();
    };
    this._proc.on("exit", onEarlyExit);
    this._proc.on("error", (err) => {
      for (const { reject } of this._pending.values()) reject(err);
      this._pending.clear();
    });
  }

  _request(method, params = {}) {
    const id = this._nextId++;
    this._proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(
          new Error(
            `${method} timed out after ${TIMEOUT_MS}ms — server did not respond` +
              (this._stderr ? `\n  stderr:\n${this._stderr}` : "")
          )
        );
      }, TIMEOUT_MS);
      this._pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  _notify(method, params = {}) {
    this._proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async initialize() {
    const result = await this._request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-mcpb", version: "1.0.0" },
    });
    this._notify("notifications/initialized", {});
    return result;
  }

  listTools() {
    return this._request("tools/list");
  }

  stop() {
    if (!this._proc) return;
    try {
      this._proc.stdin.end();
    } catch {}
    try {
      this._proc.kill();
    } catch {}
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────
let tempDir = null;
let client = null;
let exitCode = 0;

try {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-mcpb-smoke-"));

  const unzipResult = spawnSync("unzip", ["-q", ARCHIVE_PATH, "-d", tempDir]);
  if (unzipResult.status !== 0) {
    throw new Error(
      `failed to extract ${ARCHIVE_PATH} into ${tempDir} (unzip exited ${unzipResult.status})` +
        (unzipResult.stderr?.length ? `\n${unzipResult.stderr.toString()}` : "")
    );
  }

  // ── Manifest-driven entry point ─────────────────────────────────────────────
  const manifestPath = path.join(tempDir, "manifest.json");
  assert(fs.existsSync(manifestPath), `extracted archive is missing manifest.json at ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const entryPointRel = manifest.server?.entry_point;
  assert(typeof entryPointRel === "string" && entryPointRel.length > 0, "manifest.json has no server.entry_point");
  const serverEntry = path.join(tempDir, entryPointRel);
  assert(
    fs.existsSync(serverEntry),
    `packed archive is missing its declared server entry point "${entryPointRel}" (resolved: ${serverEntry}) — mcpb pack or .mcpbignore silently dropped it`
  );

  // ── Crypto-package gate, against what actually shipped ──────────────────────
  const nodeModulesDir = path.join(tempDir, "node_modules");
  assert(fs.existsSync(nodeModulesDir), `extracted archive has no node_modules at ${nodeModulesDir}`);
  assert(
    !fs.existsSync(path.join(nodeModulesDir, "viem")),
    `packed archive's node_modules contains a "viem" package — crypto-payment code must not ship (docs/DEPLOYMENT.md §6a)`
  );
  assert(
    !fs.existsSync(path.join(nodeModulesDir, "@x402")),
    `packed archive's node_modules contains an "@x402" scope — crypto-payment code must not ship (docs/DEPLOYMENT.md §6a)`
  );

  // ── Versions, read from the EXTRACTED tree so they reflect what shipped ─────
  const sdkPkgJsonPath = path.join(nodeModulesDir, "@modelcontextprotocol", "sdk", "package.json");
  const supabasePkgJsonPath = path.join(nodeModulesDir, "@supabase", "supabase-js", "package.json");

  let sdkVersion = "unknown";
  try {
    sdkVersion = JSON.parse(fs.readFileSync(sdkPkgJsonPath, "utf-8")).version;
  } catch {
    throw new Error(`could not read ${sdkPkgJsonPath} — packed archive is missing the MCP SDK package`);
  }

  let supabaseVersion = "unknown";
  try {
    supabaseVersion = JSON.parse(fs.readFileSync(supabasePkgJsonPath, "utf-8")).version;
  } catch {
    // Non-fatal — the finding is specifically about the SDK; supabase-js is bonus context.
  }

  console.log(bold("\nsmoke-mcpb — packed .mcpb archive smoke test\n"));
  console.log(dim(`  archive:                               ${ARCHIVE_PATH}`));
  console.log(dim(`  extracted to:                          ${tempDir}`));
  console.log(dim(`  server entry (extracted):              ${serverEntry}`));
  console.log(dim(`  @modelcontextprotocol/sdk (shipped):   ${sdkVersion}`));
  console.log(dim(`  @supabase/supabase-js (shipped):       ${supabaseVersion}\n`));

  console.log(green("✓ archive contains its declared entry point and no @x402/*/viem packages"));

  client = new MCPClient(serverEntry, tempDir);
  client.start();

  await client.initialize();

  const { tools } = await client.listTools();
  assert(Array.isArray(tools), "tools/list response did not include a tools array");

  const names = tools.map((t) => t.name).sort();
  const expectedSorted = [...EXPECTED_TOOLS].sort();
  assert(
    tools.length === EXPECTED_TOOLS.length && names.every((n, i) => n === expectedSorted[i]),
    `expected exactly these 5 tools: [${expectedSorted.join(", ")}]\n  got ${tools.length}: [${names.join(", ")}]`
  );
  console.log(green(`✓ tools/list returned exactly the 5 expected tools: ${names.join(", ")}`));

  for (const tool of tools) {
    assert(
      typeof tool.title === "string" && tool.title.trim().length > 0,
      `tool "${tool.name}" has no non-empty title (got: ${JSON.stringify(tool.title)})`
    );
    assert(
      tool.annotations !== undefined && tool.annotations !== null && typeof tool.annotations === "object",
      `tool "${tool.name}" has no annotations object (got: ${JSON.stringify(tool.annotations)})`
    );
  }
  console.log(green("✓ every tool has a non-empty title and an annotations object"));

  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  assert(
    byName.status.annotations.readOnlyHint === true,
    `status.annotations.readOnlyHint should be true, got ${JSON.stringify(byName.status.annotations.readOnlyHint)}`
  );
  assert(
    !("destructiveHint" in byName.status.annotations),
    `status.annotations should not have a destructiveHint key, got ${JSON.stringify(byName.status.annotations.destructiveHint)}`
  );
  console.log(green("✓ status: readOnlyHint=true, no destructiveHint key"));

  assert(
    byName.optimize_image.annotations.destructiveHint === false,
    `optimize_image.annotations.destructiveHint should be false, got ${JSON.stringify(byName.optimize_image.annotations.destructiveHint)}`
  );
  console.log(green("✓ optimize_image: destructiveHint=false"));

  console.log(bold(green("\nsmoke-mcpb PASSED")));
  console.log(dim(`SDK actually served this run: @modelcontextprotocol/sdk@${sdkVersion}\n`));
} catch (err) {
  console.error(red(`\n✗ smoke-mcpb FAILED: ${err.message}\n`));
  exitCode = 1;
} finally {
  if (client) client.stop();
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error(dim(`  (non-fatal: failed to remove temp dir ${tempDir}: ${cleanupErr.message})`));
    }
  }
}

process.exitCode = exitCode;
