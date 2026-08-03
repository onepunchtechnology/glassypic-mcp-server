#!/usr/bin/env node
// Pack-level smoke test for the packed .mcpb bundle.
//
// mcpb/package-lock.json is tracked and installs from its own dependency tree
// (mcpb/node_modules) — a separate install from the workspace lockfile that
// `npm test` exercises. Both are valid resolutions of the same `^` ranges in
// package.json, but they resolve independently and can diverge (see
// docs/DEPLOYMENT.md §6a). That means `npm test` only proves the *workspace*
// tree works — nothing proves the *shipped* tree does.
//
// This script spawns the packed mcpb/server/index.js exactly like a real
// client would (stdio, JSON-RPC), and asserts tools/list still returns all
// five tools with the title/annotations added for the MCP Directory review
// intact — using whatever SDK version the bundle's own install resolved.
//
// Requires a built mcpb/server/ and an installed mcpb/node_modules/ (see
// docs/DEPLOYMENT.md §6a). Deliberately NOT part of `npm test` or CI — it
// needs build artifacts that don't exist in a fresh checkout, and wiring a
// skip-guarded version into the unit suite defeats the point. Run it
// explicitly, during the release sequence, after `mcpb && npm ci --omit=dev`.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const SERVER_ENTRY = fileURLToPath(new URL("../mcpb/server/index.js", import.meta.url));
const MCPB_NODE_MODULES = fileURLToPath(new URL("../mcpb/node_modules", import.meta.url));
const SDK_PKG_JSON = fileURLToPath(
  new URL("../mcpb/node_modules/@modelcontextprotocol/sdk/package.json", import.meta.url)
);
const SUPABASE_PKG_JSON = fileURLToPath(
  new URL("../mcpb/node_modules/@supabase/supabase-js/package.json", import.meta.url)
);

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
if (!fs.existsSync(SERVER_ENTRY)) {
  console.error(red(`\n✗ smoke-mcpb: ${SERVER_ENTRY} not found.`));
  console.error(
    dim("  Build the packed bundle first (docs/DEPLOYMENT.md §6a): npm run build && cp -r dist mcpb/server\n")
  );
  process.exit(1);
}
if (!fs.existsSync(MCPB_NODE_MODULES)) {
  console.error(red(`\n✗ smoke-mcpb: ${MCPB_NODE_MODULES} not found.`));
  console.error(
    dim("  Install the bundle's own dependency tree first (docs/DEPLOYMENT.md §6a): cd mcpb && npm ci --omit=dev\n")
  );
  process.exit(1);
}

let sdkVersion = "unknown";
let supabaseVersion = "unknown";
try {
  sdkVersion = JSON.parse(fs.readFileSync(SDK_PKG_JSON, "utf-8")).version;
} catch {
  console.error(red(`\n✗ smoke-mcpb: could not read ${SDK_PKG_JSON} — is mcpb/node_modules installed?\n`));
  process.exit(1);
}
try {
  supabaseVersion = JSON.parse(fs.readFileSync(SUPABASE_PKG_JSON, "utf-8")).version;
} catch {
  // Non-fatal — the finding is specifically about the SDK; supabase-js is bonus context.
}

// ── Minimal MCP stdio client ──────────────────────────────────────────────────
class MCPClient {
  constructor() {
    this._proc = null;
    this._pending = new Map();
    this._nextId = 1;
    this._stderr = "";
  }

  start() {
    this._proc = spawn("node", [SERVER_ENTRY], { stdio: ["pipe", "pipe", "pipe"] });

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
    try {
      this._proc.stdin.end();
    } catch {}
    try {
      this._proc.kill();
    } catch {}
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────
console.log(bold("\nsmoke-mcpb — packed .mcpb bundle smoke test\n"));
console.log(dim(`  server entry:                         ${SERVER_ENTRY}`));
console.log(dim(`  @modelcontextprotocol/sdk (shipped):  ${sdkVersion}`));
console.log(dim(`  @supabase/supabase-js (shipped):      ${supabaseVersion}\n`));

const client = new MCPClient();
client.start();

try {
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
  process.exitCode = 1;
} finally {
  client.stop();
}
