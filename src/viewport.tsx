"use client";

import * as React from "react";
import { hiddenFlags, placeAsset, type Asset } from "./assets";
import type { BodyService } from "./client";
import { fabricOf, weaveMaps, type Fabric } from "./fabrics";
import { photoSun, placeFile, placeOf, SEASONS, sunAt, sunLight, type Season } from "./environments";

/**
 * The 3D view. Built to cost little: three.js is fetched only when this screen opens, the renderer is WebGPU with an automatic
 * WebGL2 fallback, the pixel ratio is capped, the model is a meshopt-compressed GLB, a frame is drawn only when something changed (a drag, the turntable, a new body, a new tone, a resize)
 * and never while the tab is hidden or the view is off screen. Light is real: one sun-like light casts a soft shadow map onto a
 * ground that shows only the shadow, and the sky around the body is the lighting too (a studio room, a sky that follows the hour,
 * or a photographed place).
 */

export type Motion = { cycle?: number; skin?: { index: Uint8Array; weight: Uint8Array; influences: number }; bones?: number; frame: (seconds: number, out: Float32Array, bones?: Float64Array) => void; faces: Uint16Array | Uint32Array; count: number; moving: boolean; seatZ: number | null };
/** What a final render needs to reproduce the view: where the camera is round the figure, where the light is and how strong, which environment. */
export type Snapshot = {
  camera: { yaw_deg: number; pitch_deg: number; distance_m: number; fov_deg: number; target_y_m: number };
  sun: { azimuth_deg: number; elevation_deg: number; strength: number; angle_deg: number };
  environment: string | null;
  aspect: number;
};
/**
 * What a final render needs beyond the snapshot: the body exactly as drawn (standing on the ground, centred), each worn item as a glTF binary in the same
 * place (Y up, as glTF says, with its own material, colour and fabric), and the body's colour map on its own texture coordinates when nails, lips or eyelids are coloured.
 */
export type FinalScene = { positions: Float32Array; faces: Uint16Array | Uint32Array; items: ArrayBuffer[]; skinPng: Blob | null };
/** Something worn: a loaded asset, a tint, and optionally a fabric to cover it with (a fabric id from the fabrics list, repeated `repeat` times across its UV layout). */
/** Colour on the body itself, by region: fingernails, toenails, lips, eyelids (hex colours; absent means the skin as it is). */
export type Beauty = { nails?: string; toenails?: string; lips?: string; lids?: string };
/**
 * A garment draped by the cloth simulation, as the Studio receives it: one binary (positions float32 x3 in the body's frame, the flat pattern in
 * millimetres float32 x2, piece index uint16, faces uint32 x3, face strain float32) described by `meta`, the fabric it is cut from, and `offset`,
 * the shift that puts the draped garment back on the body as drawn (the drape is computed on the body centred and standing at z = 0).
 */
/** A print laid over the fabric: a picture, how wide one repeat of it is on the cloth in millimetres, and how the repeats are arranged. */
export type Print = { url: string; repeat_mm: number; mode: "straight" | "half-drop" | "brick" | "mirror" };
/** The air around the figure: clear, haze or fog (light scattered by the air), or falling drizzle, rain or snow (which also wet the cloth and skin). */
export type Weather = "clear" | "haze" | "fog" | "drizzle" | "rain" | "snow";
export type Draped = {
  data: ArrayBuffer; meta: { vertices: number; triangles: number; layout: Record<string, number>; pieces: string[]; grainline_deg: Record<string, number>; frames?: number };
  fabric: string; tint?: string; fitMap: boolean; offset: [number, number, number];
};
export type Worn = { slot: string; asset: Asset; tint?: string; fabric?: { id: string; repeat: number } | null };
export type Preview = { positions: Float32Array; faces: Uint16Array | Uint32Array; version: number };
export type ViewPart = "figure" | "face" | "torso" | "feet";
export type Illuminant = "d65" | "f11" | "a";
/** Linear RGB gains of each light relative to daylight (D65), at equal brightness: F11 (a 4000 K tri-phosphor shop tube, close to TL84) and A (a 2856 K incandescent lamp). */
export const ILLUMINANTS: Record<Illuminant, { label: string; gain: [number, number, number] }> = {
  d65: { label: "Daylight", gain: [1, 1, 1] },
  f11: { label: "Shop light", gain: [1.32, 0.95, 0.62] },
  a: { label: "Warm home light", gain: [1.62, 0.86, 0.32] },
};
/**
 * `assetBase`: the URL the host serves this package's `assets` folder from (environments and fabrics), default "/body-viewer".
 * `body`: the body service, for the body's texture coordinates and region masks and for the textures of what is worn; without it the skin is drawn plain
 * and worn items untextured. `latitude`: the place the open sky is seen from, degrees north positive.
 */
type Props = { assetBase?: string; body?: BodyService | null; latitude: number; weather?: Weather; print?: Print | null; garment?: Draped | null; illuminant?: Illuminant; beauty?: Beauty; viewTick?: number; view?: ViewPart; wear?: Worn[]; snapRef?: React.MutableRefObject<(() => Snapshot | null) | null>; sceneRef?: React.MutableRefObject<(() => Promise<FinalScene | null>) | null>; look: "skin" | "mannequin"; motion: Motion | null; backdrop: string | null; quality: "best" | "fast"; preview: Preview | null; url: string | null; tone: string; spin: boolean; place: string; hour: number; season: Season; fabric: string | null; fabricScale: number; onReady?: (backend: string) => void };
type Handle = {
  setTone: (hex: string) => void;
  setQuality: (q: "best" | "fast") => void;
  setMotion: (m: Motion | null) => void;
  setWear: (w: Worn[]) => void;
  setBeauty: (b: Beauty | undefined) => void;
  setIlluminant: (i: Illuminant) => void;
  setGarment: (g: Draped | null) => void;
  setPrint: (p: Print | null) => void;
  setWeather: (w: Weather) => void;
  setLook: (l: "skin" | "mannequin") => void;
  setPreview: (p: Preview | null) => void;
  setPlace: (id: string) => Promise<void>;
  setFabric: (id: string | null, scale: number) => Promise<void>;
  setTime: (hour: number, season: Season) => void;
  setSpin: (on: boolean) => void;
  show: (url: string) => Promise<void>;
  reset: () => void;
  setView: (part: ViewPart) => void;
  dispose: () => void;
};

export function Viewport({ assetBase = "/body-viewer", body = null, latitude, weather = "clear", print, garment, illuminant: seenUnder = "d65", beauty, viewTick = 0, view = "figure", wear, snapRef, sceneRef, look, motion, backdrop, quality, preview, url, tone, spin, place, hour, season, fabric, fabricScale, onReady }: Props) {
  const host = React.useRef<HTMLDivElement>(null);
  const handle = React.useRef<Handle | null>(null);
  const latest = React.useRef({ assetBase, body, latitude, print, garment, beauty, wear, look, motion, backdrop, quality, preview, url, tone, spin, place, hour, season, fabric, fabricScale });
  latest.current = { assetBase, body, latitude, print, garment, beauty, wear, look, motion, backdrop, quality, preview, url, tone, spin, place, hour, season, fabric, fabricScale };
  const [failed, setFailed] = React.useState<string | null>(null);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      const el = host.current;
      if (!el) return;
      const THREE = await import("three/webgpu");
      const TSL = await import("three/tsl");
      const { ao: aoNode } = await import("three/examples/jsm/tsl/display/GTAONode.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { HDRLoader } = await import("three/examples/jsm/loaders/HDRLoader.js");
      const { SkyMesh } = await import("three/examples/jsm/objects/SkyMesh.js");
      if (dead) return;

      const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      await renderer.init();
      if (dead) { renderer.dispose(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.NeutralToneMapping;          // Khronos PBR Neutral: keeps fabric and skin colour where ACES shifts them
      renderer.toneMappingExposure = 0.82;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      const canvas = renderer.domElement;
      canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "A 3D view of the chosen body. Drag to turn it, scroll to zoom, arrow keys to turn.");
      canvas.tabIndex = 0;
      el.appendChild(canvas);
      const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend ? "WebGPU" : "WebGL2";
      onReady?.(backend);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

      /* Ambient occlusion in the render chain: contact and crease darkening that a shadow map and image lighting cannot give. If the chain cannot be built on
         this device the plain renderer draws instead. */
      let pipeline: InstanceType<typeof THREE.RenderPipeline> | null = null;
      /* The light a colour is judged under, as a camera without white balance sees it: daylight is neutral, a shop's cool-white tube or a warm home lamp tint everything. */
      const illuminant = TSL.uniform(new THREE.Vector3(1, 1, 1));
      try {
        pipeline = new THREE.RenderPipeline(renderer as never);
        const prePass = TSL.pass(scene, camera, { samples: 0 });          // depth and normals for the occlusion pass must not be multisampled
        prePass.setMRT(TSL.mrt({ output: TSL.normalView }));
        const prePassNormal = prePass.getTextureNode();
        const prePassDepth = prePass.getTextureNode("depth");
        const scenePass = TSL.pass(scene, camera);
        const occlusion = aoNode(prePassDepth, prePassNormal, camera);
        const strength = (() => { try { const q = Number(new URLSearchParams(window.location.search).get("ao")); return Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0.45; } catch { return 0.45; } })();
        // how much of the occlusion shows: 0 is none, 1 is all of it; softened so a thin figure is not darkened all over
        const aoValue = TSL.mix(TSL.float(1), occlusion.getTextureNode().sample(TSL.screenUV).r, TSL.float(strength));
        scenePass.contextNode = TSL.builtinAOContext(aoValue);
        pipeline.outputNode = TSL.vec4(scenePass.rgb.mul(illuminant), scenePass.a);
      } catch { pipeline = null; }
      const pmrem = new THREE.PMREMGenerator(renderer as never);
      const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const hemi = new THREE.HemisphereLight(0xffffff, 0xb9aea5, 0.55); scene.add(hemi);
      /* The sun on the body: one light with a soft-filtered shadow. The shadow on the ground is built separately (below) by averaging many positions of the
         sun across its apparent size, which is what gives a real shadow its edge: sharp where it touches the feet, soft further away. */
      const SUNS = 1;
      const suns = Array.from({ length: SUNS }, () => {
        const l = new THREE.DirectionalLight(0xfff4e8, 1.8);
        l.castShadow = true;
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.camera.left = -1.3; l.shadow.camera.right = 1.3; l.shadow.camera.top = 1.3; l.shadow.camera.bottom = -1.3;      // fitted to one figure
        l.shadow.camera.near = 0.5; l.shadow.camera.far = 14;
        l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = 4;
        scene.add(l); scene.add(l.target);
        return l;
      });
      let currentFile: string | null = null;
      let softDeg = 6;
      const lightsOn = 1;
      let lastAim: { dir: [number, number, number]; color: number; strength: number } | null = null;
      const rim = new THREE.DirectionalLight(0xdfe9ff, 0.9); rim.position.set(-2.4, 2.2, -3); scene.add(rim);

      /*
       * The ground shows only the shadow that falls on it, built the way light builds it: each frame the sun is put at another point across its apparent
       * size (the disc of the sun, or the brightest patch of an overcast sky), the shadow that one point casts is drawn from above into a texture, and
       * the samples are averaged. After a few dozen frames the edge is a true penumbra; while the figure moves the average follows it.
       */
      const SPAN = 6, GRID = 1024, ACC_MAX = 48;
      const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true };
      const sampleRT = new THREE.RenderTarget(GRID, GRID, rtOpts);
      let accRead = new THREE.RenderTarget(GRID, GRID, rtOpts), accWrite = new THREE.RenderTarget(GRID, GRID, rtOpts);
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), new THREE.ShadowMaterial({ opacity: 1, color: 0x000000 }));
      catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.layers.set(3); scene.add(catcher);
      const groundCam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 0.1, 20);
      groundCam.position.set(0, 10, 0); groundCam.up.set(0, 0, -1); groundCam.lookAt(0, 0, 0); groundCam.layers.set(3);
      suns[0]!.layers.enable(3);          // lights are seen by layer like objects: the ground pass must see the sun it averages
      const prevTex = TSL.texture(accRead.texture), sampleTex = TSL.texture(sampleRT.texture), blendWeight = TSL.uniform(1);
      const blendMaterial = new THREE.NodeMaterial(); blendMaterial.fragmentNode = TSL.mix(prevTex, sampleTex, blendWeight);
      const blendQuad = new THREE.QuadMesh(blendMaterial);
      const shownTex = TSL.texture(accRead.texture), shadowColour = TSL.uniform(new THREE.Color(0x2a2420)), shadowOpacity = TSL.uniform(0.32);
      const floorMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      floorMaterial.colorNode = shadowColour; floorMaterial.opacityNode = shownTex.a.mul(shadowOpacity);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), floorMaterial);
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; floor.renderOrder = -1; scene.add(floor);
      let accN = 0, accBusy = false, accJitter: () => [number, number, number] = () => [0, 1, 0];
      const resetShadow = () => { accN = 0; };
      const accumulate = (moving: boolean) => {
        if (accBusy || !floor.visible || (accN >= ACC_MAX && !moving)) return;
        accBusy = true;
        const L = suns[0]!, keep = L.position.clone(), c = L.target.position, bg = scene.background;
        try {
          L.position.copy(c).addScaledVector(new THREE.Vector3(...accJitter()), 7);
          scene.background = null;
          const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
          renderer.setRenderTarget(sampleRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, groundCam);
          renderer.setClearColor(cc, ca);
          prevTex.value = accRead.texture; blendWeight.value = moving ? 0.3 : 1 / (accN + 1);
          renderer.setRenderTarget(accWrite); blendQuad.render(renderer as never);
          renderer.setRenderTarget(null);
          const t = accRead; accRead = accWrite; accWrite = t; shownTex.value = accRead.texture;
          accN = Math.min(ACC_MAX, accN + 1);
        } finally {
          L.position.copy(keep); scene.background = bg;
          accBusy = false;
        }
      };
      /* A soft contact shadow under the figure: where body meets ground a real shadow is darkest and no shadow map shows it. */
      const pool = document.createElement("canvas"); pool.width = pool.height = 128;
      { const g = pool.getContext("2d")!; const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(30,24,20,0.5)"); gr.addColorStop(0.5, "rgba(30,24,20,0.2)"); gr.addColorStop(1, "rgba(30,24,20,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
      const contact = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pool), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 }));
      contact.rotation.x = -Math.PI / 2; contact.position.y = 0.002; contact.scale.set(1.0, 0.8, 1); scene.add(contact);

      const skin = new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.55, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.5, sheen: 0.5, sheenRoughness: 0.55 });
      let mannequin = latest.current.look === "mannequin";
      const paint = (hex: string) => {
        skin.userData = {};
        if (mannequin) {
          // a satin mannequin: one even neutral, a soft sheen, no skin colour, so the garment is what the eye reads
          skin.color.set(0xe6e2dc); skin.sheenColor.set(0xffffff); skin.sheen = 0; skin.roughness = 0.32; skin.clearcoat = 0.55; skin.clearcoatRoughness = 0.25;
        } else {
          skin.color.set(hex); skin.sheenColor.set(hex).lerp(new THREE.Color(0xffffff), 0.35); skin.sheen = 0.5; skin.roughness = 0.55; skin.clearcoat = 0.1; skin.clearcoatRoughness = 0.5;
        }
        skin.needsUpdate = true;
      };
      /*
       * Living skin on the browser body, from its own texture coordinates and the body model's region masks: colour built from the tone with blood flush
       * where skin is thin (lips, ears, cheeks) and a faint mottle, a roughness map (lips and nails glossier, the face a little oilier), a fine pore normal
       * repeated over the body, and any nail, lip or eyelid colour on top. A copy of the skin material, so the fitted body (no texture coordinates) keeps the plain one.
       */
      const painted = skin.clone();
      let regions: { uv: Float32Array; mask: Uint8ClampedArray; mask2: Uint8ClampedArray; size: number } | null = null, regionsLoading: Promise<void> | null = null, beautyNow: Beauty | undefined = latest.current.beauty;
      const paintCanvas = document.createElement("canvas"), roughCanvas = document.createElement("canvas"), poreCanvas = document.createElement("canvas");
      const paintTexture = new THREE.CanvasTexture(paintCanvas); paintTexture.colorSpace = THREE.SRGBColorSpace; paintTexture.anisotropy = 4;
      const roughTexture = new THREE.CanvasTexture(roughCanvas);
      const poreTexture = new THREE.CanvasTexture(poreCanvas); poreTexture.wrapS = poreTexture.wrapT = THREE.RepeatWrapping; poreTexture.repeat.set(28, 28);
      const skinOn = () => !mannequin;
      const pixels = (blob: Blob) => new Promise<{ data: Uint8ClampedArray; size: number }>((ok, no) => {
        const i = new Image(), src = URL.createObjectURL(blob); i.onerror = (e) => { URL.revokeObjectURL(src); no(e); };
        i.onload = () => { URL.revokeObjectURL(src); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(i, 0, 0); ok({ data: g.getImageData(0, 0, i.width, i.height).data, size: i.width }); };
        i.src = src;
      });
      const loadRegions = () => regionsLoading ??= (async () => {
        const svc = latest.current.body;
        if (!svc) throw new Error("no body service: the skin is drawn without region colour");
        const [u, m1, m2] = await Promise.all([svc.bytes("files/uv.bin"), svc.blob("files/regions.png").then(pixels), svc.blob("files/regions2.png").then(pixels)]);
        regions = { uv: new Float32Array(u), mask: m1.data, mask2: m2.data, size: m1.size };
        // pores: a small tiling height field of soft pits, turned into a normal map
        const P = 256, h = new Float32Array(P * P);
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 900; k++) {
          const cx = rnd() * P, cy = rnd() * P, r = 1.2 + rnd() * 1.8, depth = 0.5 + rnd() * 0.5;
          for (let y = Math.floor(cy - r * 2); y <= cy + r * 2; y++) for (let x = Math.floor(cx - r * 2); x <= cx + r * 2; x++) {
            const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); if (d2 > 4) continue;
            h[((y + P) % P) * P + ((x + P) % P)] -= depth * Math.exp(-d2);
          }
        }
        for (let k = 0; k < P * P; k++) h[k] += (rnd() - 0.5) * 0.15;
        poreCanvas.width = poreCanvas.height = P;
        const pg = poreCanvas.getContext("2d")!, pd = pg.createImageData(P, P);
        for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
          const dx = h[y * P + ((x + 1) % P)]! - h[y * P + ((x + P - 1) % P)]!, dy = h[((y + 1) % P) * P + x]! - h[((y + P - 1) % P) * P + x]!;
          const nx = -dx * 0.6, ny = -dy * 0.6, l = Math.hypot(nx, ny, 1), o = (y * P + x) * 4;
          pd.data[o] = Math.round(127.5 + 127.5 * nx / l); pd.data[o + 1] = Math.round(127.5 + 127.5 * ny / l); pd.data[o + 2] = Math.round(127.5 + 127.5 / l); pd.data[o + 3] = 255;
        }
        pg.putImageData(pd, 0, 0); poreTexture.needsUpdate = true;
      })();
      const repaintRegions = () => {
        if (!regions) return;
        const s = regions.size, m = regions.mask, m2 = regions.mask2, b = beautyNow ?? {};
        paintCanvas.width = paintCanvas.height = s; roughCanvas.width = roughCanvas.height = s;
        const g = paintCanvas.getContext("2d")!, out = g.createImageData(s, s), d = out.data;
        const rg = roughCanvas.getContext("2d")!, rout = rg.createImageData(s, s), rd = rout.data;
        const base = new THREE.Color(lastTone), cols = [b.nails, b.toenails, b.lips, b.lids].map((x) => (x ? new THREE.Color(x) : null));
        const toByte = (lin: number) => Math.max(0, Math.min(255, Math.round(255 * (lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055))));
        // blood under thin skin reads redder and a little darker; how much shows depends on how much melanin covers it
        const lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b, cover = Math.min(1, Math.max(0.25, 1.2 - lum * 2.2));
        const flushR = 1.0, flushG = 0.78, flushB = 0.76;
        const noise = (x: number, y: number) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };
        const smooth = (u: number, v: number, f: number) => {
          const x = u * f, y = v * f, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
          const a = noise(x0, y0), bb = noise(x0 + 1, y0), c = noise(x0, y0 + 1), dd = noise(x0 + 1, y0 + 1);
          return (a * (1 - tx) + bb * tx) * (1 - ty) + (c * (1 - tx) + dd * tx) * ty;
        };
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const i = y * s + x, u = x / s, v = y / s;
          const lips = m[i * 4 + 2]! / 255, face = m2[i * 4]! / 255, ears = m2[i * 4 + 1]! / 255, areola = m2[i * 4 + 2]! / 255;
          const flush = Math.min(1, (lips * 0.55 + ears * 0.22 + face * 0.08) * cover);
          const mottle = 1 + (smooth(u, v, 64) - 0.5) * 0.05 + (smooth(u, v, 220) - 0.5) * 0.03;
          let r = base.r * mottle, gg = base.g * mottle, bl = base.b * mottle;
          r += (r * flushR - r) * flush; gg += (gg * flushG - gg) * flush; bl += (bl * flushB - bl) * flush;
          const dark = 1 - areola * 0.3; r *= dark; gg *= dark * 0.97; bl *= dark * 0.97;
          let rough = 0.56 - face * 0.06 - lips * 0.18;
          for (let k = 0; k < 4; k++) {
            const c = cols[k]; if (!c) continue;
            const a = (m[i * 4 + k]! / 255) * (k === 3 ? 0.65 : 1);
            if (a > 0) { r += (c.r - r) * a; gg += (c.g - gg) * a; bl += (c.b - bl) * a; if (k < 2) rough += (0.18 - rough) * a; }
          }
          if (!cols[0] && !cols[1]) { const nail = Math.max(m[i * 4]!, m[i * 4 + 1]!) / 255; r += (Math.min(1, r * 1.15 + 0.05) - r) * nail * 0.6; gg += (Math.min(1, gg * 1.05 + 0.04) - gg) * nail * 0.6; bl += (Math.min(1, bl * 1.05 + 0.04) - bl) * nail * 0.6; rough -= nail * 0.2; }
          d[i * 4] = toByte(r); d[i * 4 + 1] = toByte(gg); d[i * 4 + 2] = toByte(bl); d[i * 4 + 3] = 255;
          const rv = Math.round(255 * Math.max(0.05, Math.min(1, rough))); rd[i * 4] = rv; rd[i * 4 + 1] = rv; rd[i * 4 + 2] = rv; rd[i * 4 + 3] = 255;
        }
        g.putImageData(out, 0, 0); paintTexture.needsUpdate = true;
        rg.putImageData(rout, 0, 0); roughTexture.needsUpdate = true;
        painted.copy(skin); painted.color.set(0xffffff); painted.map = paintTexture; painted.roughness = 1; painted.roughnessMap = roughTexture;
        painted.normalMap = poreTexture; painted.normalScale.set(0.22, 0.22); painted.needsUpdate = true;
      };
      const dressBody = () => {
        if (!previewMesh || !previewGeo) return;
        const on = skinOn() && regions && previewGeo.getAttribute("position").count * 2 === regions.uv.length;
        if (on && !previewGeo.getAttribute("uv")) previewGeo.setAttribute("uv", new THREE.BufferAttribute(regions!.uv, 2));
        previewMesh.material = on ? painted : skin;
      };
      const setBeauty = (b: Beauty | undefined) => {
        beautyNow = b;
        if (!skinOn()) { dressBody(); wake(); draw(); return; }
        loadRegions().then(() => { repaintRegions(); dressBody(); wake(); draw(); }).catch(() => {});
      };
      let lastTone = latest.current.tone;
      paint(lastTone);

      /* A gently folded swatch of cloth, for looking at a fabric under the chosen light. A fixed shape, not a simulation. */
      const swatchGeo = new THREE.PlaneGeometry(1.1, 1.5, 140, 190);
      {
        const pos = swatchGeo.attributes.position!;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          pos.setZ(i, 0.045 * Math.sin(x * 2 * Math.PI * 3.2 + 0.6 * Math.sin(y * 3)) + 0.02 * Math.sin(x * 2 * Math.PI * 7.1 + y * 2) + 0.05 * Math.cos((y / 1.5) * Math.PI));
        }
        swatchGeo.computeVertexNormals();
      }
      const cloth = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
      const swatch = new THREE.Mesh(swatchGeo, cloth);
      swatch.position.set(0, 0.95, 0); swatch.castShadow = true; swatch.receiveShadow = true; swatch.visible = false; scene.add(swatch);
      const textures = new Map<string, Array<InstanceType<typeof THREE.Texture>>>();
      /* A fabric's maps, once each: a photographed fabric's colour, relief and roughness with the thread-direction map from its weave, or a built fabric's maps made from its weave. */
      type FabricMaps = { map: InstanceType<typeof THREE.Texture> | null; normal: InstanceType<typeof THREE.Texture>; rough: InstanceType<typeof THREE.Texture>; aniso: InstanceType<typeof THREE.Texture> | null; fabric: Fabric };
      const fabricMapCache = new Map<string, Promise<FabricMaps>>();
      const canvasTex = (img: ImageData, srgb: boolean) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d")!.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
      };
      const fabricMaps = (id: string) => {
        let p = fabricMapCache.get(id);
        if (!p) {
          p = (async () => {
            const f = fabricOf(id); if (!f) throw new Error("no such fabric");
            const built = f.optics.weave ? weaveMaps(f, f.source === "built" ? 512 : 256) : null;
            let map: InstanceType<typeof THREE.Texture> | null, normal: InstanceType<typeof THREE.Texture>, rough: InstanceType<typeof THREE.Texture>;
            if (f.source === "photo") {
              const loader = new THREE.TextureLoader();
              [map, normal, rough] = await Promise.all(["color", "normal", "rough"].map((k) => loader.loadAsync(`${latest.current.assetBase.replace(/\/+$/, "")}/fabric/${id}_${k}.jpg`)));
              map!.colorSpace = THREE.SRGBColorSpace;
            } else {
              map = canvasTex(built!.colour!, true); normal = canvasTex(built!.normal, false); rough = canvasTex(built!.rough, false);
            }
            const aniso = built && f.optics.anisotropy > 0 ? canvasTex(built.aniso, false) : null;
            for (const t of [map, normal, rough, aniso]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
            return { map, normal, rough, aniso, fabric: f };
          })();
          p.catch(() => fabricMapCache.delete(id));
          fabricMapCache.set(id, p);
        }
        return p;
      };
      /** Dress a physical material in a fabric: its maps repeated `repeat` times, its optics, and a tint over its colour. */
      /* The print, as one tile that repeats seamlessly in the chosen arrangement, and its size on the cloth in millimetres. */
      let printNow: { tex: InstanceType<typeof THREE.Texture>; wMm: number; hMm: number } | null = null;
      const printTile = async (p: Print) => {
        const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => no(new Error("the print could not be loaded")); i.src = p.url; });
        const W = Math.min(1024, img.naturalWidth), H = Math.round((W * img.naturalHeight) / img.naturalWidth);
        const cw = p.mode === "half-drop" || p.mode === "mirror" ? 2 * W : W, ch = p.mode === "brick" || p.mode === "mirror" ? 2 * H : H;
        const c = document.createElement("canvas"); c.width = cw; c.height = ch; const g = c.getContext("2d")!;
        const put = (x: number, y: number, fx = 1, fy = 1) => { g.save(); g.translate(x + (fx < 0 ? W : 0), y + (fy < 0 ? H : 0)); g.scale(fx, fy); g.drawImage(img, 0, 0, W, H); g.restore(); };
        if (p.mode === "straight") put(0, 0);
        else if (p.mode === "half-drop") { put(0, 0); put(W, -H / 2); put(W, H / 2); }
        else if (p.mode === "brick") { put(0, 0); put(-W / 2, H); put(W / 2, H); }
        else { put(0, 0); put(W, 0, -1, 1); put(0, H, 1, -1); put(W, H, -1, -1); }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
        const wMm = p.repeat_mm * (cw / W), hMm = p.repeat_mm * (H / W) * (ch / H);
        return { tex: t, wMm, hMm };
      };
      const wearFabric = (m: InstanceType<typeof THREE.MeshPhysicalMaterial>, fm: FabricMaps, repeat: [number, number], tint?: string, printRepeat?: [number, number]) => {
        const rep = (t: InstanceType<typeof THREE.Texture> | null) => { if (!t) return null; const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.needsUpdate = true; return c; };
        const op = fm.fabric.optics;
        m.map = rep(fm.map); m.normalMap = rep(fm.normal); m.roughnessMap = rep(fm.rough); m.roughness = fm.fabric.source === "photo" ? op.roughness : 1;
        m.normalScale.set(fm.fabric.source === "photo" ? 1.2 : 0.9, fm.fabric.source === "photo" ? 1.2 : 0.9);
        m.sheen = op.sheen; m.sheenRoughness = op.sheenRoughness; m.sheenColor.set(tint ?? fm.fabric.colour ?? "#ffffff").lerp(new THREE.Color(0xffffff), 0.4);
        m.anisotropy = fm.aniso ? op.anisotropy : 0; m.anisotropyMap = rep(fm.aniso);
        m.clearcoat = op.clearcoat ?? 0; m.clearcoatRoughness = 0.4;
        const sheer = op.translucent > 0.4; m.transparent = sheer; m.opacity = sheer ? 1 - 0.55 * op.translucent : 1; m.depthWrite = !sheer;
        m.color.set(tint ?? "#ffffff");
        if (printNow && printRepeat) { const t = printNow.tex.clone(); t.repeat.set(printRepeat[0], printRepeat[1]); t.needsUpdate = true; m.map = t; m.color.set("#ffffff"); }
        m.needsUpdate = true;
      };
      let fabricOn = false;
      let previewShown = false;

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true; controls.dampingFactor = 0.09; controls.enablePan = false;
      controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 + 0.12; controls.autoRotateSpeed = 1.1;
      controls.listenToKeyEvents(canvas); controls.keyRotateSpeed = 8;

      let height = 1.7;
      let model: InstanceType<typeof THREE.Mesh> | null = null;
      let running = false;
      let visible = true;
      let raf = 0;
      let motionNow: Motion | null = null;
      let drawMotion: (t: number) => void = () => {};
      const frame = (h: number) => {
        const d = (h / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.55;
        camera.position.set(0, h * 0.55, d); controls.target.set(0, h * 0.5, 0);
        controls.minDistance = d * 0.45; controls.maxDistance = d * 2.2; controls.update();
      };
      let useChain = latest.current.quality === "best";
      const draw = () => { accumulate(!!(motionNow && motionNow.moving)); if (pipeline && useChain) { try { pipeline.render(); return; } catch { pipeline = null; } } renderer.render(scene, camera); };
      let wetNow: () => number = () => 0, weatherNowRef: () => Weather = () => "clear", setWeatherRef: (w: Weather) => void = () => {};
      /* Weather: fog thickens the air; drizzle, rain and snow fall through a box around the figure, and wet what they fall on. */
      let weatherNow: Weather = "clear", wet = 0;
      const FALL = 2600;
      const fallGeo = new THREE.BufferGeometry(), fallPos = new Float32Array(FALL * 6), fallSeed = new Float32Array(FALL * 3);
      for (let i = 0; i < FALL; i++) { fallSeed[i * 3] = (Math.random() - 0.5) * 5; fallSeed[i * 3 + 1] = Math.random() * 4; fallSeed[i * 3 + 2] = (Math.random() - 0.5) * 5; }
      fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
      const fallMat = new THREE.LineBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.35, depthWrite: false });
      const fall = new THREE.LineSegments(fallGeo as never, fallMat); fall.frustumCulled = false; fall.visible = false; scene.add(fall);
      const stepFall = (t: number) => {
        if (!fall.visible) return;
        const snow = weatherNow === "snow", speed = snow ? 0.9 : weatherNow === "drizzle" ? 4.5 : 8, len = snow ? 0.012 : weatherNow === "drizzle" ? 0.05 : 0.12;
        for (let i = 0; i < FALL; i++) {
          const y = 4 - ((fallSeed[i * 3 + 1]! + t * speed) % 4), sway = snow ? Math.sin(t * 0.8 + i) * 0.15 : 0.04 * y;
          const x = fallSeed[i * 3]! + sway, z = fallSeed[i * 3 + 2]!;
          fallPos.set([x, y, z, x + (snow ? len : 0.01), y - len, z], i * 6);
        }
        (fallGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
      };
      const wetMaterial = (m: unknown) => {
        const p = m as { userData: Record<string, number>; color?: { multiplyScalar: (s: number) => void; copy: (c: unknown) => void; clone: () => unknown }; roughness?: number; clearcoat?: number; needsUpdate: boolean };
        if (!p || !p.color || typeof p.roughness !== "number") return;
        p.userData.dryRough ??= p.roughness; p.userData.dryCoat ??= p.clearcoat ?? 0;
        if (!p.userData.dryColor) (p.userData as Record<string, unknown>).dryColor = p.color.clone();
        p.color.copy((p.userData as Record<string, unknown>).dryColor); p.color.multiplyScalar(1 - 0.32 * wet);
        p.roughness = p.userData.dryRough! * (1 - 0.45 * wet);
        if (typeof p.clearcoat === "number") p.clearcoat = Math.max(p.userData.dryCoat!, 0.35 * wet);
        p.needsUpdate = true;
      };
      wetNow = () => wet; weatherNowRef = () => weatherNow;
      const setWeather = (w: Weather) => {
        weatherNow = w;
        const density = { clear: 0, haze: 0.025, fog: 0.11, drizzle: 0.03, rain: 0.045, snow: 0.05 }[w];
        scene.fog = density ? new THREE.FogExp2(w === "snow" ? 0xe8ecf0 : 0xc6ccd3, density) : null;
        fall.visible = w === "drizzle" || w === "rain" || w === "snow";
        fallMat.color.setHex(w === "snow" ? 0xffffff : 0xdfe6ee); fallMat.opacity = w === "snow" ? 0.9 : w === "drizzle" ? 0.25 : 0.4;
        wet = w === "rain" ? 1 : w === "drizzle" ? 0.5 : w === "snow" ? 0.25 : 0;
        scene.traverse((o) => { const mesh = o as { isMesh?: boolean; material?: unknown }; if (mesh.isMesh && mesh.material && mesh.material !== floor.material) wetMaterial(mesh.material); });
        stepFall(performance.now() / 1000); wake(); draw();
      };
      setWeatherRef = setWeather;

      const tick = () => {
        raf = 0;
        if (dead || !visible || document.hidden) { running = false; return; }
        const moved = controls.update();
        if (motionNow && motionNow.moving) drawMotion(performance.now() / 1000);
        stepFall(performance.now() / 1000);
        draw();
        if (moved || controls.autoRotate || (motionNow && motionNow.moving) || fall.visible || (floor.visible && accN < ACC_MAX)) raf = requestAnimationFrame(tick); else running = false;
      };
      const wake = () => { if (!running && visible && !document.hidden) { running = true; raf = requestAnimationFrame(tick); } };
      controls.addEventListener("start", wake); controls.addEventListener("change", wake);

      let afterResize: () => void = () => {};          // set once a picture backdrop exists
      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
        afterResize();
        wake();
      };
      const ro = new ResizeObserver(resize); ro.observe(el); resize();
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }); io.observe(el);
      const onVis = () => { if (!document.hidden) wake(); };
      document.addEventListener("visibilitychange", onVis);

      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      let loading = 0;
      const show = async (src: string) => {
        const mine = ++loading;
        const gltf = await loader.loadAsync(src);
        if (dead || mine !== loading) { gltf.scene.traverse((o) => { const m = o as InstanceType<typeof THREE.Mesh>; m.geometry?.dispose?.(); }); return; }
        let mesh: InstanceType<typeof THREE.Mesh> | null = null;
        gltf.scene.traverse((o) => { if (!mesh && (o as InstanceType<typeof THREE.Mesh>).isMesh) mesh = o as InstanceType<typeof THREE.Mesh>; });
        if (!mesh) throw new Error("the body file has no surface");
        const m = mesh as InstanceType<typeof THREE.Mesh>;
        m.material = skin; m.castShadow = true; m.receiveShadow = true; m.visible = !fabricOn && !previewShown;
        m.rotation.x = -Math.PI / 2;                                  // the body model stands on Z; the scene stands on Y
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m);
        m.position.x -= (box.min.x + box.max.x) / 2; m.position.z -= (box.min.z + box.max.z) / 2; m.position.y -= box.min.y;
        const old = model; model = m; scene.add(m);
        if (old) { scene.remove(old); old.geometry.dispose(); }
        const h = box.max.y - box.min.y;
        if (Math.abs(h - height) > 0.02 || !old) { height = h; frame(h); }
        wake(); draw();
      };

      /* Places. A photographed place is loaded once and kept. */
      const photos = new Map<string, { env: InstanceType<typeof THREE.Texture>; bg: InstanceType<typeof THREE.Texture>; sunShare: number }>();
      let skyEnv: { dispose: () => void; texture: InstanceType<typeof THREE.Texture> } | null = null;
      let skyScene: InstanceType<typeof THREE.Scene> | null = null;
      let skyMain: InstanceType<typeof SkyMesh> | null = null;
      let skyEnvMesh: InstanceType<typeof SkyMesh> | null = null;
      let current = "studio";
      afterResize = () => { if (current === "custom" && backdropSource && scene.background === coverTex) coverTexture(); };
      const shadowLook = (hex: number, opacity: number) => { shadowColour.value.setHex(hex); shadowOpacity.value = opacity; };
      let placing = 0;
      let backdropSource: HTMLImageElement | null = null;
      let coverCanvas: HTMLCanvasElement | null = null;
      let coverTex: InstanceType<typeof THREE.CanvasTexture> | null = null;
      /* A picture that is not a panorama stands behind the figure, filled to the frame without stretching. */
      const coverTexture = () => {
        const wpx = Math.max(2, Math.round(el.clientWidth || 2)), hpx = Math.max(2, Math.round(el.clientHeight || 2));
        if (!coverCanvas) coverCanvas = document.createElement("canvas");
        if (coverCanvas.width !== wpx || coverCanvas.height !== hpx) { coverCanvas.width = wpx; coverCanvas.height = hpx; }
        const g = coverCanvas.getContext("2d")!;
        if (backdropSource) {
          const s = Math.max(wpx / backdropSource.naturalWidth, hpx / backdropSource.naturalHeight);
          const dw = backdropSource.naturalWidth * s, dh = backdropSource.naturalHeight * s;
          g.drawImage(backdropSource, (wpx - dw) / 2, (hpx - dh) / 2, dw, dh);
        }
        if (!coverTex) { coverTex = new THREE.CanvasTexture(coverCanvas); coverTex.colorSpace = THREE.SRGBColorSpace; }
        coverTex.needsUpdate = true;
        return coverTex;
      };
      const aim = (dir: [number, number, number], color: number, strength: number) => {
        lastAim = { dir, color, strength };
        const d = new THREE.Vector3(...dir).normalize();
        const c = new THREE.Vector3(0, height * 0.5, 0);
        const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const t1 = new THREE.Vector3().crossVectors(d, up).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
        const spread = Math.tan((softDeg * Math.PI) / 180);
        accJitter = () => { const r = Math.sqrt(Math.random()) * spread, th = Math.random() * Math.PI * 2; const v = d.clone().addScaledVector(t1, r * Math.cos(th)).addScaledVector(t2, r * Math.sin(th)).normalize(); return [v.x, v.y, v.z]; };
        resetShadow();
        suns.forEach((l, k) => {
          const r = k === 0 ? 0 : Math.sqrt((k + 0.5) / SUNS) * spread, th = k * 2.399963;
          const dk = d.clone().addScaledVector(t1, r * Math.cos(th)).addScaledVector(t2, r * Math.sin(th)).normalize();
          l.target.position.copy(c); l.position.copy(c).addScaledVector(dk, 7);
          l.color.setHex(color); l.intensity = k < lightsOn ? strength / lightsOn : 0; l.visible = k < lightsOn && strength > 0.01;
        });
        floor.visible = strength > 0.01;
      };
      const skyAt = () => {
        const L = latest.current;
        const day = SEASONS.find((x) => x.id === L.season)?.day ?? 172;
        const s = sunAt(L.hour, day, L.latitude);
        const light = sunLight(s.elevationDeg);
        // below the horizon the sun is out of the shadow camera's useful range; keep the shadow direction but no direct light
        const lift: [number, number, number] = s.dir[1] < 0.12 ? [s.dir[0], 0.12, s.dir[2]] : s.dir;
        aim(lift, light.color, light.strength * 2.4);
        shadowLook(0x1d2a45, 0.15 + 0.4 * light.strength);
        // the sky keeps its twilight glow until the sun is well down; the light on the body follows the real sun
        const shown = s.dir[1] < -0.05 ? [s.dir[0], -0.05, s.dir[2]] : s.dir;
        const big = new THREE.Vector3(...shown).multiplyScalar(450000);
        const night = Math.max(0, Math.min(1, (0.1 - s.dir[1]) / 0.2));        // 0 in daylight, 1 once the sun is well down
        hemi.visible = night > 0.02; hemi.color.setHex(0x8fa4d8); hemi.groundColor.setHex(0x20242e); hemi.intensity = 1.4 * night;
        for (const m of [skyMain, skyEnvMesh]) if (m) m.sunPosition.value.copy(big);
        skyEnv?.dispose();
        const target = pmrem.fromScene(skyScene!, 0, 0.1, 200);
        skyEnv = target;
        scene.environment = target.texture;
        scene.environmentIntensity = 0.35 + 0.35 * light.strength + 0.5 * night;
        renderer.toneMappingExposure = placeOf("sky").exposure + 0.55 * night;
      };
      /* The sun is in the photograph, and so would be counted twice: once in the lighting taken from the sky and once in the directional light that casts the
         shadow, and a shadow only dims the second. So the lighting copy has the sun pulled down to the level of the sky around it, and the directional light
         carries the sun. Returns the copy and how much of the sky's light the sun was. */
      const clampSun = (tex: InstanceType<typeof THREE.Texture>): { lit: InstanceType<typeof THREE.Texture>; sunShare: number } => {
        const img = tex.image as { data: Uint16Array | Float32Array; width: number; height: number };
        const half = img.data instanceof Uint16Array;
        const rd = (x: number) => (half ? THREE.DataUtils.fromHalfFloat(x) : x);
        const wr = (x: number) => (half ? THREE.DataUtils.toHalfFloat(x) : x);
        const n = img.width * img.height, stride = img.data.length / n;
        const lum = new Float32Array(n);
        for (let i = 0; i < n; i++) lum[i] = 0.2126 * rd(img.data[i * stride]!) + 0.7152 * rd(img.data[i * stride + 1]!) + 0.0722 * rd(img.data[i * stride + 2]!);
        const sample: number[] = []; for (let i = 0; i < n; i += 37) sample.push(lum[i]!);
        sample.sort((a, b) => a - b);
        const median = sample[Math.floor(sample.length / 2)] || 0.1, cap = Math.max(median * 6, 0.5);
        const out = img.data.slice() as Uint16Array | Float32Array;
        let total = 0, removed = 0;
        for (let y = 0; y < img.height; y++) {
          const w = Math.cos(((y + 0.5) / img.height - 0.5) * Math.PI);             // solid angle shrinks toward the poles
          for (let x = 0; x < img.width; x++) {
            const i = y * img.width + x, l = lum[i]!;
            total += l * w;
            if (l > cap) {
              const k = cap / l; removed += (l - cap) * w;
              for (let c = 0; c < 3; c++) out[i * stride + c] = wr(rd(img.data[i * stride + c]!) * k);
            }
          }
        }
        const lit = tex.clone(); lit.image = { data: out, width: img.width, height: img.height }; lit.needsUpdate = true;
        return { lit, sunShare: total > 0 ? Math.min(1, removed / total) : 0 };
      };
      const setPlace = async (id: string) => {
        const mine = ++placing;
        const p = placeOf(id);
        softDeg = p.soft ?? 6;
        currentFile = p.kind === "photo" ? p.file ?? null : null;
        let loaded: { env: InstanceType<typeof THREE.Texture>; bg: InstanceType<typeof THREE.Texture>; sunShare: number } | null = null;
        if (p.kind === "photo") {
          loaded = photos.get(p.id) ?? null;
          if (!loaded) {
            const tex = await new HDRLoader().loadAsync(placeFile(latest.current.assetBase, p)!);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            const { lit, sunShare } = clampSun(tex);
            loaded = { env: pmrem.fromEquirectangular(lit).texture, bg: tex, sunShare };
            photos.set(p.id, loaded);
          }
        }
        let picture: { tex: InstanceType<typeof THREE.Texture>; img: HTMLImageElement; sun: { u: number; v: number; strength: number } } | null = null;
        if (p.kind === "image") {
          const src = latest.current.backdrop;
          if (!src) throw new Error("there is no picture to use yet");
          const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("that picture could not be opened")); i.src = src; });
          const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
          // where the picture is brightest tells where the light comes from: the brightest block of a small copy, and how much it stands out
          const w = 64, h = 32, c = document.createElement("canvas"); c.width = w; c.height = h;
          const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(img, 0, 0, w, h);
          const d = g.getImageData(0, 0, w, h).data; let best = 0, bx = 0.5, by = 0.3, sum = 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; sum += l; if (l > best) { best = l; bx = x / w; by = y / h; } }
          const mean = sum / (w * h) || 1;
          picture = { tex, img, sun: { u: bx, v: by, strength: Math.max(0.15, Math.min(1, (best / mean - 1) / 3)) } };
        }
        if (dead || mine !== placing) return;
        current = p.id;
        scene.environmentRotation.y = 0; scene.backgroundRotation.y = 0;
        if (skyMain) skyMain.visible = false;
        hemi.color.setHex(0xffffff); hemi.groundColor.setHex(0xb9aea5); hemi.intensity = 0.55;
        if (p.kind === "room") {
          scene.environment = roomEnv; scene.environmentIntensity = 0.5; scene.background = null;
          hemi.visible = true; rim.visible = true;
          aim([2.2, 3.2, 2.6], 0xfff4e8, 1.8);
          shadowLook(0x2a2420, 0.3);
          renderer.toneMappingExposure = p.exposure;
        } else if (p.kind === "photo" && loaded && p.sun) {
          hemi.visible = false; rim.visible = false;
          const d = photoSun(p.sun);
          const a0 = Math.atan2(d[2], d[0]);
          const theta = a0 - (60 * Math.PI) / 180;           // turn the place so its sun stands in front of the camera and to the right
          scene.environmentRotation.y = theta; scene.backgroundRotation.y = theta;
          const w = new THREE.Vector3(...d).applyEuler(new THREE.Euler(0, theta, 0));
          const lightColor = sunLight(Math.max(0, p.sun.v - 0.5) * 180);
          aim([w.x, Math.max(w.y, 0.12), w.z], lightColor.color || 0xfff4e8, (p.sunStrength ?? 0) * 2.4);
          // the shadow is the sky's colour, as deep as the sun is a share of the light: faint under cloud, strong in clear sun
          shadowLook(p.group === "Studio" ? 0x2a2420 : 0x1d2a45, Math.min(0.6, 0.1 + loaded.sunShare * 3.2));
          scene.environment = loaded.env; scene.environmentIntensity = 0.9;
          scene.background = loaded.bg; scene.backgroundBlurriness = 0.02;
          renderer.toneMappingExposure = p.exposure;
        } else if (p.kind === "image" && picture) {
          hemi.visible = false; rim.visible = false;
          const wide = picture.img.naturalWidth / picture.img.naturalHeight >= 1.8;
          const env = picture.tex.clone(); env.mapping = THREE.EquirectangularReflectionMapping; env.needsUpdate = true;
          scene.environment = pmrem.fromEquirectangular(env).texture; scene.environmentIntensity = 0.9;
          if (wide) { picture.tex.mapping = THREE.EquirectangularReflectionMapping; scene.background = picture.tex; scene.backgroundBlurriness = 0.02; }
          else { backdropSource = picture.img; scene.background = coverTexture(); }
          // the light comes from where the picture is brightest, in front of the figure and to one side
          const az = (60 + (picture.sun.u - 0.5) * 80) * (Math.PI / 180), el = (8 + (1 - picture.sun.v) * 52) * (Math.PI / 180);
          aim([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)], 0xfff4e8, picture.sun.strength * 2.4);
          shadowLook(0x2a2a38, 0.15 + 0.35 * picture.sun.strength);
          renderer.toneMappingExposure = p.exposure;
        } else if (p.kind === "sky") {
          hemi.visible = false; rim.visible = false; scene.background = null;
          if (!skyScene) {
            skyScene = new THREE.Scene();
            skyEnvMesh = new SkyMesh(); skyEnvMesh.scale.setScalar(150); skyScene.add(skyEnvMesh);
            skyMain = new SkyMesh(); skyMain.scale.setScalar(40); scene.add(skyMain);
            for (const m of [skyMain, skyEnvMesh]) { m.turbidity.value = 4; m.rayleigh.value = 1.4; m.mieCoefficient.value = 0.005; m.mieDirectionalG.value = 0.8; }
          }
          skyMain!.visible = true;
          skyAt();
        }
        wake(); draw();
      };
      let timeQueued = 0;
      const setTime = () => {
        if (current !== "sky" || timeQueued) return;
        timeQueued = requestAnimationFrame(() => { timeQueued = 0; if (!dead && current === "sky") { skyAt(); wake(); draw(); } });
      };

      /* A preview body, drawn from the vertices the host gives (a body service result), shown until the fitted body arrives. */
      let previewMesh: InstanceType<typeof THREE.Mesh> | null = null;
      let wearHook: (() => void) | null = null;
      let itemsOf: () => Iterable<{ out: Float32Array; geo: InstanceType<typeof THREE.BufferGeometry>; mesh: InstanceType<typeof THREE.Mesh>; worn: Worn }> = () => [];
      let previewGeo: InstanceType<typeof THREE.BufferGeometry> | null = null;
      const setPreview = (pv: Preview | null) => {
        if (!pv) {
          previewShown = false;
          if (previewMesh) previewMesh.visible = false;
          if (model) model.visible = !fabricOn;
          wake(); draw(); return;
        }
        if (!previewMesh || !previewGeo) {
          previewGeo = new THREE.BufferGeometry();
          previewGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pv.positions.length), 3));
          previewGeo.setIndex(new THREE.BufferAttribute(pv.faces as Uint16Array, 1));
          previewMesh = new THREE.Mesh(previewGeo as never, skin); queueMicrotask(dressBody);
          previewMesh.rotation.x = -Math.PI / 2; previewMesh.castShadow = true; previewMesh.receiveShadow = true; previewMesh.frustumCulled = false;
          scene.add(previewMesh);
        }
        const pos = previewGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>;
        (pos.array as Float32Array).set(pv.positions);
        pos.needsUpdate = true;
        previewGeo.computeVertexNormals();
        bodyNowPos = pv.positions; bodyFaces = pv.faces;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const a = pv.positions;
        for (let i = 0; i < a.length; i += 3) {
          const x = a[i]!, y = a[i + 1]!, z = a[i + 2]!;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        previewMesh.position.set(-(minX + maxX) / 2, -minZ, (minY + maxY) / 2);
        previewMesh.visible = !fabricOn; previewShown = true;
        if (model) model.visible = false;
        const h = maxZ - minZ;
        if (Math.abs(h - height) > 0.02) { height = h; frame(h); }
        resetShadow(); wearHook?.();
        wake(); draw();
      };

      /* Movement: a pose or a stride drawn from the emulated body, bent by the page itself, with a seat under a seated figure. */
      let motionBuf: Float32Array | null = null;
      let motionGround: { dx: number; dy: number; dz: number } | null = null;
      let seatGroup: InstanceType<typeof THREE.Group> | null = null;
      const seatMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.8, metalness: 0 });
      const showSeat = (yWorld: number | null, zWorld = 0) => {
        if (yWorld === null) { if (seatGroup) seatGroup.visible = false; return; }
        if (!seatGroup) {
          seatGroup = new THREE.Group();
          const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.46), seatMaterial); slab.castShadow = true; slab.receiveShadow = true; seatGroup.add(slab);
          scene.add(seatGroup);
        }
        seatGroup.visible = true; seatGroup.position.set(0, yWorld - 0.02, zWorld);
        // four legs from the slab to the floor, sized to the seat's height
        seatGroup.children.slice(1).forEach((c) => seatGroup!.remove(c));
        for (const [lx, lz] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]] as const) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, yWorld - 0.04, 8), seatMaterial);
          leg.position.set(lx, -(yWorld - 0.04) / 2 - 0.02, lz); leg.castShadow = true; seatGroup.add(leg);
        }
      };
      drawMotion = (t: number) => {
        const m = motionNow; if (!m || !motionBuf || !previewMesh || !previewGeo) return;
        if (m.skin && m.bones) { if (!motionBones || motionBones.length !== m.bones * 9) motionBones = new Float64Array(m.bones * 9); m.frame(t, motionBuf, motionBones); } else m.frame(t, motionBuf);
        bodyNowPos = motionBuf; bodyFaces = m.faces;
        const pos = previewGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>;
        (pos.array as Float32Array).set(motionBuf); pos.needsUpdate = true;
        previewGeo.computeVertexNormals();
        if (!motionGround) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
          const a = motionBuf;
          for (let i = 0; i < a.length; i += 3) { const x = a[i]!, y = a[i + 1]!, z = a[i + 2]!; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; }
          motionGround = { dx: -(minX + maxX) / 2, dy: -minZ, dz: (minY + maxY) / 2 };            // fixed from the first frame, so a stride bobs as a body does
          if (m.seatZ !== null) showSeat(m.seatZ - minZ + 0.0, motionGround.dz + 0.1); else showSeat(null);
        }
        previewMesh.position.set(motionGround.dx, motionGround.dy, motionGround.dz);
        applyWear();
        animateGarment(t);
      };
      const setMotion = (m: Motion | null) => {
        motionNow = m; motionGround = null; resetShadow();
        if (!m) { showSeat(null); setPreview(latest.current.preview); return; }
        if (!previewMesh || !previewGeo || (previewGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>).count !== m.count) {
          if (previewMesh) { scene.remove(previewMesh); previewGeo?.dispose(); previewMesh = null; previewGeo = null; }
          previewGeo = new THREE.BufferGeometry();
          previewGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.count * 3), 3));
          previewGeo.setIndex(new THREE.BufferAttribute(m.faces as Uint16Array, 1));
          previewMesh = new THREE.Mesh(previewGeo as never, skin); queueMicrotask(dressBody);
          previewMesh.rotation.x = -Math.PI / 2; previewMesh.castShadow = true; previewMesh.receiveShadow = true; previewMesh.frustumCulled = false;
          scene.add(previewMesh);
        }
        if (!motionBuf || motionBuf.length !== m.count * 3) motionBuf = new Float32Array(m.count * 3);
        previewShown = true; previewMesh.visible = !fabricOn;
        if (model) model.visible = false;
        drawMotion(performance.now() / 1000);
        const h = (() => { let mn = Infinity, mx = -Infinity; for (let i = 2; i < motionBuf.length; i += 3) { const z = motionBuf[i]!; if (z < mn) mn = z; if (z > mx) mx = z; } return mx - mn; })();
        if (Math.abs(h - height) > 0.02) { height = h; frame(h); }
        wake(); draw();
      };

      /* What is worn: each item a mesh bound to the body's own vertices, placed from the body's current positions every time the body changes. */
      type Item = { eyeUv?: boolean; worn: Worn; mesh: InstanceType<typeof THREE.Mesh>; geo: InstanceType<typeof THREE.BufferGeometry>; out: Float32Array };
      const items = new Map<string, Item>();
      itemsOf = () => items.values();
      const wearTextures = new Map<string, InstanceType<typeof THREE.Texture>>();
      let bodyNowPos: Float32Array | null = null, bodyFaces: Uint16Array | Uint32Array | null = null, motionBones: Float64Array | null = null, hiddenKey = "", hiddenGeo: unknown = null;
      /* A worn item's texture comes from the body service (it may need the host's token), so it is fetched first and handed to the loader as a local URL. */
      const texFor = (name: string, srgb: boolean) => {
        let t = wearTextures.get(name);
        if (!t) {
          const tex = new THREE.Texture();
          if (srgb) tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
          const svc = latest.current.body;
          if (svc) svc.blob(`wardrobe/${name}`).then((b) => {
            const src = URL.createObjectURL(b);
            new THREE.ImageLoader().load(src, (img) => { URL.revokeObjectURL(src); tex.image = img; tex.needsUpdate = true; wake(); draw(); }, undefined, () => URL.revokeObjectURL(src));
          }).catch(() => {});
          t = tex; wearTextures.set(name, t);
        }
        return t;
      };
      /* An eye is drawn from a painted iris whose pattern is placed on the eye by its own geometry, so it stays round however coarse the mesh. */
      const irisTextures = new Map<string, InstanceType<typeof THREE.Texture>>();
      const irisFor = (colour: string) => {
        let t = irisTextures.get(colour);
        if (t) return t;
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const g = c.getContext("2d")!, mid = 128, tint = new THREE.Color(colour);
        g.fillStyle = "#f4f1ec"; g.fillRect(0, 0, 256, 256);
        const ring = g.createRadialGradient(mid, mid, 8, mid, mid, 50);
        ring.addColorStop(0, `#${tint.clone().multiplyScalar(0.55).getHexString()}`); ring.addColorStop(0.55, colour); ring.addColorStop(0.9, `#${tint.clone().multiplyScalar(0.7).getHexString()}`); ring.addColorStop(1, "#1a1512");
        g.fillStyle = ring; g.beginPath(); g.arc(mid, mid, 50, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#0b0908"; g.beginPath(); g.arc(mid, mid, 17, 0, Math.PI * 2); g.fill();
        t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        irisTextures.set(colour, t);
        return t;
      };
      const materialFor = (w: Worn) => {
        if (w.slot === "eyes") return new THREE.MeshStandardMaterial({ map: irisFor(w.tint ?? "#5b7f3a"), roughness: 0.12, metalness: 0 });
        const h = w.asset.head;
        const m = new THREE.MeshPhysicalMaterial({ roughness: w.fabric ? 1 : 0.7, metalness: 0, side: h.double_sided || h.transparent || w.fabric ? THREE.DoubleSide : THREE.FrontSide });
        if (w.fabric) {
          const r = w.fabric.repeat;
          m.color.set(w.tint ?? "#ffffff");
          fabricMaps(w.fabric.id).then((fm) => { wearFabric(m, fm, [r, r], w.tint, printNow ? [r, (r * printNow.wMm) / printNow.hMm] : undefined); wake(); draw(); }).catch(() => {});
        } else {
          if (h.textures.diffuseTexture) m.map = texFor(h.textures.diffuseTexture, true);
          if (h.textures.normalmapTexture) m.normalMap = texFor(h.textures.normalmapTexture, false);
          const d = h.diffuse_color; m.color.setRGB(d[0] ?? 1, d[1] ?? 1, d[2] ?? 1);
          if (w.tint) m.color.multiply(new THREE.Color(w.tint));
        }
        if (h.transparent) { m.alphaTest = 0.45; m.transparent = false; }
        return m;
      };
      const rebuildBodyIndex = () => {
        if (!previewGeo || !bodyFaces) return;
        const flags = hiddenFlags([...items.values()].map((i) => i.worn.asset), previewGeo.getAttribute("position").count);
        const key = [...items.keys()].sort().join("|");
        if (key === hiddenKey && hiddenGeo === previewGeo) return;
        hiddenKey = key; hiddenGeo = previewGeo;
        const keep: number[] = [];
        for (let t = 0; t < bodyFaces.length; t += 3) if (!(flags[bodyFaces[t]!] || flags[bodyFaces[t + 1]!] || flags[bodyFaces[t + 2]!])) keep.push(bodyFaces[t]!, bodyFaces[t + 1]!, bodyFaces[t + 2]!);
        previewGeo.setIndex(new THREE.BufferAttribute(previewGeo.getAttribute("position").count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
      };
      const eyeUv = (it: Item) => {
        const p = it.out, n = p.length / 3, uv = it.geo.getAttribute("uv") as InstanceType<typeof THREE.BufferAttribute>;
        for (const side of [-1, 1]) {
          let cx = 0, cy = 0, cz = 0, k = 0, rr = 0;
          for (let i = 0; i < n; i++) if ((p[i * 3]! >= 0 ? 1 : -1) === side) { cx += p[i * 3]!; cy += p[i * 3 + 1]!; cz += p[i * 3 + 2]!; k++; }
          if (!k) continue; cx /= k; cy /= k; cz /= k;
          for (let i = 0; i < n; i++) if ((p[i * 3]! >= 0 ? 1 : -1) === side) rr = Math.max(rr, Math.hypot(p[i * 3]! - cx, p[i * 3 + 1]! - cy, p[i * 3 + 2]! - cz));
          for (let i = 0; i < n; i++) if ((p[i * 3]! >= 0 ? 1 : -1) === side) uv.setXY(i, 0.5 + (p[i * 3]! - cx) / (2 * rr), 0.5 + (p[i * 3 + 2]! - cz) / (2 * rr));
        }
        uv.needsUpdate = true;
      };
      const wearAudit: Record<string, { slot: string; vertices: number; under: number; share: number }> = {};
      (window as unknown as { __wearAudit?: typeof wearAudit }).__wearAudit = wearAudit;    // read by the page checks: how much of each item the binding put under the skin
      const applyWear = () => {
        if (!bodyNowPos || !previewMesh) return;
        const m = motionNow;
        for (const it of items.values()) {
          placeAsset(it.worn.asset, bodyNowPos, it.out, m && m.skin && motionBones ? motionBones : undefined, m && m.skin ? m.skin : undefined);
          // nothing worn on the outside goes under the skin: a vertex below its bound body vertex's surface is lifted back out along the normal
          // (eyes sit in the head by design and are left alone); how many needed it is kept for checking a binding
          const nrm = previewGeo?.getAttribute("normal") as InstanceType<typeof THREE.BufferAttribute> | undefined;
          if (nrm && it.worn.slot !== "eyes" && nrm.count * 3 === bodyNowPos.length) {
            const dom = it.worn.asset.dominant, o = it.out, na = nrm.array as Float32Array, gap = it.worn.slot === "hair" ? 0.003 : 0.0015;
            let under = 0;
            for (let i = 0; i < dom.length; i++) {
              const b = dom[i]! * 3, nx = na[b]!, ny = na[b + 1]!, nz = na[b + 2]!;
              const ex = o[i * 3]! - bodyNowPos[b]!, ey = o[i * 3 + 1]! - bodyNowPos[b + 1]!, ez = o[i * 3 + 2]! - bodyNowPos[b + 2]!;
              if (ex * ex + ey * ey + ez * ez > 0.0009) continue;               // more than 3 cm from its body vertex: hanging free (a skirt between the legs), not inside
              const d = ex * nx + ey * ny + ez * nz;
              if (d < gap) { const k = gap - d; o[i * 3] = o[i * 3]! + k * nx; o[i * 3 + 1] = o[i * 3 + 1]! + k * ny; o[i * 3 + 2] = o[i * 3 + 2]! + k * nz; if (d < -0.002) under++; }
            }
            wearAudit[it.worn.asset.head.id] = { slot: it.worn.slot, vertices: dom.length, under, share: Math.round((1000 * under) / Math.max(1, dom.length)) / 10 };
          }
          const pos = it.geo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>;
          (pos.array as Float32Array).set(it.out); pos.needsUpdate = true;
          if (it.worn.slot === "eyes" && !it.eyeUv) { eyeUv(it); it.eyeUv = true; }
          it.geo.computeVertexNormals();
          if ((it.mesh.material as { anisotropy?: number }).anisotropy) it.geo.computeTangents();
          it.mesh.position.copy(previewMesh.position); it.mesh.rotation.copy(previewMesh.rotation); it.mesh.visible = previewMesh.visible;
        }
      };
      const setWear = (list: Worn[]) => {
        const keep = new Set(list.map((w) => w.slot + ":" + w.asset.head.id + ":" + (w.tint ?? "") + ":" + (w.fabric ? w.fabric.id + w.fabric.repeat : "")));
        for (const [k, it] of [...items]) if (!keep.has(k)) { scene.remove(it.mesh); it.geo.dispose(); (it.mesh.material as InstanceType<typeof THREE.Material>).dispose(); items.delete(k); }
        for (const w of list) {
          const k = w.slot + ":" + w.asset.head.id + ":" + (w.tint ?? "") + ":" + (w.fabric ? w.fabric.id + w.fabric.repeat : "");
          if (items.has(k)) continue;
          // the eyes are bound one to one onto the body's own eyeball vertices: hide the body's eyeballs under them, or the two surfaces fight
          if (w.slot === "eyes" && !w.asset.head.hides.length) w.asset.head.hides = Array.from(new Set(w.asset.bindIdx));
          const geo = new THREE.BufferGeometry(), n = w.asset.head.vertices;
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
          geo.setAttribute("uv", new THREE.BufferAttribute(w.asset.uv, 2));
          geo.setIndex(new THREE.BufferAttribute(w.asset.faces, 1));
          const mesh = new THREE.Mesh(geo as never, materialFor(w));
          mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
          scene.add(mesh);
          items.set(k, { worn: w, mesh, geo, out: new Float32Array(n * 3) });
        }
        rebuildBodyIndex(); applyWear(); resetShadow();
        if (wetNow() > 0) setTimeout(() => setWeatherRef(weatherNowRef()), 50);
        wake(); draw();
      };
      wearHook = () => { rebuildBodyIndex(); applyWear(); };

      let settingFabric = 0;
      const setFabric = async (id: string | null, scale: number) => {
        const mine = ++settingFabric;
        if (!id) {
          fabricOn = false; contact.visible = true; swatch.visible = false; if (previewShown && previewMesh) previewMesh.visible = true; else if (model) model.visible = true;
          wake(); draw(); return;
        }
        const fm = await fabricMaps(id);
        if (dead || mine !== settingFabric) return;
        wearFabric(cloth, fm, [scale, scale * (1.5 / 1.1)], undefined, printNow ? [1100 / printNow.wMm, 1500 / printNow.hMm] : undefined);
        if (fm.aniso && !swatchGeo.getAttribute("tangent")) swatchGeo.computeTangents();
        fabricOn = true; contact.visible = false; swatch.visible = true; if (model) model.visible = false; if (previewMesh) previewMesh.visible = false;
        wake(); draw();
      };

      /* The draped garment: its surface as the simulation left it, the fabric laid on the flat pattern at its true size along each piece's grain, and
         optionally a fit map (how far each part of the cloth is stretched: blue none, green a little, yellow 5 per cent, red 10 per cent or more). */
      let garmentMesh: InstanceType<typeof THREE.Mesh> | null = null;
      /* A garment draped on a moving body: one surface per body frame, played in step with the walk (frame k is the body at k/N of its cycle). */
      let garmentFrames: { all: Float32Array; n: number; count: number; offset: [number, number, number]; shown: number } | null = null;
      const animateGarment = (t: number) => {
        const m = motionNow, g = garmentFrames;
        if (!g || !garmentMesh || !m?.cycle) return;
        // the frames are in the body's own coordinates (offset puts them back), so the garment stands where the moving body is drawn
        if (previewMesh) garmentMesh.position.copy(previewMesh.position);
        const k = Math.floor((((t / m.cycle) % 1) + 1) % 1 * g.count) % g.count;
        if (k === g.shown) return;
        g.shown = k;
        const pos = garmentMesh.geometry.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>, arr = pos.array as Float32Array, base = k * g.n * 3;
        for (let i = 0; i < g.n * 3; i += 3) { arr[i] = g.all[base + i]! + g.offset[0]; arr[i + 1] = g.all[base + i + 1]! + g.offset[1]; arr[i + 2] = g.all[base + i + 2]! + g.offset[2]; }
        pos.needsUpdate = true; garmentMesh.geometry.computeVertexNormals();
      };
      const fitColour = (s: number) => {
        const t = Math.max(0, Math.min(1, s / 0.1));
        const stops = [[0, 0.15, 0.35, 0.85], [0.2, 0.2, 0.75, 0.4], [0.5, 0.95, 0.85, 0.2], [1, 0.85, 0.15, 0.12]] as const;
        for (let k = 1; k < stops.length; k++) if (t <= stops[k]![0]) { const a = stops[k - 1]!, b = stops[k]!, u = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; }
        return [0.85, 0.15, 0.12];
      };
      const setGarment = (g: Draped | null) => {
        if (garmentMesh) { scene.remove(garmentMesh); garmentMesh.geometry.dispose(); (garmentMesh.material as InstanceType<typeof THREE.Material>).dispose(); garmentMesh = null; }
        garmentFrames = null;
        if (!g) { resetShadow(); wake(); draw(); return; }
        const { vertices: n, triangles: nf, layout: L, pieces, grainline_deg } = g.meta, buf = g.data;
        const pos = new Float32Array(buf, L.positions!, n * 3).slice(), mm = new Float32Array(buf, L.uv_mm!, n * 2), piece = new Uint16Array(buf, L.piece!, n);
        const faces = new Uint32Array(buf, L.faces!, nf * 3).slice(), strain = new Float32Array(buf, L.strain!, nf);
        for (let i = 0; i < n; i++) { pos[i * 3] = pos[i * 3]! + g.offset[0]; pos[i * 3 + 1] = pos[i * 3 + 1]! + g.offset[1]; pos[i * 3 + 2] = pos[i * 3 + 2]! + g.offset[2]; }
        const f = fabricOf(g.fabric), tile = f?.optics.tile_mm ?? 150;
        const uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
          const a = ((grainline_deg[pieces[piece[i]!] ?? ""] ?? 0) * Math.PI) / 180, x = mm[i * 2]!, y = mm[i * 2 + 1]!;
          uv[i * 2] = (x * Math.cos(a) + y * Math.sin(a)) / 1000; uv[i * 2 + 1] = (-x * Math.sin(a) + y * Math.cos(a)) / 1000;      // metres of cloth along the grain
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        geo.setIndex(new THREE.BufferAttribute(faces, 1)); geo.computeVertexNormals();
        let material: InstanceType<typeof THREE.Material>;
        if (g.fitMap) {
          const col = new Float32Array(n * 3), cnt = new Float32Array(n);
          for (let t = 0; t < nf; t++) { const c = fitColour(strain[t]!); for (let k = 0; k < 3; k++) { const v2 = faces[t * 3 + k]!; col[v2 * 3] += c[0]!; col[v2 * 3 + 1] += c[1]!; col[v2 * 3 + 2] += c[2]!; cnt[v2] += 1; } }
          for (let i = 0; i < n; i++) if (cnt[i]) { col[i * 3] /= cnt[i]!; col[i * 3 + 1] /= cnt[i]!; col[i * 3 + 2] /= cnt[i]!; }
          geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
          material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
        } else {
          const m = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide, color: g.tint ?? "#ffffff" });
          fabricMaps(g.fabric).then((fm) => { wearFabric(m, fm, [1000 / tile, 1000 / tile], g.tint, printNow ? [1000 / printNow.wMm, 1000 / printNow.hMm] : undefined); if (fm.aniso) geo.computeTangents(); wake(); draw(); }).catch(() => {});
          material = m;
        }
        garmentMesh = new THREE.Mesh(geo as never, material as never);
        garmentMesh.rotation.x = -Math.PI / 2; garmentMesh.castShadow = true; garmentMesh.receiveShadow = true; garmentMesh.frustumCulled = false;
        scene.add(garmentMesh);
        if ((g.meta.frames ?? 0) > 1 && L.frames !== undefined) garmentFrames = { all: new Float32Array(buf, L.frames, g.meta.frames! * n * 3), n, count: g.meta.frames!, offset: g.offset, shown: -1 };
        if (wetNow() > 0) setTimeout(() => setWeatherRef(weatherNowRef()), 50);
        resetShadow(); wake(); draw();
      };

      handle.current = {
        setTone: (hex) => { lastTone = hex; paint(hex); if (skinOn()) repaintRegions(); dressBody(); wake(); draw(); },
        setLook: (l) => { mannequin = l === "mannequin"; paint(lastTone); setBeauty(beautyNow); },
        setBeauty,
        setGarment,
        setWeather,
        setPrint: (p) => {
          const refresh = () => {
            const L = latest.current;
            if (L.fabric) setFabric(L.fabric, L.fabricScale).catch(() => {});
            setGarment(L.garment ?? null);
            setWear([]); setWear(L.wear ?? []);
          };
          if (!p) { printNow = null; refresh(); return; }
          printTile(p).then((t) => { printNow = t; refresh(); }).catch((e) => setFailed(String(e.message ?? e)));
        },
        setIlluminant: (i) => { const g = ILLUMINANTS[i]?.gain ?? [1, 1, 1]; illuminant.value.set(g[0], g[1], g[2]); wake(); draw(); },
        setMotion,
        setWear,
        setQuality: (q) => { useChain = q === "best"; if (lastAim) aim(lastAim.dir, lastAim.color, lastAim.strength); wake(); draw(); },
        setPreview,
        setPlace,
        setFabric,
        setTime,
        setSpin: (on) => { controls.autoRotate = on; wake(); },
        show,
        reset: () => { frame(height); wake(); },
        setView: (part) => {
          if (part === "figure") { frame(height); wake(); return; }
          const at = part === "face" ? 0.935 : part === "torso" ? 0.7 : 0.04, reach = part === "face" ? 0.12 : part === "torso" ? 0.42 : 0.2;
          const d = reach / Math.tan((camera.fov * Math.PI) / 360) * 1.1;
          controls.minDistance = d * 0.5; controls.maxDistance = d * 3;
          controls.target.set(0, height * at, 0); camera.position.set(0, height * at + 0.02, d); controls.update(); wake(); draw();
        },
        dispose: () => {},
      };
      if (snapRef) snapRef.current = () => {
        const off = camera.position.clone().sub(controls.target), dist = off.length() || 1;
        const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
        const a = lastAim;
        const dir = a ? new THREE.Vector3(...a.dir).normalize() : new THREE.Vector3(0.4, 0.5, 0.7).normalize();
        return {
          camera: { yaw_deg: (Math.atan2(off.x, off.z) * 180) / Math.PI, pitch_deg: (Math.asin(Math.max(-1, Math.min(1, off.y / dist))) * 180) / Math.PI, distance_m: dist, fov_deg: (hfov * 180) / Math.PI, target_y_m: controls.target.y },
          sun: { azimuth_deg: (Math.atan2(dir.x, dir.z) * 180) / Math.PI, elevation_deg: (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI, strength: Math.min(20, (a?.strength ?? 2.4) * 1.25), angle_deg: Math.min(30, Math.max(0.05, softDeg)) },
          environment: currentFile, aspect: camera.aspect,
        };
      };
      if (sceneRef) sceneRef.current = async () => {
        if (!bodyNowPos || !bodyFaces) return null;
        const p = bodyNowPos.slice();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
        for (let i = 0; i < p.length; i += 3) { const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; }
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        for (let i = 0; i < p.length; i += 3) { p[i] = p[i]! - cx; p[i + 1] = p[i + 1]! - cy; p[i + 2] = p[i + 2]! - minZ; }
        const items: ArrayBuffer[] = [];
        if ([...itemsOf()].length) {
          const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
          const exporter = new GLTFExporter();
          for (const it of itemsOf()) {
            if (items.length >= 12) break;
            const src = it.out, n = src.length / 3, pos = new Float32Array(src.length);
            for (let i = 0; i < n; i++) { const x = src[i * 3]! - cx, y = src[i * 3 + 1]! - cy, z = src[i * 3 + 2]! - minZ; pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y; }     // model Z up to glTF Y up
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
            g.setAttribute("uv", (it.geo.getAttribute("uv") as InstanceType<typeof THREE.BufferAttribute>).clone());
            g.setIndex(new THREE.BufferAttribute(it.worn.asset.faces.slice(), 1));
            g.computeVertexNormals();
            const mesh = new THREE.Mesh(g as never, it.mesh.material as never); mesh.name = it.worn.asset.head.id;
            const glb = await exporter.parseAsync(mesh as never, { binary: true, maxTextureSize: 1024 });
            items.push(glb as ArrayBuffer);
            g.dispose();
          }
        }
        if (garmentMesh && items.length < 12) {
          // the draped garment is already in the frame the final uses (centred on the body, standing at z = 0): only turn it to glTF's Y up
          const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
          const src = garmentMesh.geometry.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>, n = src.count, pos = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { pos[i * 3] = src.getX(i); pos[i * 3 + 1] = src.getZ(i); pos[i * 3 + 2] = -src.getY(i); }
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", (garmentMesh.geometry.getAttribute("uv") as InstanceType<typeof THREE.BufferAttribute>).clone());
          g.setIndex((garmentMesh.geometry.getIndex() as InstanceType<typeof THREE.BufferAttribute>).clone()); g.computeVertexNormals();
          const mesh = new THREE.Mesh(g as never, garmentMesh.material as never); mesh.name = "garment";
          items.push((await new GLTFExporter().parseAsync(mesh as never, { binary: true, maxTextureSize: 2048 })) as ArrayBuffer);
          g.dispose();
        }
        let skinPng: Blob | null = null;
        if (skinOn() && regions) { repaintRegions(); skinPng = await new Promise<Blob | null>((ok) => paintCanvas.toBlob(ok, "image/png")); }
        return { positions: p, faces: bodyFaces, items, skinPng };
      };
      controls.autoRotate = latest.current.spin;
      setPlace(latest.current.place).catch((e) => setFailed(String(e.message ?? e)));
      if (latest.current.fabric) setFabric(latest.current.fabric, latest.current.fabricScale).catch((e) => setFailed(String(e.message ?? e)));
      if (latest.current.preview) setPreview(latest.current.preview);
      if (latest.current.url) show(latest.current.url).catch((e) => setFailed(String(e.message ?? e)));
      frame(height); draw();

      handle.current.dispose = () => {
        dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis);
        cancelAnimationFrame(timeQueued); controls.dispose(); model?.geometry.dispose(); skin.dispose(); previewGeo?.dispose(); swatchGeo.dispose(); cloth.dispose(); for (const set of textures.values()) for (const t of set) t.dispose(); floor.geometry.dispose(); skyEnv?.dispose(); pmrem.dispose(); renderer.dispose();
        canvas.remove();
      };
    })().catch((e) => { if (!dead) setFailed(String(e?.message ?? e)); });
    return () => { dead = true; handle.current?.dispose(); handle.current = null; };
    // the scene is built once; later changes go through the handle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => { handle.current?.setTone(tone); }, [tone]);
  React.useEffect(() => { handle.current?.setLook(look); }, [look]);
  React.useEffect(() => { handle.current?.setSpin(spin); }, [spin]);
  React.useEffect(() => { handle.current?.setPlace(place).catch((e) => setFailed(String(e.message ?? e))); }, [place, backdrop]);
  React.useEffect(() => { handle.current?.setTime(hour, season); }, [hour, season, latitude]);
  React.useEffect(() => { handle.current?.setQuality(quality); }, [quality]);
  React.useEffect(() => { if (!motion) handle.current?.setPreview(preview); }, [preview, motion]);
  React.useEffect(() => { handle.current?.setMotion(motion); }, [motion]);
  React.useEffect(() => { handle.current?.setWear(wear ?? []); }, [wear]);
  React.useEffect(() => { handle.current?.setView(view); }, [view, viewTick]);
  React.useEffect(() => { handle.current?.setBeauty(beauty); }, [beauty]);
  React.useEffect(() => { handle.current?.setIlluminant(seenUnder); }, [seenUnder]);
  React.useEffect(() => { handle.current?.setGarment(garment ?? null); }, [garment]);
  React.useEffect(() => { handle.current?.setPrint(print ?? null); }, [print]);
  React.useEffect(() => { handle.current?.setWeather(weather); }, [weather]);
  React.useEffect(() => { handle.current?.setFabric(fabric, fabricScale).catch((e) => setFailed(String(e.message ?? e))); }, [fabric, fabricScale]);
  React.useEffect(() => { if (url) handle.current?.show(url).catch((e) => setFailed(String(e.message ?? e))); }, [url]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      {failed ? <p role="alert" className="absolute inset-x-4 top-4 text-xs text-bad">This view could not start on this device ({failed}).</p> : null}
      <ResetButton onClick={() => handle.current?.reset()} />
    </div>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="absolute right-3 top-3 border border-border bg-background/80 px-2.5 py-1 text-xs hover:bg-background">
      Reset view
    </button>
  );
}
