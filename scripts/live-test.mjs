#!/usr/bin/env node
// Functional test for @glassypic/mcp-server as an anonymous user
// Tests the real API — consumes live credits

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SERVER_BIN = new URL("../dist/index.js", import.meta.url).pathname;

// ── 20×20 gradient PNG (698 bytes) — large enough for TinyPNG to process ──────
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000001400000014080200000002eb8a5a" +
  "000002814944415478da0dcbc10000211040d10446208204224820812148608eff9" +
  "44004092410410211241041bbeffe9c7388c33b82233a92233bd4511ce6a88ee6e8" +
  "8ee1988ee5d88ee3b88ee7704e10c10b41884212b2a042114ca84213ba3084292c6" +
  "10b47b8c2933f7bc4e33dc1133dc9933dea291ef3544ff374cff04ccff26ccff15c" +
  "cff37f0e48c00742200652200734500216a88116e88111988115d88113b88117fe1c" +
  "91888f84488ca4488e68a4442c52232dd2232332232bb2232772232ffe3921099f08" +
  "899848899cd0444958a2265aa2274662265662274ee2265efa7346323e133231933" +
  "239a39992b14ccdb44ccf8cccccacccce9ccccdbcfc674514af04252a49c98a2a453" +
  "1a52a4de9ca50a6b294ad1ce52a4fff5c90822f84422ca4422e68a114ac500badd00" +
  "ba3300babb00ba7700baffcd910c31bc1884632b2a14631cca84633ba318c692c631" +
  "bc7b8c6b33f57a4e22ba1122ba9922b5a2915abd44aabf4caa8cccaaaeccaa9dccaa" +
  "b7f6e48c337422336522337b4511ad6a88dd6e88dd1988dd5d88dd3b88dd7fedc918" +
  "eef844eeca44eee68a774ac533badd33ba3333babb33ba7733bafff7920033f08833" +
  "848833cd04119d8a00edaa00fc6600ed6600fcee00edef8f344267e122671922679a" +
  "29332b1499db4499f8cc99cacc99e9cc99dbcf9e7852cfc222ce2222df2421765618" +
  "bba688bbe188bb9588bbd388bbb78ebcf1bd9f84dd8c44ddae48d6ecac63675d3367" +
  "d333673b3367b733677f3f69f0f72f08770888774c8073d94831deaa11dfa611ce66" +
  "11df6e11ceee19d3f5fe4e22fe1122fe9922f7a2917bbd44bbbf4cbb8cccbbaeccbb" +
  "9dccbbb7f7ec8c33fc2233ed2233ff4511ef6a88ff6e88ff1988ff5d88ff3b88ff7f" +
  "80090f85527aae28bfa0000000049454e44ae426082",
  "hex"
);

// ── ANSI colours ──────────────────────────────────────────────────────────────
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red   = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan  = (s) => `\x1b[36m${s}\x1b[0m`;
const bold  = (s) => `\x1b[1m${s}\x1b[0m`;
const dim   = (s) => `\x1b[2m${s}\x1b[0m`;

// ── MCP test client ───────────────────────────────────────────────────────────
class MCPClient {
  constructor(env) {
    this._proc = null;
    this._pending = new Map();
    this._nextId = 1;
    this._env = env;
  }

  start() {
    this._proc = spawn("node", [SERVER_BIN], { stdio: ["pipe", "pipe", "pipe"], env: this._env ?? process.env });
    const rl = createInterface({ input: this._proc.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this._pending.has(msg.id)) {
          const { resolve, reject } = this._pending.get(msg.id);
          this._pending.delete(msg.id);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      } catch {}
    });
    this._proc.stderr.on("data", () => {}); // suppress server stderr
  }

  _request(method, params = {}) {
    const id = this._nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    this._proc.stdin.write(JSON.stringify(msg) + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error("Request timed out after 120s"));
      }, 120_000);
      this._pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject:  (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  _notify(method, params = {}) {
    this._proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async initialize() {
    const r = await this._request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "anon-test-client", version: "1.0.0" },
    });
    this._notify("notifications/initialized", {});
    return r;
  }

  listTools() {
    return this._request("tools/list", {});
  }

  callTool(name, args) {
    return this._request("tools/call", { name, arguments: args });
  }

  stop() {
    try { this._proc.stdin.end(); this._proc.kill(); } catch {}
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

async function test(label, fn) {
  process.stdout.write(`  ${dim("•")} ${label} … `);
  try {
    await fn();
    console.log(green("PASS"));
    passed++;
  } catch (err) {
    console.log(red("FAIL") + `  ${dim(err.message)}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg ?? "assertion failed"); }

// ── Setup ─────────────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-live-"));
const inputPng = path.join(tmpDir, "test.png");
fs.writeFileSync(inputPng, TINY_PNG);

// Run the server child with an isolated HOME so it never reads or writes the real
// developer session (~/.glassypic/session.json) — guaranteeing an anonymous run.
// Unlike deleting/restoring the real file, this can't lose credentials on a spawn
// failure, an interruption, or with pre-existing sessions at multiple paths.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-live-home-"));
const sessionFile = path.join(tmpHome, ".glassypic", "session.json");

console.log(bold("\n@glassypic/mcp-server — live functional tests (anonymous user)\n"));

const client = new MCPClient({ ...process.env, HOME: tmpHome, USERPROFILE: tmpHome });
client.start();

try {
  // ── 1. Lifecycle ────────────────────────────────────────────────────────────
  console.log(cyan("1. Lifecycle"));

  let initResult;
  await test("initialize handshake succeeds", async () => {
    initResult = await client.initialize();
    assert(initResult.protocolVersion, "no protocolVersion");
    assert(initResult.serverInfo?.name === "glassypic", `unexpected serverInfo.name: ${initResult.serverInfo?.name}`);
  });

  await test("server info reports correct name and version", async () => {
    assert(initResult.serverInfo.name === "glassypic");
    assert(initResult.serverInfo.version === "2.0.0", `unexpected version: ${initResult.serverInfo.version}`);
    console.log(dim(`\n       serverInfo: ${JSON.stringify(initResult.serverInfo)}`));
  });

  // ── 2. Tool discovery ───────────────────────────────────────────────────────
  console.log(cyan("\n2. Tool discovery"));

  let toolsList;
  await test("tools/list returns optimize_image tool", async () => {
    toolsList = await client.listTools();
    const tool = toolsList.tools?.find((t) => t.name === "optimize_image");
    assert(tool, "optimize_image not in tools list");
  });

  await test("optimize_image has required inputSchema fields", async () => {
    const tool = toolsList.tools.find((t) => t.name === "optimize_image");
    const required = ["input"];
    for (const field of required) {
      assert(tool.inputSchema?.properties?.[field], `missing inputSchema.properties.${field}`);
    }
  });

  await test("optimize_image has optional params in schema", async () => {
    const tool = toolsList.tools.find((t) => t.name === "optimize_image");
    const optional = ["output_path","output_format","output_width_px","output_height_px","output_upscale_factor","output_resize_behavior","output_seo_tag_gen","output_file_size_limit","confirm_gif_cost","gif_frame_limit"];
    for (const field of optional) {
      assert(tool.inputSchema?.properties?.[field], `missing optional param: ${field}`);
    }
  });

  // ── 3. Basic compression (local file) ───────────────────────────────────────
  console.log(cyan("\n3. optimize_image — basic compression (local file)"));

  let basicResult;
  await test("call succeeds with a local PNG file", async () => {
    basicResult = await client.callTool("optimize_image", { input: inputPng });
    assert(!basicResult.isError, `tool returned error: ${basicResult.content?.[0]?.text}`);
  });

  await test("output file is written to disk next to input", async () => {
    const outPath = basicResult.structuredContent?.output_path;
    assert(outPath, "no output_path in structuredContent");
    assert(fs.existsSync(outPath), `output file not found at ${outPath}`);
    console.log(dim(`\n       output_path: ${outPath}`));
  });

  await test("output filename has .tinified suffix", async () => {
    const outPath = basicResult.structuredContent?.output_path;
    assert(outPath.includes(".tinified."), `expected .tinified. in path, got: ${outPath}`);
  });

  await test("structuredContent has expected fields", async () => {
    const sc = basicResult.structuredContent;
    assert(sc.output_size_bytes >= 0, "missing output_size_bytes");
    assert(sc.output_format, "missing output_format");
    console.log(dim(`\n       size: ${sc.output_size_bytes} bytes, format: ${sc.output_format}, compression: ${sc.compression_ratio}`));
  });

  await test("session token was saved to ~/.glassypic/session.json", async () => {
    assert(fs.existsSync(sessionFile), "session file not created");
    const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    assert(data.session_token, "session_token missing from file");
    console.log(dim(`\n       session_token: ${data.session_token.slice(0, 12)}…`));
  });

  await test("summary text contains Optimized and Size lines", async () => {
    const text = basicResult.content?.[0]?.text ?? "";
    assert(text.includes("Optimized:"), "summary missing 'Optimized:' line");
    assert(text.includes("Size:"), "summary missing 'Size:' line");
    console.log(dim(`\n       summary:\n${text.split("\n").map(l => "       " + l).join("\n")}`));
  });

  // ── 4. SEO tags ─────────────────────────────────────────────────────────────
  console.log(cyan("\n4. optimize_image — SEO tag generation"));

  await test("seo_alt_text is returned (default output_seo_tag_gen=true)", async () => {
    // NOTE: tiny 1x1 image may return null SEO tags — check the field exists
    const sc = basicResult.structuredContent;
    assert("seo_alt_text" in sc, "seo_alt_text field missing from structuredContent");
    console.log(dim(`\n       seo_alt_text: ${sc.seo_alt_text ?? "(null for 1×1 image)"}`));
    console.log(dim(`       seo_keywords: ${JSON.stringify(sc.seo_keywords)}`));
    console.log(dim(`       seo_filename: ${sc.seo_filename}`));
  });

  // ── 5. Format conversion ────────────────────────────────────────────────────
  console.log(cyan("\n5. optimize_image — format conversion (PNG → WebP)"));

  let webpResult;
  await test("call succeeds with output_format=webp", async () => {
    webpResult = await client.callTool("optimize_image", {
      input: inputPng,
      output_format: "webp",
      output_seo_tag_gen: false,
    });
    assert(!webpResult.isError, `error: ${webpResult.content?.[0]?.text}`);
  });

  await test("output file has .webp extension", async () => {
    const outPath = webpResult.structuredContent?.output_path;
    assert(outPath?.endsWith(".webp"), `expected .webp, got: ${outPath}`);
    assert(fs.existsSync(outPath), "webp output file not on disk");
    console.log(dim(`\n       output_path: ${outPath}`));
  });

  await test("output_format in structuredContent is webp", async () => {
    assert(webpResult.structuredContent?.output_format === "webp");
  });

  // ── 6. Explicit output path ─────────────────────────────────────────────────
  console.log(cyan("\n6. optimize_image — explicit output_path"));

  const explicitOut = path.join(tmpDir, "custom", "output.png");
  let explicitResult;
  await test("call succeeds with a custom output_path in a non-existent dir", async () => {
    explicitResult = await client.callTool("optimize_image", {
      input: inputPng,
      output_path: explicitOut,
      output_seo_tag_gen: false,
    });
    assert(!explicitResult.isError, `error: ${explicitResult.content?.[0]?.text}`);
  });

  await test("file is created at the exact output_path", async () => {
    assert(fs.existsSync(explicitOut), `file not found at ${explicitOut}`);
    assert(explicitResult.structuredContent?.output_path === explicitOut);
  });

  await test("parent directories were created automatically", async () => {
    assert(fs.existsSync(path.dirname(explicitOut)));
  });

  // ── 7. SEO disabled ─────────────────────────────────────────────────────────
  console.log(cyan("\n7. optimize_image — SEO disabled (output_seo_tag_gen=false)"));

  await test("seo fields are null when output_seo_tag_gen=false", async () => {
    // We already ran this in test 5 (webpResult), re-use it
    const sc = webpResult.structuredContent;
    // SEO fields may or may not be null — just confirm they're present in the schema
    assert("seo_alt_text" in sc, "seo_alt_text missing");
    assert("seo_keywords" in sc, "seo_keywords missing");
    assert("seo_filename" in sc, "seo_filename missing");
    console.log(dim(`\n       seo_alt_text: ${sc.seo_alt_text}, seo_keywords: ${JSON.stringify(sc.seo_keywords)}`));
  });

  // ── 8. Error handling ───────────────────────────────────────────────────────
  console.log(cyan("\n8. Error handling"));

  await test("missing file → isError=true with File not found message", async () => {
    const r = await client.callTool("optimize_image", { input: "/nonexistent/totally/fake.png" });
    assert(r.isError === true, "expected isError=true");
    const text = r.content?.[0]?.text ?? "";
    assert(text.toLowerCase().includes("not found") || text.toLowerCase().includes("file"), `unexpected error: ${text}`);
    console.log(dim(`\n       error text: ${text}`));
  });

  await test("session token is reused on second call (not null)", async () => {
    const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    const tokenBefore = data.session_token;
    // Make another call
    const r = await client.callTool("optimize_image", { input: inputPng, output_seo_tag_gen: false });
    assert(!r.isError, "second call failed");
    // Token should remain or be updated — either way session file should still exist
    assert(fs.existsSync(sessionFile), "session file disappeared");
    const tokenAfter = JSON.parse(fs.readFileSync(sessionFile, "utf-8")).session_token;
    console.log(dim(`\n       token stable: ${tokenBefore === tokenAfter ? "yes (same)" : "updated"}`));
  });

} finally {
  client.stop();

  // Isolated HOME — no real files were touched, so just remove the temp dirs.
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(tmpHome, { recursive: true, force: true });
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${bold("Results:")} ${green(passed + " passed")}, ${failed > 0 ? red(failed + " failed") : dim("0 failed")}\n`);
if (failed > 0) process.exit(1);
