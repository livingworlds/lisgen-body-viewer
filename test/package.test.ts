import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.env.PACKAGE_ROOT!;
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test("package: open licence, public, and every module the README names is exported with its types", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@lisgen/body-viewer"); assert.equal(pkg.license, "Apache-2.0"); assert.equal(pkg.private, undefined);
  for (const sub of [".", "./client", "./poses", "./environments", "./fabrics", "./expressions", "./assets", "./viewport"]) {
    const e = pkg.exports[sub];
    assert.ok(e && e.import && e.types, sub);
    assert.ok(statSync(join(root, e.import)).isFile() && statSync(join(root, e.types)).isFile(), sub);
  }
});

test("package: the bundled data is the open environments and fabrics only, no body model", () => {
  const files = walk(join(root, "assets")).map((f) => f.slice(join(root, "assets").length + 1));
  assert.ok(files.every((f) => /^(env\/[a-z_-]+\.(hdr|jpg)|fabric\/[a-z]+_(color|normal|rough|thumb)\.jpg|LICENCES\.md)$/.test(f)), files.filter((f) => !/^(env|fabric)\//.test(f)).join(", "));
  for (const f of [...walk(join(root, "src")), ...walk(join(root, "dist"))]) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/\/studio\/|emu_g|emu_pose|\bemu\/v\d/.test(text), `${f} points at body model data`);
  }
});
