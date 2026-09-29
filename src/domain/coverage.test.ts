import { describe, expect, it } from "vitest";
import type { Coordinates } from "./types";
import {
  AUSTRALIA_MAP_BOUNDS,
  CREMORNE_BOUNDS,
  SUPPORTED_ORIGIN_BOUNDS,
  isSupportedOrigin,
} from "./coverage";

describe("local origin coverage", () => {
  it("accepts Cremorne and UniMelb origins within the local support window", () => {
    expect(isSupportedOrigin({ lat: -37.83, lng: 144.995 })).toBe(true);
    expect(isSupportedOrigin({ lat: -37.7983, lng: 144.961 })).toBe(true);
  });

  it("includes the documented edges of the supported origin rectangle", () => {
    expect(
      isSupportedOrigin({
        lat: SUPPORTED_ORIGIN_BOUNDS.north,
        lng: SUPPORTED_ORIGIN_BOUNDS.west,
      }),
    ).toBe(true);
    expect(
      isSupportedOrigin({
        lat: SUPPORTED_ORIGIN_BOUNDS.south,
        lng: SUPPORTED_ORIGIN_BOUNDS.east,
      }),
    ).toBe(true);
  });

  it("does not treat a national map viewport as local product coverage", () => {
    expect(AUSTRALIA_MAP_BOUNDS.north).toBeGreaterThan(CREMORNE_BOUNDS.north);
    expect(AUSTRALIA_MAP_BOUNDS.west).toBeLessThan(CREMORNE_BOUNDS.west);
    expect(isSupportedOrigin({ lat: -33.8688, lng: 151.2093 })).toBe(false); // Sydney
    expect(isSupportedOrigin({ lat: -37.77, lng: 144.96 })).toBe(false);
    expect(isSupportedOrigin({ lat: -37.83, lng: 145.03 })).toBe(false);
  });

  it.each([
    null,
    undefined,
    {},
    { lat: -37.83 },
    { lat: "-37.83", lng: 144.99 },
    { lat: NaN, lng: 144.99 },
    { lat: -37.83, lng: Infinity },
  ])("rejects malformed origin %j without throwing", (value) => {
    expect(() => isSupportedOrigin(value as Coordinates)).not.toThrow();
    expect(isSupportedOrigin(value as Coordinates)).toBe(false);
  });
});
