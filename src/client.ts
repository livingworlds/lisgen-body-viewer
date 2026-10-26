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

import type { Deltas } from "./poses";

export type Sex = "female" | "male";
/** The service's shape controls: height 0.44 to 0.72, weight 0 to 1, bust, waist and hip -1 to 1, age on the body model's own axis (see `info`). */
export type Controls = { height: number; weight: number; bust: number; waist: number; hip: number; age: number };
export type Measurements = { height_cm: number; bust_cm: number; waist_cm: number; hip_cm: number };
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
  fit: { error_cm: number; weight_searched: boolean } | null;
  /** Three numbers a vertex, metres, Z up, the front toward -Y. */
  vertices: Float32Array;
  /** Three numbers a joint, in the order of the topology's joint labels. */
  joints: Float32Array;
  ms: number;
};
export type FramesRequest = BodyRequest & { frames: Deltas[] };
export type FramesResult = { version: string; frames: number; vertices: number; positions: Float32Array; ms: number };

export type Topology = {
  version: string;
  sex: Sex;
  vertices: number;
  triangles: number;
  faces: Uint16Array | Uint32Array;
  uv: Float32Array;
  skin: { influences: number; index: Uint8Array; weight: Uint8Array };
  rig: { labels: string[]; parents: number[] };
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

export class BodyServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BodyServiceError";
  }
}

type Packed = { dtype: string; shape: number[]; base64: string };

/** A packed array from the service, as a typed array over its own copy of the bytes. */
export function unpack(p: Packed): Float32Array | Uint32Array | Uint16Array | Uint8Array | Int16Array {
  const bin = atob(p.base64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const n = p.shape.reduce((a, b) => a * b, 1), buf = bytes.buffer;
  const view =
    p.dtype === "float32" ? new Float32Array(buf, 0, n) : p.dtype === "uint32" ? new Uint32Array(buf, 0, n) : p.dtype === "uint16" ? new Uint16Array(buf, 0, n)
    : p.dtype === "int16" ? new Int16Array(buf, 0, n) : p.dtype === "uint8" ? new Uint8Array(buf, 0, n) : null;
  if (!view) throw new BodyServiceError(`unknown array type ${p.dtype}`, 0);
  return view;
}

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

export function createBodyService(options: BodyServiceOptions): BodyService {
  const base = options.endpoint.replace(/\/+$/, "");
  if (!base) throw new BodyServiceError("the body service needs an endpoint", 0);
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const topologies = new Map<Sex, Promise<Topology>>();

  const headers = async (json: boolean): Promise<Record<string, string>> => {
    const h: Record<string, string> = json ? { "content-type": "application/json" } : {};
    const t = typeof options.token === "function" ? await options.token() : options.token;
    if (t) h.authorization = `Bearer ${t}`;
    return h;
  };
  const call = async (path: string, body?: unknown): Promise<Response> => {
    const res = await doFetch(`${base}/${path}`, body === undefined
      ? { method: "GET", headers: await headers(false) }
      : { method: "POST", headers: await headers(true), body: JSON.stringify(body) });
    if (!res.ok) {
      let msg = `${res.status}`;
      try { const j = (await res.json()) as { error?: string }; if (j.error) msg = j.error; } catch { /* not JSON */ }
      throw new BodyServiceError(`body service: ${msg}`, res.status);
    }
    return res;
  };
  const json = async <T>(path: string, body?: unknown) => (await (await call(path, body)).json()) as T;

  return {
    endpoint: base,
    info: () => json<ServiceInfo>("info"),
    topology(sex) {
      let p = topologies.get(sex);
      if (!p) {
        p = json<{ version: string; sex: Sex; vertices: number; triangles: number; faces: Packed; uv: Packed; skin: { influences: number; index: Packed; weight: Packed }; rig: Topology["rig"] }>(`topology?sex=${sex}`)
          .then((t) => ({
            version: t.version, sex: t.sex, vertices: t.vertices, triangles: t.triangles, rig: t.rig,
            faces: unpack(t.faces) as Uint16Array | Uint32Array, uv: unpack(t.uv) as Float32Array,
            skin: { influences: t.skin.influences, index: unpack(t.skin.index) as Uint8Array, weight: unpack(t.skin.weight) as Uint8Array },
          }));
        p.catch(() => topologies.delete(sex));
        topologies.set(sex, p);
      }
      return p;
    },
    async body(req) {
      const r = await json<Omit<BodyResult, "vertices" | "joints"> & { vertices: Packed; joints: Packed }>("body", req);
      return { ...r, vertices: unpack(r.vertices) as Float32Array, joints: unpack(r.joints) as Float32Array };
    },
    async frames(req) {
      const r = await json<Omit<FramesResult, "positions"> & { positions: Packed }>("frames", req);
      return { ...r, positions: unpack(r.positions) as Float32Array };
    },
    bytes: async (path) => (await call(path)).arrayBuffer(),
    blob: async (path) => (await call(path)).blob(),
    json: (path) => json(path),
  };
}
