/**
 * The client for a body service: the viewer asks it for a body and gets the surface back in milliseconds. The body model itself (its shape space,
 * joints, skin weights, facial actions and what is bound to it) lives in the service, not in this package; this module only speaks its HTTP interface.
 *
 * The host app gives the endpoint and a token. The token is the host's own credential for the service (or a short-lived one minted by the host's
 * backend); it is sent as `Authorization: Bearer <token>` on every call. A host that keeps the credential server-side can instead point `endpoint`
 * at its own route that forwards to the service, and give no token.
 *
 * Interface (all paths under the endpoint, JSON unless said otherwise; arrays travel as { dtype, shape, base64 }, little-endian):
 *   GET  info                         versions, control ranges, shape and expression names, limits
 *   GET  topology?sex=female|male     faces, texture coordinates, skin weights and the joint tree; the same for every body of that sex
 *   POST body                         a body from controls or measurements (and an age, shape and expression weights): vertices and joints
 *   POST frames                       the same body bent to a list of poses (joint turns, as `poses` makes them): vertices for each frame
 *   GET  files/<name>                 body texture data: uv.bin, regions.png, regions2.png
 *   GET  wardrobe/<name>              things worn on the body: index.json, <id>.json, <id>.bin and their textures
 */
import type { Deltas } from "./poses.js";
export type Sex = "female" | "male";
/** The service's shape controls: height 0.44 to 0.72, weight 0 to 1, bust, waist and hip -1 to 1, age on the body model's own axis (see `info`). */
export type Controls = {
    height: number;
    weight: number;
    bust: number;
    waist: number;
    hip: number;
    age: number;
};
export type Measurements = {
    height_cm: number;
    bust_cm: number;
    waist_cm: number;
    hip_cm: number;
};
export type Weights = Record<string, number>;
/** A body: by measurements (the service finds the controls) or by controls, never both. Age in years unless `controls.age` is given. */
export type BodyRequest = {
    sex: Sex;
    age_years?: number;
    measurements?: Measurements;
    controls?: Partial<Controls>;
    shape?: Weights;
    expression?: Weights;
    tolerance_cm?: number;
};
export type BodyResult = {
    version: string;
    sex: Sex;
    controls: Controls;
    age_years: number;
    measurements: Measurements;
    /** For a request by measurements: the largest miss in centimetres, and whether the weight had to be searched to reach a girth. */
    fit: {
        error_cm: number;
        weight_searched: boolean;
    } | null;
    /** Three numbers a vertex, metres, Z up, the front toward -Y. */
    vertices: Float32Array;
    /** Three numbers a joint, in the order of the topology's joint labels. */
    joints: Float32Array;
    ms: number;
};
export type FramesRequest = BodyRequest & {
    frames: Deltas[];
};
export type FramesResult = {
    version: string;
    frames: number;
    vertices: number;
    positions: Float32Array;
    ms: number;
};
export type Topology = {
    version: string;
    sex: Sex;
    vertices: number;
    triangles: number;
    faces: Uint16Array | Uint32Array;
    uv: Float32Array;
    skin: {
        influences: number;
        index: Uint8Array;
        weight: Uint8Array;
    };
    rig: {
        labels: string[];
        parents: number[];
    };
};
export type ServiceInfo = {
    version: string;
    sexes: Sex[];
    controls: Record<keyof Controls, [number, number]>;
    age_years: [number, number];
    shapes: string[];
    expressions: string[];
    max_frames: number;
};
export type BodyServiceOptions = {
    endpoint: string;
    token?: string | (() => string | Promise<string>);
    fetch?: typeof fetch;
};
export declare class BodyServiceError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
type Packed = {
    dtype: string;
    shape: number[];
    base64: string;
};
/** A packed array from the service, as a typed array over its own copy of the bytes. */
export declare function unpack(p: Packed): Float32Array | Uint32Array | Uint16Array | Uint8Array | Int16Array;
export type BodyService = {
    readonly endpoint: string;
    info(): Promise<ServiceInfo>;
    topology(sex: Sex): Promise<Topology>;
    body(req: BodyRequest): Promise<BodyResult>;
    frames(req: FramesRequest): Promise<FramesResult>;
    /** A file the service serves (`files/uv.bin`, `wardrobe/index.json`, ...), as bytes. */
    bytes(path: string): Promise<ArrayBuffer>;
    blob(path: string): Promise<Blob>;
    json<T>(path: string): Promise<T>;
};
export declare function createBodyService(options: BodyServiceOptions): BodyService;
export {};
