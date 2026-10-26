import * as React from "react";
import { type Asset } from "./assets.js";
import type { BodyService } from "./client.js";
import { type Season } from "./environments.js";
/**
 * The 3D view. Built to cost little: three.js is fetched only when this screen opens, the renderer is WebGPU with an automatic
 * WebGL2 fallback, the pixel ratio is capped, the model is a meshopt-compressed GLB, a frame is drawn only when something changed (a drag, the turntable, a new body, a new tone, a resize)
 * and never while the tab is hidden or the view is off screen. Light is real: one sun-like light casts a soft shadow map onto a
 * ground that shows only the shadow, and the sky around the body is the lighting too (a studio room, a sky that follows the hour,
 * or a photographed place).
 */
export type Motion = {
    cycle?: number;
    skin?: {
        index: Uint8Array;
        weight: Uint8Array;
        influences: number;
    };
    bones?: number;
    frame: (seconds: number, out: Float32Array, bones?: Float64Array) => void;
    faces: Uint16Array | Uint32Array;
    count: number;
    moving: boolean;
    seatZ: number | null;
};
/** What a final render needs to reproduce the view: where the camera is round the figure, where the light is and how strong, which environment. */
export type Snapshot = {
    camera: {
        yaw_deg: number;
        pitch_deg: number;
        distance_m: number;
        fov_deg: number;
        target_y_m: number;
    };
    sun: {
        azimuth_deg: number;
        elevation_deg: number;
        strength: number;
        angle_deg: number;
    };
    environment: string | null;
    aspect: number;
};
/**
 * What a final render needs beyond the snapshot: the body exactly as drawn (standing on the ground, centred), each worn item as a glTF binary in the same
 * place (Y up, as glTF says, with its own material, colour and fabric), and the body's colour map on its own texture coordinates when nails, lips or eyelids are coloured.
 */
export type FinalScene = {
    positions: Float32Array;
    faces: Uint16Array | Uint32Array;
    items: ArrayBuffer[];
    skinPng: Blob | null;
};
/** Something worn: a loaded asset, a tint, and optionally a fabric to cover it with (a fabric id from the fabrics list, repeated `repeat` times across its UV layout). */
/** Colour on the body itself, by region: fingernails, toenails, lips, eyelids (hex colours; absent means the skin as it is). */
export type Beauty = {
    nails?: string;
    toenails?: string;
    lips?: string;
    lids?: string;
};
/**
 * A garment draped by the cloth simulation, as the Studio receives it: one binary (positions float32 x3 in the body's frame, the flat pattern in
 * millimetres float32 x2, piece index uint16, faces uint32 x3, face strain float32) described by `meta`, the fabric it is cut from, and `offset`,
 * the shift that puts the draped garment back on the body as drawn (the drape is computed on the body centred and standing at z = 0).
 */
/** A print laid over the fabric: a picture, how wide one repeat of it is on the cloth in millimetres, and how the repeats are arranged. */
export type Print = {
    url: string;
    repeat_mm: number;
    mode: "straight" | "half-drop" | "brick" | "mirror";
};
/** The air around the figure: clear, haze or fog (light scattered by the air), or falling drizzle, rain or snow (which also wet the cloth and skin). */
export type Weather = "clear" | "haze" | "fog" | "drizzle" | "rain" | "snow";
export type Draped = {
    data: ArrayBuffer;
    meta: {
        vertices: number;
        triangles: number;
        layout: Record<string, number>;
        pieces: string[];
        grainline_deg: Record<string, number>;
        frames?: number;
    };
    fabric: string;
    tint?: string;
    fitMap: boolean;
    offset: [number, number, number];
};
export type Worn = {
    slot: string;
    asset: Asset;
    tint?: string;
    fabric?: {
        id: string;
        repeat: number;
    } | null;
};
export type Preview = {
    positions: Float32Array;
    faces: Uint16Array | Uint32Array;
    version: number;
};
export type ViewPart = "figure" | "face" | "torso" | "feet";
export type Illuminant = "d65" | "f11" | "a";
/** Linear RGB gains of each light relative to daylight (D65), at equal brightness: F11 (a 4000 K tri-phosphor shop tube, close to TL84) and A (a 2856 K incandescent lamp). */
export declare const ILLUMINANTS: Record<Illuminant, {
    label: string;
    gain: [number, number, number];
}>;
/**
 * `assetBase`: the URL the host serves this package's `assets` folder from (environments and fabrics), default "/body-viewer".
 * `body`: the body service, for the body's texture coordinates and region masks and for the textures of what is worn; without it the skin is drawn plain
 * and worn items untextured. `latitude`: the place the open sky is seen from, degrees north positive.
 */
type Props = {
    assetBase?: string;
    body?: BodyService | null;
    latitude: number;
    weather?: Weather;
    print?: Print | null;
    garment?: Draped | null;
    illuminant?: Illuminant;
    beauty?: Beauty;
    viewTick?: number;
    view?: ViewPart;
    wear?: Worn[];
    snapRef?: React.MutableRefObject<(() => Snapshot | null) | null>;
    sceneRef?: React.MutableRefObject<(() => Promise<FinalScene | null>) | null>;
    look: "skin" | "mannequin";
    motion: Motion | null;
    backdrop: string | null;
    quality: "best" | "fast";
    preview: Preview | null;
    url: string | null;
    tone: string;
    spin: boolean;
    place: string;
    hour: number;
    season: Season;
    fabric: string | null;
    fabricScale: number;
    onReady?: (backend: string) => void;
};
export declare function Viewport({ assetBase, body, latitude, weather, print, garment, illuminant: seenUnder, beauty, viewTick, view, wear, snapRef, sceneRef, look, motion, backdrop, quality, preview, url, tone, spin, place, hour, season, fabric, fabricScale, onReady }: Props): any;
export {};
