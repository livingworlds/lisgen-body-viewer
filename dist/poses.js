/**
 * Poses and movement for the body, in the browser. The body service gives where the joints are for any body (`joints` in a body result) and, once,
 * the joint tree and the skin weights that say how each vertex follows them (`topology`). A pose is a turn of each joint about the world's own axes (x across the body, y front to back with the back
 * positive, z up). The body is bent by linear blend skinning, the method the body model uses itself, so a pose costs a few matrix products and a walk
 * plays at frame rate on any device.
 *
 * The poses are standing, sitting, walking and running, built from joint angles of ordinary human movement (hip and knee flexion, ankle, arm swing, a
 * little lean). They are for seeing how clothing reads in a position; they are not measured from a particular person, and cloth does not yet follow them.
 */
export const POSES = [
    { id: "rest", label: "A-pose", moving: false },
    { id: "stand", label: "Standing", moving: false },
    { id: "weight", label: "Weight on one leg", moving: false },
    { id: "hip", label: "Hand on hip", moving: false },
    { id: "sit", label: "Sitting", moving: false },
    { id: "walk", label: "Walking", moving: true },
    { id: "runway", label: "Runway walk", moving: true },
    { id: "run", label: "Running", moving: true },
];
/* ── gait: joint angles over a stride, from ordinary human walking and running, interpolated round the cycle ─────────────────────────── */
const KEY = {
    runway: { hip: [34, 28, 8, -10, -14, -3, 26, 38], knee: [3, 14, 6, 5, 30, 66, 44, 8], plantar: [0, 6, -2, -10, 16, 6, -3, 0], arm: 8, elbow: 0, lean: -2, cycle: 1.35 },
    walk: { hip: [28, 24, 6, -8, -12, -2, 22, 32], knee: [4, 16, 8, 6, 34, 60, 38, 8], plantar: [0, 7, -2, -9, 14, 5, -3, 0], arm: 18, elbow: 0, lean: 3, cycle: 1.1 },
    run: { hip: [45, 38, 5, -15, -22, 0, 38, 52], knee: [18, 40, 30, 14, 62, 108, 85, 30], plantar: [4, 8, -6, -12, 28, 10, -4, 2], arm: 40, elbow: 40, lean: 10, cycle: 0.7 },
};
/** Seconds one full stride (left foot to left foot) takes. */
export const cycleSeconds = (id) => (id === "walk" || id === "run" || id === "runway" ? KEY[id].cycle : 0);
function loop(table, phase) {
    const n = table.length, p = ((phase % 1) + 1) % 1 * n, i = Math.floor(p), f = p - i;
    const a = table[i % n], b = table[(i + 1) % n];
    const s = f * f * (3 - 2 * f); // eased between keys
    return a + (b - a) * s;
}
// the body model's rest already has the forearm bent forward about 50 degrees, so elbow angles below are added to that
const ARM_DOWN = 33; // from the body model's rest (arms about 47 degrees below level) to hanging with a little air at the side
/** The turns of each joint for a pose. `phase` is 0 to 1 round a stride and only matters for walking and running. */
export function deltasFor(id, phase = 0) {
    const d = {};
    const armsDown = (swingL, swingR, elbowL, elbowR) => {
        d["upperarm01.L"] = [["y", ARM_DOWN], ["x", -swingL]];
        d["upperarm01.R"] = [["y", -ARM_DOWN], ["x", -swingR]];
        d["lowerarm01.L"] = [["x", -elbowL]];
        d["lowerarm01.R"] = [["x", -elbowR]];
    };
    if (id === "rest")
        return d;
    if (id === "stand") {
        armsDown(3, 3, 0, 0);
        return d;
    }
    if (id === "weight") {
        // weight on the left leg: the pelvis drops on the free side, the spine curves back the other way, the free knee softens and steps a little forward
        armsDown(2, 6, 0, 4);
        d["upperleg01.R"] = [["x", -9], ["y", -5]];
        d["lowerleg01.R"] = [["x", 14]];
        d["foot.R"] = [["x", 9 - 14 + 6]];
        d["upperleg01.L"] = [["y", 2]];
        d["spine05"] = [["z", 3]];
        d["spine03"] = [["z", -5], ["x", 1.5]];
        d["neck01"] = [["z", 3]];
        return d;
    }
    if (id === "hip") {
        // the left hand on the left hip, the elbow out, the other arm easy, a little weight shift
        d["upperarm01.L"] = [["y", 6], ["z", 0], ["x", 8]];
        d["lowerarm01.L"] = [["z", -70], ["x", -20]];
        d["upperarm01.R"] = [["y", -ARM_DOWN], ["x", -4]];
        d["upperleg01.R"] = [["x", -7], ["y", -4]];
        d["lowerleg01.R"] = [["x", 11]];
        d["foot.R"] = [["x", 7 - 11 + 5]];
        d["spine05"] = [["z", 2.5]];
        d["spine03"] = [["z", -4]];
        d["neck01"] = [["z", 4]];
        return d;
    }
    if (id === "sit") {
        for (const s of ["L", "R"]) {
            d[`upperleg01.${s}`] = [["x", -88], ["y", s === "L" ? -4 : 4]];
            d[`lowerleg01.${s}`] = [["x", 88]];
        }
        d["spine03"] = [["x", 6]];
        armsDown(6, 6, 0, 0);
        return d;
    }
    const k = KEY[id];
    for (const [s, off] of [["L", 0], ["R", 0.5]]) {
        const ph = phase + off;
        const hip = loop(k.hip, ph), knee = loop(k.knee, ph), pl = loop(k.plantar, ph);
        d[`upperleg01.${s}`] = [["x", -hip]];
        d[`lowerleg01.${s}`] = [["x", knee]];
        d[`foot.${s}`] = [["x", hip - knee + pl]]; // the foot keeps its own angle whatever the leg above does
    }
    const hipL = loop(k.hip, phase), hipR = loop(k.hip, phase + 0.5), mid = (a) => a - (k.hip.reduce((x, y) => x + y, 0) / k.hip.length);
    armsDown(-(mid(hipL) / 30) * k.arm, -(mid(hipR) / 30) * k.arm, k.elbow, k.elbow); // each arm swings against its own side's leg
    if (id === "runway") {
        d["upperarm01.L"] = [["y", 30], ["x", (mid(hipR) / 30) * k.arm]];
        d["upperarm01.R"] = [["y", -30], ["x", (mid(hipL) / 30) * k.arm]];
        d["spine03"] = [["x", k.lean], ["z", 6 * Math.sin(phase * 2 * Math.PI)]];
        d["spine05"] = [["z", -6 * Math.sin(phase * 2 * Math.PI)]];
        return d;
    }
    if (id === "run") {
        d["upperarm01.L"] = [["y", 24], ["x", (mid(hipL) / 30) * k.arm]];
        d["upperarm01.R"] = [["y", -24], ["x", (mid(hipR) / 30) * k.arm]];
    }
    else {
        d["upperarm01.L"] = [["y", ARM_DOWN], ["x", (mid(hipR) / 30) * k.arm]];
        d["upperarm01.R"] = [["y", -ARM_DOWN], ["x", (mid(hipL) / 30) * k.arm]];
    }
    d["spine03"] = [["x", k.lean], ["z", 4 * Math.sin(phase * 2 * Math.PI)]];
    d["spine01"] = [["z", -3 * Math.sin(phase * 2 * Math.PI)]];
    return d;
}
/**
 * How posture changes with the years: from about fifty the upper back and neck curve forward a little more each decade, by ninety about nine degrees at
 * the mid back and eight at the neck. A rule of thumb for showing ageing, not a measurement of any person.
 */
export function agePosture(years) {
    const t = Math.min(1, Math.max(0, (years - 50) / 40));
    if (t === 0)
        return {};
    return { spine03: [["x", 9 * t]], spine01: [["x", 7 * t]], neck01: [["x", 8 * t]] };
}
/** Two sets of joint turns as one: where a joint has turns in both, `a` happens first and `b` after. */
export function mergeDeltas(a, b) {
    const out = { ...a };
    for (const [k, ops] of Object.entries(b))
        out[k] = [...(out[k] ?? []), ...ops];
    return out;
}
/** The rig for posing, from a body service's topology. Joints are listed parents first. */
export function rigFrom(t) {
    const { labels, parents } = t.rig;
    if (labels.length !== parents.length)
        throw new Error("the joint tree is inconsistent");
    parents.forEach((p, i) => { if (p >= i)
        throw new Error("joints must come after their parents"); });
    return { labels, parents, bones: labels.length, influences: t.skin.influences, skinIndex: t.skin.index, skinWeight: t.skin.weight, index: new Map(labels.map((l, i) => [l, i])) };
}
/** The joint positions of a body result as the posing code reads them. */
export const headsOf = (joints) => Float64Array.from(joints);
const ID3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
function rot(axis, deg) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    if (axis === "x")
        return [1, 0, 0, 0, c, -s, 0, s, c];
    if (axis === "y")
        return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
}
function mulVec(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
/** A turn of `deg` degrees about any axis (Rodrigues). */
function aboutAxis(deg, axis) {
    const n = Math.hypot(axis[0], axis[1], axis[2]) || 1, x = axis[0] / n, y = axis[1] / n, z = axis[2] / n;
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), u = 1 - c;
    return [c + x * x * u, x * y * u - z * s, x * z * u + y * s, y * x * u + z * s, c + y * y * u, y * z * u - x * s, z * x * u - y * s, z * y * u + x * s, c + z * z * u];
}
const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
/**
 * Bend a rest surface to a pose. `rest` is the body at rest (3 numbers per vertex), `heads` the rest joint positions, `deltas` the turn of each joint.
 * Each joint's turn is about its own head, on top of its parent's. Writes the posed surface into `out`.
 */
export function posed(rig, rest, heads, deltas, out, bonesOut) {
    const J = rig.bones;
    const R = new Array(J), headP = new Float64Array(J * 3);
    for (let b = 0; b < J; b++) {
        const par = rig.parents[b];
        let d = ID3();
        const ops = deltas[rig.labels[b]];
        const Rp = par >= 0 ? R[par] : ID3();
        if (ops)
            for (const op of ops)
                d = mul(op[0] === "a" ? aboutAxis(op[1], mulVec(Rp, [op[2], op[3], op[4]])) : rot(op[0], op[1]), d);
        R[b] = mul(d, Rp);
        if (par < 0) {
            headP[b * 3] = heads[b * 3];
            headP[b * 3 + 1] = heads[b * 3 + 1];
            headP[b * 3 + 2] = heads[b * 3 + 2];
        }
        else {
            const dx = heads[b * 3] - heads[par * 3], dy = heads[b * 3 + 1] - heads[par * 3 + 1], dz = heads[b * 3 + 2] - heads[par * 3 + 2];
            headP[b * 3] = headP[par * 3] + Rp[0] * dx + Rp[1] * dy + Rp[2] * dz;
            headP[b * 3 + 1] = headP[par * 3 + 1] + Rp[3] * dx + Rp[4] * dy + Rp[5] * dz;
            headP[b * 3 + 2] = headP[par * 3 + 2] + Rp[6] * dx + Rp[7] * dy + Rp[8] * dz;
        }
    }
    // per joint: v' = R (v - head) + head'  =  R v + t
    const A = new Float64Array(J * 9), T = new Float64Array(J * 3);
    for (let b = 0; b < J; b++) {
        const r = R[b];
        for (let i = 0; i < 9; i++)
            A[b * 9 + i] = r[i];
        const hx = heads[b * 3], hy = heads[b * 3 + 1], hz = heads[b * 3 + 2];
        T[b * 3] = headP[b * 3] - (r[0] * hx + r[1] * hy + r[2] * hz);
        T[b * 3 + 1] = headP[b * 3 + 1] - (r[3] * hx + r[4] * hy + r[5] * hz);
        T[b * 3 + 2] = headP[b * 3 + 2] - (r[6] * hx + r[7] * hy + r[8] * hz);
    }
    if (bonesOut)
        bonesOut.set(A); // the turn of each joint, for what is worn to turn with it
    const K = rig.influences, N = rest.length / 3;
    for (let v = 0; v < N; v++) {
        const x = rest[v * 3], y = rest[v * 3 + 1], z = rest[v * 3 + 2];
        let ox = 0, oy = 0, oz = 0;
        for (let k = 0; k < K; k++) {
            const w = rig.skinWeight[v * K + k];
            if (!w)
                continue;
            const b = rig.skinIndex[v * K + k], a = b * 9, f = w / 255;
            ox += f * (A[a] * x + A[a + 1] * y + A[a + 2] * z + T[b * 3]);
            oy += f * (A[a + 3] * x + A[a + 4] * y + A[a + 5] * z + T[b * 3 + 1]);
            oz += f * (A[a + 6] * x + A[a + 7] * y + A[a + 8] * z + T[b * 3 + 2]);
        }
        out[v * 3] = ox;
        out[v * 3 + 1] = oy;
        out[v * 3 + 2] = oz;
    }
}
/** Where a seat's top should be for the seated pose: just under the top of the thigh joint after posing. */
export function seatHeight(rig, heads, deltas, offsetZ) {
    const i = rig.index.get("upperleg01.L");
    if (i === undefined)
        return 0.45;
    // the thigh joint does not move when the legs bend (it is the top of the leg chain), so its rest height is its posed height
    return heads[i * 3 + 2] + offsetZ - 0.1;
}
/* ── hands: fingers curl about their own axes, so the hand reads right whatever the arm is doing ─────────────────────────────────────── */
const FINGER_CURL = {
    "2": [14, 22, 14], "3": [18, 28, 16], "4": [22, 32, 18], "5": [26, 36, 20],
};
/**
 * A relaxed or closing hand: each finger bends toward the palm about an axis found from the hand's own shape (the finger's direction and the palm's
 * normal at rest), carried by the arm, so it stays right when the arm swings. `curl` is 0 for the hand as modelled to 1 for a loosely closed hand;
 * 0.35 is the easy curl a hanging hand has. `spread` opens the fingers (0 together, 1 splayed).
 */
export function handDeltas(rig, heads, curl = 0.35, spread = 0) {
    const d = {};
    const get = (n) => { const i = rig.index.get(n); return i === undefined ? null : [heads[i * 3], heads[i * 3 + 1], heads[i * 3 + 2]]; };
    for (const side of ["L", "R"]) {
        const wrist = get(`wrist.${side}`), mid = get(`finger3-1.${side}`), thumb = get(`finger1-1.${side}`), little = get(`finger5-1.${side}`);
        if (!wrist || !mid || !thumb || !little)
            continue;
        const m = [mid[0] - wrist[0], mid[1] - wrist[1], mid[2] - wrist[2]], t = [thumb[0] - little[0], thumb[1] - little[1], thumb[2] - little[2]];
        let n = [m[1] * t[2] - m[2] * t[1], m[2] * t[0] - m[0] * t[2], m[0] * t[1] - m[1] * t[0]];
        const inward = side === "L" ? -1 : 1; // the palm faces the body at rest: toward x = 0
        if (n[0] * inward < 0)
            n = n.map((v) => -v);
        for (const f of ["2", "3", "4", "5", "1"]) {
            for (let seg = 1; seg <= 3; seg++) {
                const name = `finger${f}-${seg}.${side}`, here = get(name), next = get(`finger${f}-${seg + 1}.${side}`) ?? null;
                const prev = seg > 1 ? get(`finger${f}-${seg - 1}.${side}`) : null;
                if (!here)
                    continue;
                const from = next ? here : prev ?? here, to = next ?? here;
                const dir = next ? [to[0] - here[0], to[1] - here[1], to[2] - here[2]] : prev ? [here[0] - prev[0], here[1] - prev[1], here[2] - prev[2]] : m;
                void from;
                const a = [dir[1] * n[2] - dir[2] * n[1], dir[2] * n[0] - dir[0] * n[2], dir[0] * n[1] - dir[1] * n[0]];
                const amount = f === "1" ? [6, 10, 8][seg - 1] : FINGER_CURL[f][seg - 1];
                const ops = [["a", amount * (curl / 0.35), a[0], a[1], a[2]]];
                if (seg === 1 && f !== "1" && spread)
                    ops.push(["a", (f === "2" ? -1 : f === "4" ? 1 : f === "5" ? 2 : 0) * 5 * spread, n[0], n[1], n[2]]);
                d[name] = ops;
            }
        }
    }
    return d;
}
