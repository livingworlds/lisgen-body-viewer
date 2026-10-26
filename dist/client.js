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
export class BodyServiceError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "BodyServiceError";
    }
}
/** A packed array from the service, as a typed array over its own copy of the bytes. */
export function unpack(p) {
    const bin = atob(p.base64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    const n = p.shape.reduce((a, b) => a * b, 1), buf = bytes.buffer;
    const view = p.dtype === "float32" ? new Float32Array(buf, 0, n) : p.dtype === "uint32" ? new Uint32Array(buf, 0, n) : p.dtype === "uint16" ? new Uint16Array(buf, 0, n)
        : p.dtype === "int16" ? new Int16Array(buf, 0, n) : p.dtype === "uint8" ? new Uint8Array(buf, 0, n) : null;
    if (!view)
        throw new BodyServiceError(`unknown array type ${p.dtype}`, 0);
    return view;
}
export function createBodyService(options) {
    const base = options.endpoint.replace(/\/+$/, "");
    if (!base)
        throw new BodyServiceError("the body service needs an endpoint", 0);
    const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    const topologies = new Map();
    const headers = async (json) => {
        const h = json ? { "content-type": "application/json" } : {};
        const t = typeof options.token === "function" ? await options.token() : options.token;
        if (t)
            h.authorization = `Bearer ${t}`;
        return h;
    };
    const call = async (path, body) => {
        const res = await doFetch(`${base}/${path}`, body === undefined
            ? { method: "GET", headers: await headers(false) }
            : { method: "POST", headers: await headers(true), body: JSON.stringify(body) });
        if (!res.ok) {
            let msg = `${res.status}`;
            try {
                const j = (await res.json());
                if (j.error)
                    msg = j.error;
            }
            catch { /* not JSON */ }
            throw new BodyServiceError(`body service: ${msg}`, res.status);
        }
        return res;
    };
    const json = async (path, body) => (await (await call(path, body)).json());
    return {
        endpoint: base,
        info: () => json("info"),
        topology(sex) {
            let p = topologies.get(sex);
            if (!p) {
                p = json(`topology?sex=${sex}`)
                    .then((t) => ({
                    version: t.version, sex: t.sex, vertices: t.vertices, triangles: t.triangles, rig: t.rig,
                    faces: unpack(t.faces), uv: unpack(t.uv),
                    skin: { influences: t.skin.influences, index: unpack(t.skin.index), weight: unpack(t.skin.weight) },
                }));
                p.catch(() => topologies.delete(sex));
                topologies.set(sex, p);
            }
            return p;
        },
        async body(req) {
            const r = await json("body", req);
            return { ...r, vertices: unpack(r.vertices), joints: unpack(r.joints) };
        },
        async frames(req) {
            const r = await json("frames", req);
            return { ...r, positions: unpack(r.positions) };
        },
        bytes: async (path) => (await call(path)).arrayBuffer(),
        blob: async (path) => (await call(path)).blob(),
        json: (path) => json(path),
    };
}
