/**
 * Fabrics: how a cloth surface looks under light. Ten are photographed cloth (CC0, ambientCG) with their colour, relief and roughness; five are
 * built here from how the cloth is made (a satin's long floats, a silk's fine plain weave, a velvet's pile, a chiffon's open weave, a leather's grain).
 * Each fabric also carries its optics: how much sheen its fibres give and how tight it is, how rough the surface reads, whether its highlights stretch
 * along the threads (anisotropy, which flips between warp and weft where the weave changes), and whether light comes through it.
 *
 * These describe appearance. How a cloth hangs, stretches or creases depends on its weight and stiffness, which come from testing a real fabric.
 */
export type Weave = "plain" | "twill" | "satin" | "knit" | "pile" | "grain";
export type Optics = {
    sheen: number;
    sheenRoughness: number;
    roughness: number;
    anisotropy: number;
    weave: Weave | null;
    threads: number;
    translucent: number;
    clearcoat?: number;
    tile_mm?: number;
};
export type Fabric = {
    id: string;
    label: string;
    source: "photo" | "built";
    colour?: string;
    optics: Optics;
};
export declare const FABRICS: Fabric[];
export declare const fabricOf: (id: string | null) => Fabric | null;
/**
 * The built maps for one repeat of a fabric, `size` pixels square: colour (only for built fabrics), a normal map, a roughness map, and an anisotropy map
 * (three.js layout: red and green the thread direction in the surface, blue the strength), from the weave.
 */
export declare function weaveMaps(f: Fabric, size?: number): {
    colour: ImageData | null;
    normal: ImageData;
    rough: ImageData;
    aniso: ImageData;
};
