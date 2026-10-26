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
  sheen: number; sheenRoughness: number; roughness: number;
  anisotropy: number;            // 0 none, 1 highlights drawn fully along the threads
  weave: Weave | null;           // drives the thread-direction map; null for a photographed surface without one
  threads: number;               // threads across one repeat of the built pattern
  translucent: number;           // 0 opaque, 1 sheer
  clearcoat?: number;
  tile_mm?: number;              // how many millimetres of cloth one repeat of the maps covers (default 150)
};
export type Fabric = { id: string; label: string; source: "photo" | "built"; colour?: string; optics: Optics };

const o = (p: Partial<Optics>): Optics => ({ sheen: 0.4, sheenRoughness: 0.6, roughness: 1, anisotropy: 0, weave: null, threads: 24, translucent: 0, ...p });
export const FABRICS: Fabric[] = [
  { id: "denim", label: "Denim, blue", source: "photo", optics: o({ sheen: 0.3, anisotropy: 0.25, weave: "twill" }) },
  { id: "twill", label: "Twill, slate", source: "photo", optics: o({ sheen: 0.35, anisotropy: 0.3, weave: "twill" }) },
  { id: "check", label: "Cotton check, red", source: "photo", optics: o({ sheen: 0.25, weave: "plain" }) },
  { id: "poplin", label: "Poplin, white", source: "photo", optics: o({ sheen: 0.25, roughness: 0.9, weave: "plain", translucent: 0.15 }) },
  { id: "linen", label: "Linen weave, light", source: "photo", optics: o({ sheen: 0.2, weave: "plain", translucent: 0.2 }) },
  { id: "smooth", label: "Smooth, grey", source: "photo", optics: o({ sheen: 0.4, roughness: 0.85 }) },
  { id: "wool", label: "Wool, grey", source: "photo", optics: o({ sheen: 0.85, sheenRoughness: 0.75 }) },
  { id: "jersey", label: "Jersey, grey", source: "photo", optics: o({ sheen: 0.5, weave: "knit" }) },
  { id: "knit", label: "Knit, white", source: "photo", optics: o({ sheen: 0.7, sheenRoughness: 0.7, weave: "knit" }) },
  { id: "quilted", label: "Quilted, white", source: "photo", optics: o({ sheen: 0.4 }) },
  { id: "satin", label: "Satin, champagne", source: "built", colour: "#d9c3a0", optics: o({ sheen: 0.2, sheenRoughness: 0.3, roughness: 0.3, anisotropy: 0.85, weave: "satin", threads: 48 }) },
  { id: "silk", label: "Silk, ivory", source: "built", colour: "#efe6d6", optics: o({ sheen: 0.6, sheenRoughness: 0.35, roughness: 0.38, anisotropy: 0.55, weave: "plain", threads: 64, translucent: 0.2 }) },
  { id: "velvet", label: "Velvet, burgundy", source: "built", colour: "#5e1424", optics: o({ sheen: 1, sheenRoughness: 0.32, roughness: 0.95, weave: "pile", threads: 64 }) },
  { id: "chiffon", label: "Chiffon, blush", source: "built", colour: "#e9c4c0", optics: o({ sheen: 0.3, sheenRoughness: 0.5, roughness: 0.7, weave: "plain", threads: 40, translucent: 0.55 }) },
  { id: "leather", label: "Leather, black", source: "built", colour: "#1c1a19", optics: o({ sheen: 0, roughness: 0.48, weave: "grain", threads: 32, clearcoat: 0.25 }) },
];
export const fabricOf = (id: string | null) => FABRICS.find((f) => f.id === id) ?? null;

/** Which thread is on top at a crossing of warp column i and weft row j: true for the warp. */
function warpUp(weave: Weave, i: number, j: number): boolean {
  if (weave === "twill") return (i + j) % 3 !== 2;                // 2/1 twill: warp over two, under one, stepping each row
  if (weave === "satin") return (i * 2 + j) % 5 !== 0;            // 5-end warp-faced satin: long warp floats, scattered tie points
  return (i + j) % 2 === 0;                                       // plain
}

/**
 * The built maps for one repeat of a fabric, `size` pixels square: colour (only for built fabrics), a normal map, a roughness map, and an anisotropy map
 * (three.js layout: red and green the thread direction in the surface, blue the strength), from the weave.
 */
export function weaveMaps(f: Fabric, size = 256): { colour: ImageData | null; normal: ImageData; rough: ImageData; aniso: ImageData } {
  const op = f.optics, weave = op.weave ?? "plain", n = Math.max(4, op.threads), cell = size / n;
  const h = new Float32Array(size * size), dirU = new Uint8Array(size * size);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x;
    if (weave === "pile" || weave === "grain") { h[k] = 0; continue; }
    const i = Math.floor(x / cell), j = Math.floor(y / cell), fx = (x % cell) / cell - 0.5, fy = (y % cell) / cell - 0.5;
    if (weave === "knit") {
      // interlocking V loops: each loop a pair of slanted yarns
      const side = fx < 0 ? -1 : 1, ax = Math.abs(fx) - 0.25 - fy * 0.35 * side;
      h[k] = Math.max(0, 1 - (ax * ax) / 0.03); dirU[k] = 0; continue;
    }
    const up = warpUp(weave, i, j);
    const across = up ? fx : fy, along = up ? fy : fx;
    h[k] = Math.sqrt(Math.max(0, 1 - 4 * across * across)) * (0.75 + 0.25 * Math.cos(along * Math.PI));
    dirU[k] = up ? 0 : 1;                                        // warp runs along v, weft along u
  }
  if (weave === "pile" || weave === "grain") {
    const P = weave === "pile" ? 2600 : 900;
    for (let s = 0; s < P; s++) {
      const cx = rnd() * size, cy = rnd() * size, r = weave === "pile" ? 0.8 + rnd() * 1.2 : 2 + rnd() * 5, d = (weave === "pile" ? 0.3 : -0.6) * (0.5 + rnd());
      for (let y = Math.floor(cy - r * 2); y <= cy + r * 2; y++) for (let x = Math.floor(cx - r * 2); x <= cx + r * 2; x++) {
        const q = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); if (q > 4) continue;
        const at = ((y + size) % size) * size + ((x + size) % size);
        h[at] = h[at]! + d * Math.exp(-q);
      }
    }
  }
  const mk = () => new ImageData(size, size);
  const normal = mk(), rough = mk(), aniso = mk(), colour = f.source === "built" ? mk() : null;
  const base = f.colour ? [parseInt(f.colour.slice(1, 3), 16), parseInt(f.colour.slice(3, 5), 16), parseInt(f.colour.slice(5, 7), 16)] : [255, 255, 255];
  const strength = weave === "grain" ? 1.6 : weave === "pile" ? 0.8 : 2.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x, o4 = k * 4;
    const dx = h[y * size + ((x + 1) % size)]! - h[y * size + ((x + size - 1) % size)]!, dy = h[((y + 1) % size) * size + x]! - h[((y + size - 1) % size) * size + x]!;
    const nx = -dx * strength, ny = -dy * strength, l = Math.hypot(nx, ny, 1);
    normal.data[o4] = Math.round(127.5 + 127.5 * nx / l); normal.data[o4 + 1] = Math.round(127.5 + 127.5 * ny / l); normal.data[o4 + 2] = Math.round(127.5 + 127.5 / l); normal.data[o4 + 3] = 255;
    const shade = weave === "pile" || weave === "grain" ? 1 + h[k]! * 0.08 : 0.86 + 0.14 * h[k]!;
    const rv = Math.round(255 * Math.min(1, op.roughness * (weave === "satin" && dirU[k] === 0 ? 0.85 : 1) * (1.05 - 0.1 * h[k]!)));
    rough.data[o4] = rv; rough.data[o4 + 1] = rv; rough.data[o4 + 2] = rv; rough.data[o4 + 3] = 255;
    // thread direction in the surface's tangent frame: (1,0) along u, (0,1) along v
    const along = dirU[k] ? [1, 0] : [0, 1];
    aniso.data[o4] = Math.round(127.5 + 127.5 * along[0]!); aniso.data[o4 + 1] = Math.round(127.5 + 127.5 * along[1]!); aniso.data[o4 + 2] = Math.round(255 * Math.min(1, 0.4 + 0.6 * h[k]!)); aniso.data[o4 + 3] = 255;
    if (colour) { colour.data[o4] = Math.min(255, base[0]! * shade); colour.data[o4 + 1] = Math.min(255, base[1]! * shade); colour.data[o4 + 2] = Math.min(255, base[2]! * shade); colour.data[o4 + 3] = 255; }
  }
  return { colour, normal, rough, aniso };
}
