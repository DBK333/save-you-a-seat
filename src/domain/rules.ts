import { Temporal } from "@js-temporal/polyfill";
import type { Booking, Coordinates, Facility, FacilityFilters } from "./types";
import { CREMORNE_BOUNDS } from "./coverage";

export const TIME_ZONE = "Australia/Melbourne";
const HALF_HOUR = 30 * 60_000;

function inCatalogBounds(coordinates: Coordinates): boolean {
  return (
    !!coordinates &&
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lat >= CREMORNE_BOUNDS.south &&
    coordinates.lat <= CREMORNE_BOUNDS.north &&
    coordinates.lng >= CREMORNE_BOUNDS.west &&
    coordinates.lng <= CREMORNE_BOUNDS.east
  );
}

/** Reject unsupported or malformed catalog data before search or availability.
 * Official external booking providers are not local sample Facility records. */
function supportedFacility(value: unknown): value is Facility {
  if (!value || typeof value !== "object") return false;
  const facility = value as Facility;
  return (
    facility.countryCode === "AU" &&
    facility.area === "cremorne" &&
    ["toilet", "meeting_room"].includes(facility.type) &&
    [
      facility.id,
      facility.name,
      facility.address,
      facility.description,
      facility.access,
      facility.floor,
      facility.image,
    ].every((field) => typeof field === "string") &&
    typeof facility.sample === "boolean" &&
    inCatalogBounds(facility.location) &&
    (facility.entranceLocation === undefined ||
      inCatalogBounds(facility.entranceLocation)) &&
    Array.isArray(facility.amenities) &&
    facility.amenities.every((amenity) => typeof amenity === "string") &&
    !!facility.hours &&
    Number.isInteger(facility.hours.open) &&
    Number.isInteger(facility.hours.close) &&
    facility.hours.open >= 0 &&
    facility.hours.open < facility.hours.close &&
    facility.hours.close <= 24 &&
    (facility.capacity === undefined ||
      (Number.isInteger(facility.capacity) && facility.capacity > 0))
  );
}

export function distanceMeters(
  origin: Coordinates,
  destination: Coordinates,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(destination.lat - origin.lat);
  const dLng = radians(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(origin.lat)) *
      Math.cos(radians(destination.lat)) *
      Math.sin(dLng / 2) ** 2;
  return (
    6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  );
}

export function filterFacilities(
  list: Facility[],
  filters: FacilityFilters,
  now = new Date(),
): Facility[] {
  const current = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(
    TIME_ZONE,
  );
  const hour = current.hour + current.minute / 60;
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return list.filter((facility) => {
    if (!supportedFacility(facility)) return false;
    const amenities = facility.amenities.map((amenity) =>
      amenity.toLocaleLowerCase(),
    );
    return (
      (!filters.type ||
        filters.type === "all" ||
        facility.type === filters.type) &&
      (!query ||
        `${facility.name} ${facility.address} ${facility.description} ${facility.amenities.join(" ")}`
          .toLocaleLowerCase()
          .includes(query)) &&
      (!filters.accessible || amenities.includes("accessible")) &&
      (!filters.capacity || (facility.capacity ?? 0) >= filters.capacity) &&
      (!filters.equipment ||
        amenities.some((amenity) =>
          amenity.includes(filters.equipment!.toLocaleLowerCase()),
        )) &&
      (!filters.openNow ||
        (hour >= facility.hours.open && hour < facility.hours.close))
    );
  });
}

export function walkingUrl(facility: Facility, origin?: Coordinates): string {
  const destination = facility.entranceLocation ?? facility.location;
  const query = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "walking",
  });
  if (origin) query.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${query}`;
}

export function melbourneDate(now = new Date()): string {
  return Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(TIME_ZONE)
    .toPlainDate()
    .toString();
}

export function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Reject DST folds/gaps instead of silently changing the user's selected time. */
export function bookingStart(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Choose a valid date and time.");
  const local = Temporal.PlainDateTime.from(`${date}T${time}`, {
    overflow: "reject",
  });
  return new Date(
    local.toZonedDateTime(TIME_ZONE, { disambiguation: "reject" })
      .epochMilliseconds,
  ).toISOString();
}

export function withinBookingHorizon(date: string, now = new Date()): boolean {
  try {
    const day = Temporal.PlainDate.from(date, { overflow: "reject" });
    const today = Temporal.PlainDate.from(melbourneDate(now));
    return (
      Temporal.PlainDate.compare(day, today) >= 0 &&
      Temporal.PlainDate.compare(day, today.add({ days: 14 })) <= 0
    );
  } catch {
    return false;
  }
}

export function availableSlots(
  facility: Facility,
  date: string,
  bookings: Booking[],
  now = new Date(),
): { start: string; label: string; available: boolean }[] {
  if (
    !supportedFacility(facility) ||
    facility.type !== "meeting_room" ||
    !withinBookingHorizon(date, now)
  )
    return [];
  const result: { start: string; label: string; available: boolean }[] = [];
  for (
    let minute = facility.hours.open * 60;
    minute + 30 <= facility.hours.close * 60;
    minute += 30
  ) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    let start: string;
    try {
      start = bookingStart(date, time);
    } catch {
      continue;
    }
    const startMs = Date.parse(start);
    const endMs = startMs + HALF_HOUR;
    const occupied = bookings.some(
      (booking) =>
        booking.facilityId === facility.id &&
        booking.status === "confirmed" &&
        Date.parse(booking.start) < endMs &&
        Date.parse(booking.end) > startMs,
    );
    result.push({
      start,
      label: new Intl.DateTimeFormat("en-AU", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(start)),
      available: startMs > now.getTime() && !occupied,
    });
  }
  return result;
}

/** Browser-local remaining half-hour summary; never a live occupancy claim. */
export function roomSlotSummary(
  facility: Facility | null | undefined,
  date: string,
  bookings: Booking[],
  now = new Date(),
): {
  available: number;
  reserved: number;
  total: number;
  nextStart: string | null;
} {
  if (!supportedFacility(facility)) {
    return { available: 0, reserved: 0, total: 0, nextStart: null };
  }
  const remaining = availableSlots(facility, date, bookings, now).filter(
    (slot) => Date.parse(slot.start) > now.getTime(),
  );
  const available = remaining.filter((slot) => slot.available);
  return {
    available: available.length,
    reserved: remaining.length - available.length,
    total: remaining.length,
    nextStart: available[0]?.start ?? null,
  };
}
