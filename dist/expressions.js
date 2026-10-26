/**
 * Facial expressions: a mix of the 52 facial actions of the ARKit set (brows, eyes, cheeks, jaw, mouth), each weighted 0 to 1. The body service applies
 * them to a body (`expression` in a body request); this module names them and gives a handful of ready mixes for people who choose rather than mix.
 */
/** The facial action names a body service accepts, in the ARKit order. */
export const FACIAL_ACTIONS = [
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
    "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight",
    "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft", "mouthLowerDownLeft",
    "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower",
    "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight",
    "noseSneerLeft", "noseSneerRight", "tongueOut",
];
const both = (l, r, w) => ({ [l]: w, [r]: w });
/** Named expressions, each a mix of facial actions. */
export const EXPRESSIONS = [
    { id: "neutral", label: "Neutral", weights: {} },
    { id: "soft-smile", label: "Soft smile", weights: { ...both("mouthSmileLeft", "mouthSmileRight", 0.35), ...both("cheekSquintLeft", "cheekSquintRight", 0.15) } },
    { id: "smile", label: "Smile", weights: { ...both("mouthSmileLeft", "mouthSmileRight", 0.75), ...both("cheekSquintLeft", "cheekSquintRight", 0.35), ...both("eyeSquintLeft", "eyeSquintRight", 0.2), mouthUpperUpLeft: 0.15, mouthUpperUpRight: 0.15 } },
    { id: "laugh", label: "Laugh", weights: { ...both("mouthSmileLeft", "mouthSmileRight", 0.95), ...both("cheekSquintLeft", "cheekSquintRight", 0.55), ...both("eyeSquintLeft", "eyeSquintRight", 0.45), jawOpen: 0.3 } },
    { id: "serious", label: "Serious", weights: { ...both("browDownLeft", "browDownRight", 0.3), ...both("mouthPressLeft", "mouthPressRight", 0.35), mouthClose: 0.1 } },
    { id: "pout", label: "Editorial pout", weights: { mouthPucker: 0.35, mouthFunnel: 0.1, ...both("browDownLeft", "browDownRight", 0.1), ...both("eyeSquintLeft", "eyeSquintRight", 0.15) } },
    { id: "surprised", label: "Surprised", weights: { browInnerUp: 0.7, ...both("browOuterUpLeft", "browOuterUpRight", 0.6), ...both("eyeWideLeft", "eyeWideRight", 0.6), jawOpen: 0.25 } },
    { id: "thoughtful", label: "Thoughtful", weights: { browInnerUp: 0.25, mouthLeft: 0.2, ...both("eyeLookUpLeft", "eyeLookUpRight", 0.3), mouthRollLower: 0.15 } },
    { id: "eyes-closed", label: "Eyes closed", weights: { ...both("eyeBlinkLeft", "eyeBlinkRight", 1) } },
];
export const expressionOf = (id) => EXPRESSIONS.find((e) => e.id === id) ?? EXPRESSIONS[0];
/** Several mixes as one, each scaled by its own amount; a weight is held to 0..1 after adding. */
export function blendExpressions(parts) {
    const out = {};
    for (const { weights, amount } of parts)
        for (const [k, w] of Object.entries(weights))
            out[k] = (out[k] ?? 0) + w * amount;
    for (const k of Object.keys(out))
        out[k] = Math.min(1, Math.max(0, out[k]));
    return out;
}
