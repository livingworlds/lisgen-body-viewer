/**
 * The places a garment can be seen in. Each is a lighting setup: a studio, an open sky whose sun follows the hour and the season, or a
 * photographed environment (CC0, Poly Haven) that lights the body the way that place would. The sun for a photographed place is the
 * brightest point of the photograph, recorded here once; for the open sky it is computed from the hour, the day of the year and a latitude.
 */
export type Place = {
    id: string;
    label: string;
    group: "Studio" | "Outdoors" | "Nature" | "Yours";
    kind: "room" | "sky" | "photo" | "image";
    file?: string;
    sun?: {
        u: number;
        v: number;
    };
    sunStrength?: number;
    soft?: number;
    exposure: number;
};
export declare const PLACES: Place[];
export declare const CUSTOM_PLACE: Place;
export declare const placeOf: (id: string) => Place;
export declare const SEASONS: readonly [{
    readonly id: "winter";
    readonly label: "Winter";
    readonly day: 355;
}, {
    readonly id: "spring";
    readonly label: "Spring";
    readonly day: 80;
}, {
    readonly id: "summer";
    readonly label: "Summer";
    readonly day: 172;
}, {
    readonly id: "autumn";
    readonly label: "Autumn";
    readonly day: 266;
}];
export type Season = (typeof SEASONS)[number]["id"];
/**
 * Where the sun is at an hour of the day (local solar time), a day of the year and a latitude (degrees, north positive; the caller's place, there is no
 * default), in the scene's axes: north is -z, east is +x, up is +y.
 */
export declare function sunAt(hour: number, dayOfYear: number, latitudeDeg: number): {
    elevationDeg: number;
    azimuthDeg: number;
    dir: [number, number, number];
};
/** The colour and strength of sunlight at an elevation: warm and weak near the horizon, white and strong high up, none below it. */
export declare function sunLight(elevationDeg: number): {
    color: number;
    strength: number;
};
/** Where a photographed sun is, as a direction. */
export declare function photoSun(sun: {
    u: number;
    v: number;
}): [number, number, number];
export declare const hourLabel: (h: number) => string;
/** Where a place's photograph is, under the folder the host serves this package's `assets` from. */
export declare const placeFile: (assetBase: string, p: Place, kind?: "hdr" | "jpg") => string | null;
