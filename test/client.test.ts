import test from "node:test";
import assert from "node:assert/strict";
import { createBodyService, unpack, BodyServiceError } from "../dist/client.js";
import { loadAsset, loadCatalog, placeAsset, bodyScales, hiddenFlags } from "../dist/assets.js";

const pack = (dtype: string, arr: ArrayBufferView, shape: number[]) => ({ dtype, shape, base64: Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64") });

/** A fetch that answers like the body service and records what it was asked. */
function fakeService() {
  const calls: { url: string; method: string; auth: string | null; body: unknown }[] = [];
  const fake = async (url: string, init: RequestInit) => {
    const h = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? "GET", auth: h.authorization ?? null, body: init.body ? JSON.parse(String(init.body)) : null });
    const path = url.replace("https://svc.example/body/v1/", "");
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    if (path === "topology?sex=female") return ok({
      version: "v2", sex: "female", vertices: 2, triangles: 1, rig: { labels: ["root"], parents: [-1] },
      faces: pack("uint16", Uint16Array.from([0, 1, 1]), [1, 3]), uv: pack("float32", Float32Array.from([0, 0, 1, 1]), [2, 2]),
      skin: { influences: 1, index: pack("uint8", Uint8Array.from([0, 0]), [2, 1]), weight: pack("uint8", Uint8Array.from([255, 255]), [2, 1]) },
    });
    if (path === "body") return ok({
      version: "v2", sex: "female", controls: { height: 0.6, weight: 0.5, bust: 0, waist: 0, hip: 0, age: 0.78 }, age_years: 30,
      measurements: { height_cm: 170, bust_cm: 90, waist_cm: 70, hip_cm: 96 }, fit: { error_cm: 0.1, weight_searched: false },
      vertices: pack("float32", Float32Array.from([0, 0, 1.7, 0.1, 0, 1.7]), [2, 3]), joints: pack("float32", Float32Array.from([0, 0, 1]), [1, 3]), ms: 2,
    });
    if (path === "frames") return ok({ version: "v2", frames: 2, vertices: 2, positions: pack("float32", new Float32Array(12), [2, 2, 3]), ms: 3 });
    if (path === "wardrobe/index.json") return ok([{ id: "hat", label: "Hat", category: "hat", tags: [] }]);
    if (path === "info") return new Response(JSON.stringify({ error: "missing or invalid bearer token" }), { status: 401 });
    return new Response("not here", { status: 404 });
  };
  return { calls, fetch: fake as unknown as typeof fetch };
}

test("client: every call carries the host's token, and a body comes back as typed arrays", async () => {
  const f = fakeService();
  let asked = 0;
  const svc = createBodyService({ endpoint: "https://svc.example/body/v1/", token: async () => { asked++; return "t0k"; }, fetch: f.fetch });
  assert.equal(svc.endpoint, "https://svc.example/body/v1");
  const b = await svc.body({ sex: "female", age_years: 30, measurements: { height_cm: 170, bust_cm: 90, waist_cm: 70, hip_cm: 96 } });
  assert.ok(b.vertices instanceof Float32Array); assert.equal(b.vertices.length, 6); assert.equal(b.vertices[2], Math.fround(1.7));
  assert.equal(b.joints.length, 3); assert.equal(b.fit?.error_cm, 0.1);
  assert.deepEqual(f.calls[0], { url: "https://svc.example/body/v1/body", method: "POST", auth: "Bearer t0k", body: { sex: "female", age_years: 30, measurements: { height_cm: 170, bust_cm: 90, waist_cm: 70, hip_cm: 96 } } });
  assert.equal(asked, 1, "the token is asked for each call, so a host can refresh it");
});

test("client: topology is fetched once per sex and unpacked; frames carry the joint turns", async () => {
  const f = fakeService();
  const svc = createBodyService({ endpoint: "https://svc.example/body/v1", token: "x", fetch: f.fetch });
  const [a, b] = await Promise.all([svc.topology("female"), svc.topology("female")]);
  assert.equal(a, b); assert.equal(f.calls.length, 1);
  assert.ok(a.faces instanceof Uint16Array); assert.deepEqual([...a.faces], [0, 1, 1]);
  assert.deepEqual([...a.skin.weight], [255, 255]); assert.deepEqual(a.rig.labels, ["root"]);
  const fr = await svc.frames({ sex: "female", controls: { height: 0.6 }, frames: [{}, { root: [["z", 10]] }] });
  assert.equal(fr.positions.length, 12); assert.equal(fr.frames, 2);
  assert.deepEqual((f.calls[1]!.body as { frames: unknown }).frames, [{}, { root: [["z", 10]] }]);
});

test("client: a refusal is an error with the service's message and status; no token means no header", async () => {
  const f = fakeService();
  const svc = createBodyService({ endpoint: "https://svc.example/body/v1", fetch: f.fetch });
  await assert.rejects(svc.info(), (e: unknown) => e instanceof BodyServiceError && e.status === 401 && /bearer/.test(e.message));
  assert.equal(f.calls[0]!.auth, null);
  await assert.rejects(svc.bytes("files/nothing.bin"), (e: unknown) => e instanceof BodyServiceError && e.status === 404);
  assert.throws(() => createBodyService({ endpoint: "" }), BodyServiceError);
});

test("client: packed arrays keep their type and length", () => {
  const u32 = unpack(pack("uint32", Uint32Array.from([1, 70000, 3]), [3]));
  assert.ok(u32 instanceof Uint32Array); assert.deepEqual([...u32], [1, 70000, 3]);
  const i16 = unpack(pack("int16", Int16Array.from([-5, 7]), [2]));
  assert.deepEqual([...i16], [-5, 7]);
  assert.throws(() => unpack({ dtype: "float64", shape: [1], base64: "" }), BodyServiceError);
});

/** A two-vertex item bound to body vertices 0, 1 and 2, with a one-unit offset along MakeHuman's up axis. */
function syntheticAsset() {
  const n = 2, tri = 1;
  const bindIdx = Int32Array.from([0, 1, 2, 0, 1, 2]), bindW = Float32Array.from([1, 0, 0, 0.5, 0.5, 0]), offsets = Float32Array.from([0, 1, 0, 0, 0, 0]);
  const uv = new Float32Array(n * 2), faces = Uint32Array.from([0, 1, 1]), dominant = Int32Array.from([0, 1]);
  const parts = [bindIdx, bindW, offsets, uv, faces, dominant];
  const sizes = parts.map((p) => p.byteLength), at = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));
  const buf = new Uint8Array(sizes.reduce((a, b) => a + b, 0));
  parts.forEach((p, i) => buf.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at[i]));
  const head = {
    id: "hat", name: "Hat", tags: [], vertices: n, triangles: tri, scale: { y: [0, 2, 10] as [number, number, number] }, textures: {}, transparent: false, double_sided: false,
    diffuse_color: [1, 1, 1], shininess: 0, layout: { bind_idx: at[0]!, bind_w: at[1]!, offsets: at[2]!, uv: at[3]!, faces: at[4]!, dominant: at[5]! }, hides: [1], license: "CC0 1.0", source: "test",
  };
  return { head, buf: buf.buffer };
}

test("wardrobe: items come from the body service and sit on the body by their binding, scaled by the body's size", async () => {
  const { head, buf } = syntheticAsset();
  const svc = {
    endpoint: "mem", json: async (p: string) => (p === "wardrobe/index.json" ? [{ id: "hat", label: "Hat", category: "hat", tags: [] }] : p === "wardrobe/hat.json" ? head : Promise.reject(new Error(p))),
    bytes: async (p: string) => (p === "wardrobe/hat.bin" ? buf : Promise.reject(new Error(p))),
  } as never;
  assert.equal((await loadCatalog(svc))[0].id, "hat");
  const a = await loadAsset(svc, "hat");
  const body = Float32Array.from([0, 0, 1, 0.2, 0, 1, 0, 0, 2]);          // vertex 2 is one metre above vertex 0: the body is ten MakeHuman units tall here
  const out = new Float32Array(6);
  assert.deepEqual(bodyScales(a.head, body), [1, 1, 1]);
  placeAsset(a, body, out);
  assert.deepEqual([...out].map((v) => Math.round(v * 1e6) / 1e6), [0, 0, 1.1, 0.1, 0, 1]);
  const taller = Float32Array.from([0, 0, 1, 0.2, 0, 1, 0, 0, 3]);
  placeAsset(a, taller, out);
  assert.ok(Math.abs(out[2]! - 1.2) < 1e-6, "the offset grows with the body");
  assert.deepEqual([...hiddenFlags([a], 3)], [0, 1, 0]);
});
