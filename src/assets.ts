/**
 * Things worn on the body: hair, hats, glasses, jewellery, shoes, tops, dresses, trousers. Each is a small mesh bound to the body model's own
 * vertices (the MakeHuman binding), served by the body service, so it follows the body as the body changes shape, age or pose, and fits every size without
 * being remade. This reads a baked asset and places it on a body from the body's vertex positions, a few multiply-adds per vertex.
 *
 * The body model is in metres with Z up and the front toward -Y; the binding's offsets are in MakeHuman's base-mesh units and axes, scaled by how
 * much bigger or smaller the body is than the default along each axis between reference vertices the asset names. The offsets turn with the body in
 * a pose (blended from the joints the bound vertex is skinned to).
 */

import type { BodyService } from "./client";

export type AssetHead = {
  id: string; name: string; tags: string[]; vertices: number; triangles: number;
  scale: Record<string, [number, number, number]>;                 // axis -> [model vertex a, model vertex b, reference distance in MakeHuman units]
  textures: Record<string, string>; transparent: boolean; double_sided: boolean; diffuse_color: number[]; shininess: number;
  layout: { bind_idx: number; bind_w: number; offsets: number; uv: number; faces: number; dominant: number };
  hides: number[]; license: string; source: string;
};
export type Asset = { head: AssetHead; bindIdx: Int32Array; bindW: Float32Array; offsets: Float32Array; uv: Float32Array; faces: Uint32Array; dominant: Int32Array };
export type CatalogEntry = { id: string; label: string; category: string; tags: string[]; gender?: "female" | "male" | "any" };

const cache = new Map<string, Promise<Asset>>();

/** The wardrobe the body service offers. Items are bound to the service's body, so they come from it, not from this package. */
export function loadCatalog(service: BodyService): Promise<CatalogEntry[]> {
  return service.json<CatalogEntry[]>("wardrobe/index.json");
}

export function loadAsset(service: BodyService, id: string): Promise<Asset> {
  const key = `${service.endpoint}|${id}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const [head, buf] = await Promise.all([service.json<AssetHead>(`wardrobe/${id}.json`), service.bytes(`wardrobe/${id}.bin`)]);
      const n = head.vertices, L = head.layout;
      return {
        head, bindIdx: new Int32Array(buf, L.bind_idx, n * 3), bindW: new Float32Array(buf, L.bind_w, n * 3), offsets: new Float32Array(buf, L.offsets, n * 3),
        uv: new Float32Array(buf, L.uv, n * 2), faces: new Uint32Array(buf, L.faces, head.triangles * 3), dominant: new Int32Array(buf, L.dominant, n),
      } satisfies Asset;
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** How much bigger the body is than the asset's default along each of MakeHuman's axes (x, y up, z forward), from the reference vertices it names. */
export function bodyScales(head: AssetHead, body: Float32Array): [number, number, number] {
  const one = (key: string, modelAxis: number) => {
    const r = head.scale[key];
    if (!r) return 1;
    const [a, b, value] = r;
    return value ? (10 * Math.abs(body[a * 3 + modelAxis]! - body[b * 3 + modelAxis]!)) / value : 1;
  };
  return [one("x", 0), one("y", 2), one("z", 1)];              // MakeHuman x is model x, MakeHuman y (up) is model z, MakeHuman z (forward) is model y
}

/**
 * Put an asset on a body. `body` is the body's vertices (3 each); `out` receives the asset's (3 per asset vertex). `bones` is the pose's bone turns (9 numbers a bone,
 * from `posed`) with `skin` the body's skin (up to nine joints a vertex); without them the offsets stay as authored.
 */
export function placeAsset(asset: Asset, body: Float32Array, out: Float32Array, bones?: Float64Array, skin?: { index: Uint8Array; weight: Uint8Array; influences: number }): void {
  const { head, bindIdx, bindW, offsets, dominant } = asset;
  const [sx, sy, sz] = bodyScales(head, body), n = head.vertices;
  for (let i = 0; i < n; i++) {
    const a = bindIdx[i * 3]! * 3, b = bindIdx[i * 3 + 1]! * 3, c = bindIdx[i * 3 + 2]! * 3, w0 = bindW[i * 3]!, w1 = bindW[i * 3 + 1]!, w2 = bindW[i * 3 + 2]!;
    let ox = 0.1 * offsets[i * 3]! * sx, oy = -0.1 * offsets[i * 3 + 2]! * sz, oz = 0.1 * offsets[i * 3 + 1]! * sy;
    if (bones && skin) {
      const v = dominant[i]! * skin.influences;
      let m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0;
      for (let k = 0; k < skin.influences; k++) {
        const w = skin.weight[v + k]! / 255;
        if (!w) continue;
        const o = skin.index[v + k]! * 9;
        m0 += w * bones[o]!; m1 += w * bones[o + 1]!; m2 += w * bones[o + 2]!; m3 += w * bones[o + 3]!; m4 += w * bones[o + 4]!; m5 += w * bones[o + 5]!; m6 += w * bones[o + 6]!; m7 += w * bones[o + 7]!; m8 += w * bones[o + 8]!;
      }
      const rx = m0 * ox + m1 * oy + m2 * oz, ry = m3 * ox + m4 * oy + m5 * oz, rz = m6 * ox + m7 * oy + m8 * oz;
      ox = rx; oy = ry; oz = rz;
    }
    out[i * 3] = w0 * body[a]! + w1 * body[b]! + w2 * body[c]! + ox;
    out[i * 3 + 1] = w0 * body[a + 1]! + w1 * body[b + 1]! + w2 * body[c + 1]! + oy;
    out[i * 3 + 2] = w0 * body[a + 2]! + w1 * body[b + 2]! + w2 * body[c + 2]! + oz;
  }
}

/** Which of the body's vertices are covered by what is worn (so the surface under a shoe or a dress is not drawn through it). */
export function hiddenFlags(assets: Asset[], bodyVertices: number): Uint8Array {
  const flags = new Uint8Array(bodyVertices);
  for (const a of assets) for (const v of a.head.hides) if (v < bodyVertices) flags[v] = 1;
  return flags;
}
