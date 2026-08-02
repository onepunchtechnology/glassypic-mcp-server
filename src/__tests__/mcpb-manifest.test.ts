import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, relativePath), "utf8"));
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(PKG_ROOT, relativePath));
}

const parent = readJson("package.json");

// Conditional: mcpb/package.json is generated output (scripts/gen-mcpb-manifest.mjs,
// `npm run gen:mcpb`), gitignored (.gitignore:65), and absent from a fresh clone or
// the public mirror. This suite verifies the generator's output agrees with its
// source of truth; it isn't checking tracked source, so it must not run unconditionally.
// If this is skipping locally and you meant to exercise it, run `npm run gen:mcpb` first.
describe("mcpb/package.json generator", () => {
  it.skipIf(!exists("mcpb/package.json"))("dependencies are deep-equal to the parent's", () => {
    const generated = readJson("mcpb/package.json");
    expect(generated.dependencies).toEqual(parent.dependencies);
  });

  it.skipIf(!exists("mcpb/package.json"))("version matches the parent's", () => {
    const generated = readJson("mcpb/package.json");
    expect(generated.version).toBe(parent.version);
  });

  it.skipIf(!exists("mcpb/package.json"))("devDependencies is absent", () => {
    const generated = readJson("mcpb/package.json");
    expect(generated.devDependencies).toBeUndefined();
  });
});
