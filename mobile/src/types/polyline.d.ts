declare module '@mapbox/polyline' {
    export function decode(encoded: string): [number, number][];
    export function encode(coordinates: [number, number][]): string;
}
