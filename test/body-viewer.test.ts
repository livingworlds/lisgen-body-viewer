import test from "node:test";
import assert from "node:assert/strict";
import { sunAt, sunLight, photoSun, placeOf, placeFile, PLACES, hourLabel } from "../dist/environments.js";
import { deltasFor, posed, cycleSeconds, POSES, agePosture, mergeDeltas, handDeltas, rigFrom } from "../dist/poses.js";
import { EXPRESSIONS, FACIAL_ACTIONS, expressionOf, blendExpressions } from "../dist/expressions.js";
const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);

test("sun: at the equator on the equinox the noon sun is overhead and it rises in the east", () => {
  near(sunAt(12, 80, 0).elevationDeg, 90 - 1, 3, "noon elevation");
  const dawn = sunAt(6, 80, 0);
  near(dawn.elevationDeg, 0, 4, "sunrise elevation");
  assert.ok(dawn.dir[0] > 0.9, "east is +x");
});
test("sun: at 45 degrees north the midsummer noon sun stands near 68 degrees, due south (+z); south of the tropics it is due north", () => {
  const s = sunAt(12, 172, 45);
  near(s.elevationDeg, 90 - 45 + 23.4, 1.5);
  assert.ok(s.dir[2] > 0.3, "south is +z in the scene");
  assert.ok(sunAt(12, 355, 45).elevationDeg < 25, "midwinter noon is low");
  assert.ok(sunAt(12, 172, -35).dir[2] < -0.3, "in the southern hemisphere the noon sun is to the north (-z)");
});
test("sun: the latitude is the caller's, there is no default place", () => {
  assert.equal(sunAt.length, 3);
});
test("sun light: none below the horizon, warmer and weaker low, whiter and stronger high", () => {
  assert.equal(sunLight(-5).strength, 0);
  const low = sunLight(5), high = sunLight(50);
  assert.ok(high.strength > low.strength);
  assert.ok(((low.color >> 8) & 255) < ((high.color >> 8) & 255), "lower sun has less green: warmer");
});
test("photographed sun: a unit direction, and every place has a unique id", () => {
  const d = photoSun({ u: 0.6, v: 0.7 });
  near(Math.hypot(...d), 1, 1e-9);
  assert.equal(new Set(PLACES.map((p) => p.id)).size, PLACES.length);
  assert.equal(placeOf("nonsense").id, "studio");
  assert.equal(placeOf("custom").kind, "image");
  assert.equal(hourLabel(17.25), "17:15");
  assert.equal(placeFile("/cdn/bv/", placeOf("meadow")), "/cdn/bv/env/meadow.hdr");
  assert.equal(placeFile("/cdn/bv", placeOf("meadow"), "jpg"), "/cdn/bv/env/meadow.jpg");
  assert.equal(placeFile("/cdn/bv", placeOf("studio")), null, "a room has no photograph");
});

test("poses: a stride repeats, and the right leg is the left half a stride on", () => {
  for (const id of ["walk", "run"]) {
    assert.deepEqual(deltasFor(id, 0.37)["upperleg01.L"], deltasFor(id, 1.37)["upperleg01.L"]);
    assert.deepEqual(deltasFor(id, 0.2)["upperleg01.R"], deltasFor(id, 0.7)["upperleg01.L"]);
    assert.ok(cycleSeconds(id) > 0);
  }
  assert.equal(cycleSeconds("stand"), 0);
  assert.equal(POSES.find((p) => p.id === "walk").moving, true);
  assert.deepEqual(deltasFor("rest"), {});
});

test("ageing posture: none before fifty, then a forward curve that grows and stops at ninety", () => {
  assert.deepEqual(agePosture(40), {});
  assert.deepEqual(agePosture(50), {});
  const mid = agePosture(70).spine03[0][1], old = agePosture(90).spine03[0][1];
  assert.ok(mid > 0 && old > mid); near(old, 9, 1e-9);
  assert.equal(agePosture(120).spine03[0][1], old);
  const merged = mergeDeltas({ spine03: [["x", 3]], a: [["y", 1]] }, { spine03: [["z", 2]], b: [["x", 5]] });
  assert.deepEqual(merged.spine03, [["x", 3], ["z", 2]]); assert.deepEqual(merged.b, [["x", 5]]);
});

/** A hanging chain: root, upper arm and forearm along -z, one vertex on each. */
const rig = (() => {
  const labels = ["root", "upper", "lower"], parents = [-1, 0, 1];
  return rigFrom({ version: "t", sex: "female", vertices: 2, triangles: 0, faces: new Uint16Array(0), uv: new Float32Array(4), skin: { influences: 1, index: Uint8Array.from([1, 2]), weight: Uint8Array.from([255, 255]) }, rig: { labels, parents } });
})();
const heads = Float64Array.from([0, 0, 1, 0, 0, 1, 0, 0, 0.5]);
test("skinning: a joint's turn moves what hangs from it about its own head, and its child follows", () => {
  const rest = Float32Array.from([0, 0, 0.25, 0, 0, 0.1]);       // one vertex on the upper bone, one on the lower
  const out = new Float32Array(6);
  posed(rig, rest, heads, {}, out);
  assert.deepEqual([...out], [...rest], "no pose is no change");
  posed(rig, rest, heads, { upper: [["x", 90]] }, out);
  // the upper vertex is 0.75 below the shoulder and swings to 0.75 forward; the forearm vertex follows its parent's swing
  near(out[0], 0, 1e-6); near(out[1], 0.75, 1e-6, "upper vertex"); near(out[2], 1, 1e-6);
  near(out[3], 0, 1e-6); near(out[4], 0.9, 1e-6, "forearm vertex follows the upper arm"); near(out[5], 1, 1e-6);
  posed(rig, rest, heads, { upper: [["x", 90]], lower: [["x", 90]] }, out);
  near(out[4], 0.5, 1e-6, "elbow flexed on top of the swing"); near(out[5], 1.4, 1e-6);
});

test("rig: built from a topology, with joints after their parents", () => {
  assert.equal(rig.bones, 3); assert.equal(rig.index.get("lower"), 2);
  const t = { version: "t", sex: "female", vertices: 0, triangles: 0, faces: new Uint16Array(0), uv: new Float32Array(0), skin: { influences: 1, index: new Uint8Array(0), weight: new Uint8Array(0) } };
  assert.throws(() => rigFrom({ ...t, rig: { labels: ["a", "b"], parents: [1, -1] } }), /after their parents/);
  assert.throws(() => rigFrom({ ...t, rig: { labels: ["a"], parents: [-1, 0] } }), /inconsistent/);
});

test("expressions: 52 distinct facial actions, every ready mix uses only them, and mixes blend within 0..1", () => {
  assert.equal(FACIAL_ACTIONS.length, 52); assert.equal(new Set(FACIAL_ACTIONS).size, 52);
  for (const e of EXPRESSIONS) for (const n of Object.keys(e.weights)) assert.ok(FACIAL_ACTIONS.includes(n), `${e.id}: ${n}`);
  assert.equal(expressionOf("nonsense").id, "neutral");
  const b = blendExpressions([{ weights: expressionOf("laugh").weights, amount: 1 }, { weights: expressionOf("smile").weights, amount: 1 }]);
  assert.equal(b.mouthSmileLeft, 1, "held to one");
  near(blendExpressions([{ weights: { jawOpen: 0.6 }, amount: 0.5 }]).jawOpen, 0.3, 1e-12);
});

test("hands: fingers curl toward the palm about their own axis, and the curl scales", () => {
  // a left hand hanging with the palm toward the body (-x) and the thumb forward (-y)
  const labels = ["root", "wrist.L", "finger1-1.L", "finger5-1.L", "finger3-1.L", "finger3-2.L", "finger3-3.L"];
  const parents = [-1, 0, 1, 1, 1, 4, 5];
  const rigH = rigFrom({ version: "t", sex: "female", vertices: 1, triangles: 0, faces: new Uint16Array(0), uv: new Float32Array(2), skin: { influences: 1, index: Uint8Array.from([6]), weight: Uint8Array.from([255]) }, rig: { labels, parents } });
  const h = Float64Array.from([0, 0, 1, 0, 0, 1, 0, -0.03, 0.95, 0, 0.03, 0.92, 0, 0, 0.9, 0, 0, 0.85, 0, 0, 0.8]);
  const d = handDeltas(rigH, h, 0.35);
  assert.ok(d["finger3-1.L"] && d["finger3-2.L"] && d["finger3-3.L"], "the middle finger has all three joints");
  const tipRest = Float32Array.from([0, 0, 0.75]), out = new Float32Array(3);
  posed(rigH, tipRest, h, d, out);
  assert.ok(out[0] < -0.005, `the fingertip moves toward the palm (-x): ${out[0]}`);
  const more = handDeltas(rigH, h, 0.7), out2 = new Float32Array(3);
  posed(rigH, tipRest, h, more, out2);
  assert.ok(out2[0] < out[0], "a tighter curl moves it further");
  const none = new Float32Array(3); posed(rigH, tipRest, h, handDeltas(rigH, h, 0), none);
  near(none[0], 0, 1e-9);
});
test("poses: the runway walk is slower and narrower than the walk, and the new static poses set the pelvis and arms", () => {
  assert.ok(cycleSeconds("runway") > cycleSeconds("walk"));
  const w = deltasFor("weight"), hip = deltasFor("hip");
  assert.ok(w["upperleg01.R"] && w["spine03"] && hip["lowerarm01.L"]);
  assert.ok(POSES.some((p) => p.id === "runway" && p.moving));
});
