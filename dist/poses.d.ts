/**
 * Poses and movement for the body, in the browser. The body service gives where the joints are for any body (`joints` in a body result) and, once,
 * the joint tree and the skin weights that say how each vertex follows them (`topology`). A pose is a turn of each joint about the world's own axes (x across the body, y front to back with the back
 * positive, z up). The body is bent by linear blend skinning, the method the body model uses itself, so a pose costs a few matrix products and a walk
 * plays at frame rate on any device.
 *
 * The poses are standing, sitting, walking and running, built from joint angles of ordinary human movement (hip and knee flexion, ankle, arm swing, a
 * little lean). They are for seeing how clothing reads in a position; they are not measured from a particular person, and cloth does not yet follow them.
 */
import type { Topology } from "./client.js";
/** A turn: about a world axis (x, y or z), or about an axis carried by the parent joint (`"a"`, degrees, then the axis in the body's rest frame), which is how a finger curls whatever the arm is doing. */
export type Op = [axis: "x" | "y" | "z", degrees: number] | [axis: "a", degrees: number, ax: number, ay: number, az: number];
export type Deltas = Record<string, Op[]>;
export type PoseId = "rest" | "stand" | "weight" | "hip" | "sit" | "walk" | "runway" | "run";
export declare const POSES: {
    id: PoseId;
    label: string;
    moving: boolean;
}[];
/** Seconds one full stride (left foot to left foot) takes. */
export declare const cycleSeconds: (id: PoseId) => 0 | 1.35 | 1.1 | 0.7;
/** The turns of each joint for a pose. `phase` is 0 to 1 round a stride and only matters for walking and running. */
export declare function deltasFor(id: PoseId, phase?: number): Deltas;
/**
 * How posture changes with the years: from about fifty the upper back and neck curve forward a little more each decade, by ninety about nine degrees at
 * the mid back and eight at the neck. A rule of thumb for showing ageing, not a measurement of any person.
 */
export declare function agePosture(years: number): Deltas;
/** Two sets of joint turns as one: where a joint has turns in both, `a` happens first and `b` after. */
export declare function mergeDeltas(a: Deltas, b: Deltas): Deltas;
export type PoseRig = {
    labels: string[];
    parents: number[];
    bones: number;
    skinIndex: Uint8Array;
    skinWeight: Uint8Array;
    influences: number;
    index: Map<string, number>;
};
/** The rig for posing, from a body service's topology. Joints are listed parents first. */
export declare function rigFrom(t: Topology): PoseRig;
/** The joint positions of a body result as the posing code reads them. */
export declare const headsOf: (joints: Float32Array) => Float64Array<ArrayBuffer>;
/**
 * Bend a rest surface to a pose. `rest` is the body at rest (3 numbers per vertex), `heads` the rest joint positions, `deltas` the turn of each joint.
 * Each joint's turn is about its own head, on top of its parent's. Writes the posed surface into `out`.
 */
export declare function posed(rig: PoseRig, rest: Float32Array, heads: Float64Array, deltas: Deltas, out: Float32Array, bonesOut?: Float64Array): void;
/** Where a seat's top should be for the seated pose: just under the top of the thigh joint after posing. */
export declare function seatHeight(rig: PoseRig, heads: Float64Array, deltas: Deltas, offsetZ: number): number;
/**
 * A relaxed or closing hand: each finger bends toward the palm about an axis found from the hand's own shape (the finger's direction and the palm's
 * normal at rest), carried by the arm, so it stays right when the arm swings. `curl` is 0 for the hand as modelled to 1 for a loosely closed hand;
 * 0.35 is the easy curl a hanging hand has. `spread` opens the fingers (0 together, 1 splayed).
 */
export declare function handDeltas(rig: PoseRig, heads: Float64Array, curl?: number, spread?: number): Deltas;
