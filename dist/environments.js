/**
 * The places a garment can be seen in. Each is a lighting setup: a studio, an open sky whose sun follows the hour and the season, or a
 * photographed environment (CC0, Poly Haven) that lights the body the way that place would. The sun for a photographed place is the
 * brightest point of the photograph, recorded here once; for the open sky it is computed from the hour, the day of the year and a latitude.
 */
export const PLACES = [
    { id: "studio", label: "Studio", group: "Studio", kind: "room", soft: 9, exposure: 0.7 },
    { id: "softbox", label: "Soft box", group: "Studio", kind: "photo", file: "softbox", sun: { u: 0.277, v: 0.583 }, sunStrength: 0.8, soft: 10, exposure: 0.68 },
    { id: "sky", label: "Open sky", group: "Outdoors", kind: "sky", soft: 1.2, exposure: 0.12 },
    { id: "clear", label: "Golden hour", group: "Outdoors", kind: "photo", file: "clear", sun: { u: 0.6, v: 0.504 }, sunStrength: 1, soft: 1.6, exposure: 0.53 },
    { id: "partly-cloudy", label: "Partly cloudy", group: "Outdoors", kind: "photo", file: "partly-cloudy", sun: { u: 0.595, v: 0.766 }, sunStrength: 0.9, soft: 2.2, exposure: 0.53 },
    { id: "overcast", label: "Overcast", group: "Outdoors", kind: "photo", file: "overcast", sun: { u: 0.477, v: 0.699 }, sunStrength: 0.15, soft: 22, exposure: 0.64 },
    { id: "dawn", label: "Dawn", group: "Outdoors", kind: "photo", file: "dawn", sun: { u: 0.635, v: 0.524 }, sunStrength: 0.9, soft: 2.0, exposure: 0.59 },
    { id: "sunset", label: "City sunset", group: "Outdoors", kind: "photo", file: "sunset", sun: { u: 0.626, v: 0.543 }, sunStrength: 0.9, soft: 2.0, exposure: 0.59 },
    { id: "meadow", label: "Meadow", group: "Nature", kind: "photo", file: "meadow", sun: { u: 0.6, v: 0.65 }, sunStrength: 0.9, soft: 1.6, exposure: 0.53 },
    { id: "forest", label: "Forest slope", group: "Nature", kind: "photo", file: "forest_slope", sun: { u: 0.603, v: 0.726 }, sunStrength: 0.7, soft: 5, exposure: 0.59 },
];
export const CUSTOM_PLACE = { id: "custom", label: "Your picture", group: "Yours", kind: "image", soft: 6, exposure: 0.7 };
export const placeOf = (id) => (id === "custom" ? CUSTOM_PLACE : PLACES.find((p) => p.id === id) ?? PLACES[0]);
export const SEASONS = [
    { id: "winter", label: "Winter", day: 355 },
    { id: "spring", label: "Spring", day: 80 },
    { id: "summer", label: "Summer", day: 172 },
    { id: "autumn", label: "Autumn", day: 266 },
];
const rad = Math.PI / 180;
/**
 * Where the sun is at an hour of the day (local solar time), a day of the year and a latitude (degrees, north positive; the caller's place, there is no
 * default), in the scene's axes: north is -z, east is +x, up is +y.
 */
export function sunAt(hour, dayOfYear, latitudeDeg) {
    const decl = -23.44 * rad * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
    const lat = latitudeDeg * rad;
    const H = 15 * rad * (hour - 12);
    const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
    const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
    const cosAz = (Math.sin(decl) - sinEl * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat) || 1e-9);
    let az = Math.acos(Math.max(-1, Math.min(1, cosAz))); // from north, towards east
    if (H > 0)
        az = 2 * Math.PI - az;
    const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
    return { elevationDeg: el / rad, azimuthDeg: az / rad, dir };
}
/** The colour and strength of sunlight at an elevation: warm and weak near the horizon, white and strong high up, none below it. */
export function sunLight(elevationDeg) {
    if (elevationDeg <= -1)
        return { color: 0x000000, strength: 0 };
    const e = Math.max(elevationDeg, 0);
    const strength = Math.min(1, Math.sqrt(e / 35)) * (elevationDeg < 0 ? 0 : 1);
    const t = Math.min(1, e / 30); // 0 at the horizon, 1 from 30 degrees up
    const mix = (a, b) => Math.round(a + (b - a) * t);
    const color = (mix(255, 255) << 16) | (mix(150, 244) << 8) | mix(80, 232);
    return { color, strength };
}
/** Where a photographed sun is, as a direction. */
export function photoSun(sun) {
    const az = (sun.u - 0.5) * 2 * Math.PI;
    const el = (sun.v - 0.5) * Math.PI;
    return [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
}
export const hourLabel = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
/** Where a place's photograph is, under the folder the host serves this package's `assets` from. */
export const placeFile = (assetBase, p, kind = "hdr") => (p.file ? `${assetBase.replace(/\/+$/, "")}/env/${p.file}.${kind}` : null);
