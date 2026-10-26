# Lisgen body viewer

A browser viewer for a human body and fabric: a React component that draws a body or a fabric swatch with three.js WebGPU (WebGL2 fallback), with real lighting, shadows, ambient occlusion, environments, poses, expressions and worn items. Apache-2.0.

The body itself comes from a body service: the viewer sends controls or measurements, an age, and shape and expression weights, and gets the surface back in milliseconds. No body model ships in this package.

## Install

```
npm install github:livingworlds/lisgen-body-viewer#v0.1.0
```

`dist/` holds plain ES modules with type declarations, built from `src/`, so no build step is needed. `react` (18 or later) and `three` (0.186.1) are peer dependencies, needed only for `viewport`.

| Import | What it gives |
|---|---|
| `@lisgen/body-viewer` (also `/client`) | `createBodyService`: the body service client |
| `@lisgen/body-viewer/poses` | standing, sitting, walking, running, hands, ageing posture; linear blend skinning (`posed`) and the rig from the service (`rigFrom`) |
| `@lisgen/body-viewer/environments` | a studio, a physical sky with the sun for any hour, season and latitude, photographed places |
| `@lisgen/body-viewer/fabrics` | photographed and built cloth surfaces with their optics, and weave maps |
| `@lisgen/body-viewer/expressions` | the 52 facial action names and ready expressions |
| `@lisgen/body-viewer/assets` | worn items: loading them from the service and placing them on a body |
| `@lisgen/body-viewer/viewport` | the `Viewport` React component |

## Static files

Environments and fabrics are files under `assets/` (`env/*.hdr`, `env/*.jpg`, `fabric/*.jpg`). Serve that folder from your app, for example by copying `node_modules/@lisgen/body-viewer/assets` into your public folder as `/body-viewer`, and pass its URL as `assetBase` (the default is `/body-viewer`).

## The body service

```ts
import { createBodyService } from "@lisgen/body-viewer";

const body = createBodyService({
  endpoint: "https://<your body service>/body/v1",
  token: () => getTokenFromYourBackend(),       // sent as Authorization: Bearer <token>
});
const b = await body.body({ sex: "female", age_years: 34, measurements: { height_cm: 168, bust_cm: 92, waist_cm: 74, hip_cm: 100 } });
// b.vertices: Float32Array, 3 a vertex, metres, Z up; b.joints; b.controls; b.measurements; b.fit.error_cm
```

The token is your app's credential for the service. To keep it off the browser, point `endpoint` at a route of your own backend that adds it and forwards the call, and give no token.

| Call | Request | Response |
|---|---|---|
| `GET info` | | version, sexes, control ranges, age range in years, shape and expression names, `max_frames` |
| `GET topology?sex=female\|male` | | `vertices`, `triangles`, `faces`, `uv`, `skin` (influences, index, weight), `rig` (labels, parents) |
| `POST body` | `sex`, then `measurements` {height_cm, bust_cm, waist_cm, hip_cm} or `controls` {height, weight, bust, waist, hip, age}, `age_years`, `shape` and `expression` weights, `tolerance_cm` | `controls`, `age_years`, `measurements`, `fit` {error_cm, weight_searched} or null, `vertices`, `joints`, `ms` |
| `POST frames` | a body request plus `frames`: a list of joint turns, one per frame, as `poses` makes them (`deltasFor`, `handDeltas`, `mergeDeltas`) | `frames`, `vertices`, `positions` (frames x vertices x 3), `ms` |
| `GET files/uv.bin`, `files/regions.png`, `files/regions2.png` | | the body's texture coordinates and region masks |
| `GET wardrobe/index.json`, `wardrobe/<id>.json`, `.bin`, textures | | worn items bound to the body |

Arrays travel as `{ dtype, shape, base64 }`, little-endian; the client turns them into typed arrays. A refusal answers `{ error }` with a 4xx status and the client throws a `BodyServiceError`.

## The viewport

```tsx
import { Viewport } from "@lisgen/body-viewer/viewport";

<Viewport body={body} assetBase="/body-viewer" latitude={48.1} preview={{ positions: b.vertices, faces: topo.faces, version: 1 }} ... />
```

`latitude` (degrees, north positive) is where the open sky is seen from; there is no default place. Pose and stride playback come in through `motion`: a frame function that bends the body with `posed` from `poses`, or plays frames from the service's `frames` call.

## Tests

`npm test` builds `dist` (TypeScript from your `node_modules` or `TYPESCRIPT_PATH`), type-checks every module except the viewport in strict mode, and runs `test/*.test.ts` with node's test runner against `dist`.

## Limits

Bodies and poses here are for seeing how clothing reads. A body from measurements is an estimate, not a scan; poses are joint angles of ordinary movement, not captured from a person; fabric images show how a cloth looks, not how it hangs or stretches.
