// Builds dist (scripts/build.mjs), then transpiles the tests with TypeScript and runs them against dist with node's test runner. TypeScript comes
// from the caller's node_modules, or TYPESCRIPT_PATH.
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
if (!process.argv.includes("--no-build")) {
  const b = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], { stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const need = createRequire(process.env.TYPESCRIPT_PATH ? join(process.env.TYPESCRIPT_PATH, "x.js") : join(process.cwd(), "x.js"));
const ts = need("typescript");
const out = mkdtempSync(join(tmpdir(), "body-viewer-test-"));
const dist = pathToFileURL(join(root, "dist")).href;
const tests = readdirSync(here).filter((n) => n.endsWith(".test.ts")).map((f) => {
  const js = ts.transpileModule(readFileSync(join(here, f), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const name = join(out, f.replace(/\.ts$/, ".mjs"));
  writeFileSync(name, js.replaceAll('"../dist/', `"${dist}/`));
  return name;
});
const r = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit", env: { ...process.env, PACKAGE_ROOT: root } });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
