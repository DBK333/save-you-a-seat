import { describe, expect, it } from "vitest";
import {
  availableSlots,
  bookingStart,
  distanceMeters,
  filterFacilities,
  formatLocal,
  melbourneDate,
  roomSlotSummary,
  walkingUrl,
} from "./rules";
import type { Booking, Facility } from "./types";

const toilet: Facility = {
  id: "test-toilet",
  countryCode: "AU",
  area: "cremorne",
  name: "Garden toilet",
  type: "toilet",
  address: "Cremorne",
  description: "Sample",
  location: { lat: -37.83, lng: 144.99 },
  entranceLocation: { lat: -37.8302, lng: 144.9902 },
  access: "Public",
  floor: "Ground",
  amenities: ["Accessible", "Baby changing"],
  hours: { open: 8, close: 18 },
  image: "",
  sample: true,
};
const room: Facility = {
  ...toilet,
  id: "test-room",
  name: "Meeting studio",
  type: "meeting_room",
  capacity: 8,
  amenities: ["Accessible", "Whiteboard", "Screen"],
};
const now = new Date("2026-09-29T00:00:00Z"); // 10am Melbourne

describe("discovery and external walking directions", () => {
  it.each([
    ["missing country", { ...toilet, countryCode: undefined }],
    ["foreign country", { ...toilet, countryCode: "NZ" }],
    ["unsupported area", { ...toilet, area: "parkville" }],
    [
      "outside Cremorne",
      { ...toilet, location: { lat: -37.7983, lng: 144.961 } },
    ],
    ["nonfinite location", { ...toilet, location: { lat: NaN, lng: 144.99 } }],
    [
      "outside entrance",
      { ...toilet, entranceLocation: { lat: -33.86, lng: 151.21 } },
    ],
    ["missing location", { ...toilet, location: undefined }],
    ["missing amenities", { ...toilet, amenities: undefined }],
    ["malformed amenities", { ...toilet, amenities: [false] }],
    ["invalid hours", { ...toilet, hours: { open: 20, close: 8 } }],
    ["missing name", { ...toilet, name: undefined }],
    ["nonfinite capacity", { ...room, capacity: Infinity }],
    ["null entry", null],
  ])(
    "excludes %s from discovery without failing the valid results",
    (_label, value) => {
      const search = () =>
        filterFacilities([toilet, value as Facility], {}, now);
      expect(search).not.toThrow();
      expect(search()).toEqual([toilet]);
    },
  );
  it("combines category, search, accessibility, capacity, and equipment filters", () => {
    expect(
      filterFacilities(
        [toilet, room],
        {
          type: "meeting_room",
          query: "STUDIO",
          accessible: true,
          capacity: 6,
          equipment: "whiteboard",
        },
        now,
      ),
    ).toEqual([room]);
    expect(filterFacilities([toilet, room], { capacity: 10 }, now)).toEqual([]);
  });
  it("checks open-now using Melbourne local time and exclusive closing time", () => {
    expect(
      filterFacilities(
        [toilet],
        { openNow: true },
        new Date("2026-09-29T08:00:00Z"),
      ),
    ).toEqual([]);
    expect(filterFacilities([toilet], { openNow: true }, now)).toEqual([
      toilet,
    ]);
  });
  it("measures geographic proximity and handles identical points", () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111195,
      -1,
    );
    expect(distanceMeters(toilet.location, toilet.location)).toBe(0);
  });
  it("opens walking directions targeting the entrance and optional origin", () => {
    const url = new URL(walkingUrl(toilet, { lat: -37.82, lng: 144.98 }));
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("destination")).toBe("-37.8302,144.9902");
    expect(url.searchParams.get("origin")).toBe("-37.82,144.98");
    expect(url.searchParams.get("travelmode")).toBe("walking");
    const fallback = { ...toilet, entranceLocation: undefined };
    expect(new URL(walkingUrl(fallback)).searchParams.get("destination")).toBe(
      "-37.83,144.99",
    );
    expect(new URL(walkingUrl(fallback)).searchParams.has("origin")).toBe(
      false,
    );
  });
});

describe("remaining local demo room-slot summaries", () => {
  const reservation = (
    start: string,
    end: string,
    overrides: Partial<Booking> = {},
  ): Booking => ({
    id: "summary-booking",
    facilityId: room.id,
    userId: "user-alex",
    start,
    end,
    status: "confirmed",
    requestId: "summary-request",
    createdAt: now.toISOString(),
    ...overrides,
  });

  it("counts future half-hours only and finds the next available start", () => {
    const bookings = [
      reservation("2026-09-29T01:00:00Z", "2026-09-29T02:00:00Z"),
    ];
    expect(roomSlotSummary(room, "2026-09-29", bookings, now)).toEqual({
      available: 13,
      reserved: 2,
      total: 15,
      nextStart: "2026-09-29T00:30:00.000Z",
    });
  });

  it("excludes elapsed starts entirely instead of counting them as reserved", () => {
    expect(
      roomSlotSummary(room, "2026-09-29", [], new Date("2026-09-29T07:00:00Z")),
    ).toEqual({
      available: 1,
      reserved: 0,
      total: 1,
      nextStart: "2026-09-29T07:30:00.000Z",
    });
    expect(
      roomSlotSummary(room, "2026-09-29", [], new Date("2026-09-29T08:00:00Z")),
    ).toEqual({
      available: 0,
      reserved: 0,
      total: 0,
      nextStart: null,
    });
  });

  it("ignores cancelled reservations and reservations for other rooms", () => {
    const bookings = [
      reservation("2026-09-29T00:30:00Z", "2026-09-29T01:30:00Z", {
        status: "cancelled",
      }),
      reservation("2026-09-29T00:30:00Z", "2026-09-29T01:30:00Z", {
        facilityId: "another-room",
      }),
    ];
    expect(roomSlotSummary(room, "2026-09-29", bookings, now)).toEqual({
      available: 15,
      reserved: 0,
      total: 15,
      nextStart: "2026-09-29T00:30:00.000Z",
    });
  });

  it("counts occupied blocks once and leaves the adjacent start available", () => {
    const booking = reservation("2026-09-29T00:30:00Z", "2026-09-29T01:30:00Z");
    expect(
      roomSlotSummary(
        room,
        "2026-09-29",
        [booking, { ...booking, id: "duplicate-interval" }],
        now,
      ),
    ).toEqual({
      available: 13,
      reserved: 2,
      total: 15,
      nextStart: "2026-09-29T01:30:00.000Z",
    });
  });

  it("returns no next start when every remaining slot is reserved", () => {
    const bookings = [
      reservation("2026-09-29T00:30:00Z", "2026-09-29T08:00:00Z"),
    ];
    expect(roomSlotSummary(room, "2026-09-29", bookings, now)).toEqual({
      available: 0,
      reserved: 15,
      total: 15,
      nextStart: null,
    });
  });

  it("uses Melbourne daylight-saving time for a future date", () => {
    expect(roomSlotSummary(room, "2026-10-05", [], now)).toEqual({
      available: 20,
      reserved: 0,
      total: 20,
      nextStart: "2026-10-04T21:00:00.000Z",
    });
  });

  it.each(["2026-09-28", "2026-10-14", "2026-02-30", "invalid"])(
    "returns zeros for an unsupported date %s",
    (date) => {
      expect(roomSlotSummary(room, date, [], now)).toEqual({
        available: 0,
        reserved: 0,
        total: 0,
        nextStart: null,
      });
    },
  );

  it("returns zeros for toilets and missing facilities", () => {
    for (const facility of [toilet, null, undefined]) {
      expect(roomSlotSummary(facility, "2026-09-29", [], now)).toEqual({
        available: 0,
        reserved: 0,
        total: 0,
        nextStart: null,
      });
    }
  });
});

describe("Melbourne calendar and availability", () => {
  it("uses the local calendar date at a UTC day boundary", () => {
    expect(melbourneDate(new Date("2026-09-29T15:00:00Z"))).toBe("2026-09-30");
  });
  it("converts standard and daylight local times to UTC", () => {
    expect(bookingStart("2026-09-30", "10:00")).toBe(
      "2026-09-30T00:00:00.000Z",
    );
    expect(bookingStart("2026-10-05", "10:00")).toBe(
      "2026-10-04T23:00:00.000Z",
    );
  });
  it("rejects nonexistent or ambiguous daylight-saving times and invalid dates", () => {
    expect(() => bookingStart("2026-10-04", "02:30")).toThrow();
    expect(() => bookingStart("2026-04-05", "02:30")).toThrow();
    expect(() => bookingStart("2026-02-30", "10:00")).toThrow();
  });
  it("formats UTC dates as Melbourne local time", () => {
    expect(formatLocal("2026-09-30T00:00:00.000Z")).toContain("10:00");
    expect(formatLocal("2026-10-04T23:00:00.000Z")).toContain("10:00");
  });
  it("returns half-hour openings, disallows past slots, and leaves cancelled slots free", () => {
    const bookings: Booking[] = [
      {
        id: "b1",
        facilityId: room.id,
        userId: "user-alex",
        start: "2026-09-29T01:00:00.000Z",
        end: "2026-09-29T02:00:00.000Z",
        status: "confirmed",
        requestId: "r1",
        createdAt: now.toISOString(),
      },
    ];
    const slots = availableSlots(room, "2026-09-29", bookings, now);
    expect(slots).toHaveLength(20);
    expect(
      slots.find((slot) => slot.start === "2026-09-28T23:30:00.000Z")
        ?.available,
    ).toBe(false);
    expect(
      slots.find((slot) => slot.start === "2026-09-29T00:30:00.000Z")
        ?.available,
    ).toBe(true);
    expect(
      slots.find((slot) => slot.start === bookings[0].start)?.available,
    ).toBe(false);
    expect(
      availableSlots(
        room,
        "2026-09-29",
        [{ ...bookings[0], status: "cancelled" }],
        now,
      ).find((slot) => slot.start === bookings[0].start)?.available,
    ).toBe(true);
  });
  it("exposes no booking slots for toilets or outside the next fourteen local dates", () => {
    expect(availableSlots(toilet, "2026-09-30", [], now)).toEqual([]);
    expect(availableSlots(room, "2026-10-14", [], now)).toEqual([]);
    expect(availableSlots(room, "2026-09-28", [], now)).toEqual([]);
  });
});
