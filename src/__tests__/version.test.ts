import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(PKG_ROOT, relativePath), "utf8");
}

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(PKG_ROOT, relativePath));
}

/** Pulls the first `version: "x.y.z"` literal out of a source file. */
function firstVersionLiteral(source: string, label: string): string {
  const match = source.match(/version:\s*"([^"]+)"/);
  if (!match) throw new Error(`No version literal found in ${label}`);
  return match[1];
}

const expected = readJson("package.json").version as string;

describe("version consistency", () => {
  it("package.json carries a semver version", () => {
    expect(expected).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it(".mcp/server.json matches in both places", () => {
    const serverJson = readJson(".mcp/server.json");
    expect(serverJson.version).toBe(expected);
    expect(serverJson.packages[0].version).toBe(expected);
  });

  it("mcpb/manifest.json matches", () => {
    expect(readJson("mcpb/manifest.json").version).toBe(expected);
  });

  it("mcpb/package.json matches", () => {
    expect(readJson("mcpb/package.json").version).toBe(expected);
  });

  it("mcpb/package-lock.json matches in both places", () => {
    const lock = readJson("mcpb/package-lock.json");
    expect(lock.version).toBe(expected);
    expect(lock.packages[""].version).toBe(expected);
  });

  it("src/index.ts createServer() matches", () => {
    expect(firstVersionLiteral(readText("src/index.ts"), "src/index.ts")).toBe(expected);
  });

  // Conditional: mcpb/server/ is gitignored build output, absent from a fresh clone.
  // This is the check that catches the 2.0.1 stale-bundle failure (DEPLOYMENT.md:329),
  // so it must run whenever the directory does exist.
  it.skipIf(!exists("mcpb/server/index.js"))("packed bundle matches", () => {
    expect(firstVersionLiteral(readText("mcpb/server/index.js"), "mcpb/server/index.js")).toBe(expected);
  });

  // Conditional: the public mirror is a git subtree of this directory and has no
  // monorepo root, so ../../package-lock.json does not exist there.
  it.skipIf(!exists("../../package-lock.json"))("monorepo lockfile matches", () => {
    const rootLock = readJson("../../package-lock.json");
    expect(rootLock.packages["packages/mcp-server"].version).toBe(expected);
  });
});
