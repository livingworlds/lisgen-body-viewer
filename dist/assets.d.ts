/**
 * Things worn on the body: hair, hats, glasses, jewellery, shoes, tops, dresses, trousers. Each is a small mesh bound to the body model's own
 * vertices (the MakeHuman binding), served by the body service, so it follows the body as the body changes shape, age or pose, and fits every size without
 * being remade. This reads a baked asset and places it on a body from the body's vertex positions, a few multiply-adds per vertex.
 *
 * The body model is in metres with Z up and the front toward -Y; the binding's offsets are in MakeHuman's base-mesh units and axes, scaled by how
 * much bigger or smaller the body is than the default along each axis between reference vertices the asset names. The offsets turn with the body in
 * a pose (blended from the joints the bound vertex is skinned to).
 */
import type { BodyService } from "./client.js";
export type AssetHead = {
    id: string;
    name: string;
    tags: string[];
    vertices: number;
    triangles: number;
    scale: Record<string, [number, number, number]>;
    textures: Record<string, string>;
    transparent: boolean;
    double_sided: boolean;
    diffuse_color: number[];
    shininess: number;
    layout: {
        bind_idx: number;
        bind_w: number;
        offsets: number;
        uv: number;
        faces: number;
        dominant: number;
    };
    hides: number[];
    license: string;
    source: string;
};
export type Asset = {
    head: AssetHead;
    bindIdx: Int32Array;
    bindW: Float32Array;
    offsets: Float32Array;
    uv: Float32Array;
    faces: Uint32Array;
    dominant: Int32Array;
};
export type CatalogEntry = {
    id: string;
    label: string;
    category: string;
    tags: string[];
    gender?: "female" | "male" | "any";
};
/** The wardrobe the body service offers. Items are bound to the service's body, so they come from it, not from this package. */
export declare function loadCatalog(service: BodyService): Promise<CatalogEntry[]>;
export declare function loadAsset(service: BodyService, id: string): Promise<Asset>;
/** How much bigger the body is than the asset's default along each of MakeHuman's axes (x, y up, z forward), from the reference vertices it names. */
export declare function bodyScales(head: AssetHead, body: Float32Array): [number, number, number];
/**
 * Put an asset on a body. `body` is the body's vertices (3 each); `out` receives the asset's (3 per asset vertex). `bones` is the pose's bone turns (9 numbers a bone,
 * from `posed`) with `skin` the body's skin (up to nine joints a vertex); without them the offsets stay as authored.
 */
export declare function placeAsset(asset: Asset, body: Float32Array, out: Float32Array, bones?: Float64Array, skin?: {
    index: Uint8Array;
    weight: Uint8Array;
    influences: number;
}): void;
/** Which of the body's vertices are covered by what is worn (so the surface under a shoe or a dress is not drawn through it). */
export declare function hiddenFlags(assets: Asset[], bodyVertices: number): Uint8Array;
