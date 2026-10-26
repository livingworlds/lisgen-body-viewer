/**
 * Facial expressions: a mix of the 52 facial actions of the ARKit set (brows, eyes, cheeks, jaw, mouth), each weighted 0 to 1. The body service applies
 * them to a body (`expression` in a body request); this module names them and gives a handful of ready mixes for people who choose rather than mix.
 */
import type { Weights } from "./client.js";
export type { Weights } from "./client.js";
/** The facial action names a body service accepts, in the ARKit order. */
export declare const FACIAL_ACTIONS: readonly ["browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight", "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight", "tongueOut"];
export type FacialAction = (typeof FACIAL_ACTIONS)[number];
/** Named expressions, each a mix of facial actions. */
export declare const EXPRESSIONS: {
    id: string;
    label: string;
    weights: Weights;
}[];
export declare const expressionOf: (id: string) => {
    id: string;
    label: string;
    weights: Weights;
};
/** Several mixes as one, each scaled by its own amount; a weight is held to 0..1 after adding. */
export declare function blendExpressions(parts: {
    weights: Weights;
    amount: number;
}[]): Weights;
