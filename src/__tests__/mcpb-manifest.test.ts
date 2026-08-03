import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveMcpbManifest } from "../../scripts/gen-mcpb-manifest.mjs";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, relativePath), "utf8"));
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(PKG_ROOT, relativePath));
}

const parent = readJson("package.json");

// Unconditional: deriveMcpbManifest() is a pure function of the parsed parent
// package.json — no filesystem access, no dependency on mcpb/package.json having
// been generated. These assert what the generator guarantees and must run
// everywhere (CI, a fresh clone, the public mirror), because that's the whole
// point of Finding 1 — before this, every assertion here was skipIf-guarded on a
// gitignored, generated file that doesn't exist on a fresh CI checkout, so the
// contract was never actually verified where it gates merges.
describe("deriveMcpbManifest (pure, unconditional)", () => {
  const derived = deriveMcpbManifest(parent);

  it("runtime dependencies are deep-equal to the parent's", () => {
    expect(derived.dependencies).toEqual(parent.dependencies);
  });

  it("version matches the parent's", () => {
    expect(derived.version).toBe(parent.version);
  });

  it("devDependencies is absent", () => {
    expect(derived.devDependencies).toBeUndefined();
  });

  it("scripts.prepublishOnly is dropped while other scripts survive", () => {
    expect(derived.scripts?.prepublishOnly).toBeUndefined();
    expect(parent.scripts?.prepublishOnly).toBeDefined(); // sanity: the field existed to drop
    expect(derived.scripts?.build).toBe(parent.scripts?.build);
    expect(derived.scripts?.test).toBe(parent.scripts?.test);
  });

  it("files is dropped", () => {
    expect(derived.files).toBeUndefined();
    expect(parent.files).toBeDefined(); // sanity: the field existed to drop
  });
});

// Conditional: mcpb/package.json is generated output (scripts/gen-mcpb-manifest.mjs,
// `npm run gen:mcpb`), gitignored (.gitignore:65), and absent from a fresh clone or
// the public mirror. These compare the file actually on disk against what the pure
// function above produces from the same parent — they catch a *stale artifact*
// (someone hand-edited mcpb/package.json, or forgot to regenerate after a
// dependency bump). They intentionally don't run unconditionally: unlike the suite
// above, there's nothing to assert when the file doesn't exist yet.
// If this is skipping locally and you meant to exercise it, run `npm run gen:mcpb` first.
describe("mcpb/package.json on-disk artifact", () => {
  it.skipIf(!exists("mcpb/package.json"))("matches deriveMcpbManifest(parent)", () => {
    const onDisk = readJson("mcpb/package.json");
    expect(onDisk).toEqual(deriveMcpbManifest(parent));
  });
});
