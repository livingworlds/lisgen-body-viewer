// Builds dist/: each module in src transpiled to plain ES2022 JavaScript (JSX for React's automatic runtime) with relative imports ending in .js,
// and its type declarations, so the package runs from a git install with no build step. TypeScript comes from the caller's node_modules, or
// TYPESCRIPT_PATH. Every module but the viewport is type-checked in full (strict) first; the viewport's declarations are emitted without a check
// because three's and React's types belong to the host app.
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const need = createRequire(process.env.TYPESCRIPT_PATH ? join(process.env.TYPESCRIPT_PATH, "x.js") : join(process.cwd(), "x.js"));
const ts = need("typescript");
const src = join(root, "src"), dist = join(root, "dist");
const relJs = (text) => text.replace(/(from |import\()"(\.\/[a-z-]+)"/g, '$1"$2.js"');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
const files = readdirSync(src).filter((n) => /\.tsx?$/.test(n)).sort();
for (const f of files) {
  const js = ts.transpileModule(readFileSync(join(src, f), "utf8"), {
    fileName: f,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  writeFileSync(join(dist, f.replace(/\.tsx?$/, ".js")), relJs(js));
}
const options = {
  declaration: true, emitDeclarationOnly: true, noCheck: true, skipLibCheck: true, outDir: dist, rootDir: src, strict: true,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], types: [],
};
const report = (diags) => {
  const errors = diags.filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (!errors.length) return;
  console.error(ts.formatDiagnostics(errors, { getCanonicalFileName: (x) => x, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
  process.exit(1);
};
const checked = ts.createProgram(files.filter((f) => f.endsWith(".ts")).map((f) => join(src, f)), { ...options, noCheck: false, noEmit: true, noUncheckedIndexedAccess: true });
report(ts.getPreEmitDiagnostics(checked));
const program = ts.createProgram(files.map((f) => join(src, f)), options);
report(program.emit().diagnostics);
for (const f of readdirSync(dist).filter((n) => n.endsWith(".d.ts"))) writeFileSync(join(dist, f), relJs(readFileSync(join(dist, f), "utf8")));
console.log("dist:", readdirSync(dist).join(" "));
