import type { Coordinates } from "./types";

/** Viewport limits only; a rectangle is not an Australian country boundary. */
export const AUSTRALIA_MAP_BOUNDS = {
  north: -10,
  south: -44,
  west: 112,
  east: 154,
} as const;

/** Supported catalog coordinates for the current Cremorne demonstration. */
export const CREMORNE_BOUNDS = {
  north: -37.8235,
  south: -37.8343,
  west: 144.9878,
  east: 145.0035,
} as const;

/** Local Melbourne origin coverage, enclosing Cremorne and UniMelb.
 * This is a product support window, not a national country geofence. */
export const SUPPORTED_ORIGIN_BOUNDS = {
  north: -37.78,
  south: -37.85,
  west: 144.94,
  east: 145.02,
} as const;

export function isSupportedOrigin(coordinates: Coordinates): boolean {
  return (
    !!coordinates &&
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lat >= SUPPORTED_ORIGIN_BOUNDS.south &&
    coordinates.lat <= SUPPORTED_ORIGIN_BOUNDS.north &&
    coordinates.lng >= SUPPORTED_ORIGIN_BOUNDS.west &&
    coordinates.lng <= SUPPORTED_ORIGIN_BOUNDS.east
  );
}
