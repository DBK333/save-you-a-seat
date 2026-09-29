import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Coordinates } from "../src/domain/types";
import { facilities, initialGuides } from "../src/data/fixtures";
import { service } from "../src/services";
import Explore from "../src/components/Explore";

vi.mock("../src/services", async () => {
  const { DemoService } = await import("../src/services/demo");
  return { service: new DemoService({ storage: null }) };
});
vi.mock("../src/components/MapCanvas", () => ({ default: () => null }));

const facility = facilities.find((item) => item.id === "toilet-01")!;
const seedGuide = initialGuides.find(
  (guide) => guide.facilityId === facility.id,
)!;
const publishedEntrance = { lat: -37.82571, lng: 144.99366 };
const pendingEntrance = { lat: -37.8259, lng: 144.9939 };
const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation",
);

function revision(entranceLocation: Coordinates) {
  service.login("user-alex");
  const draft = service.saveDraft({
    facilityId: facility.id,
    guideId: seedGuide.guideId,
    title: "The updated entrance",
    steps: seedGuide.steps.map((step) => ({ ...step })),
    entranceLocation,
  });
  return service.submitGuide(draft.id);
}
function publishEntrance() {
  const version = revision(publishedEntrance);
  service.login("user-jamie");
  service.confirmGuide(version.id);
  service.login("user-sam");
  service.confirmGuide(version.id);
  service.logout();
}
function renderDetails() {
  return render(
    <MemoryRouter initialEntries={[`/?place=${facility.id}`]}>
      <Explore />
    </MemoryRouter>,
  );
}
function walkingLink() {
  return new URL(
    screen
      .getByRole("link", { name: "Walk there in Google Maps" })
      .getAttribute("href")!,
  );
}

beforeEach(() => service.reset());
afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeolocation)
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  else Reflect.deleteProperty(navigator, "geolocation");
});

describe("public walking directions follow the published entrance guide", () => {
  it("ignores an old persisted guide entrance outside supported Australian coverage", () => {
    const snapshot = service.getSnapshot();
    vi.spyOn(service, "getSnapshot").mockReturnValue({
      ...snapshot,
      guides: snapshot.guides.map((g) =>
        g.id === seedGuide.id
          ? { ...g, entranceLocation: { lat: 51.5, lng: -0.1 } }
          : g,
      ),
    });
    renderDetails();
    expect(walkingLink().searchParams.get("destination")).toBe(
      `${facility.entranceLocation!.lat},${facility.entranceLocation!.lng}`,
    );
  });
  it("uses a community-published entrance instead of the facility's default pin", () => {
    publishEntrance();
    renderDetails();
    expect(walkingLink().searchParams.get("destination")).toBe(
      "-37.82571,144.99366",
    );
    expect(walkingLink().searchParams.get("travelmode")).toBe("walking");
  });

  it("keeps the published entrance while a new location awaits confirmations", () => {
    publishEntrance();
    revision(pendingEntrance);
    service.logout();
    renderDetails();
    expect(walkingLink().searchParams.get("destination")).toBe(
      "-37.82571,144.99366",
    );
    expect(walkingLink().searchParams.get("destination")).not.toBe(
      "-37.8259,144.9939",
    );
  });

  it("falls back to the facility entrance when the published guide has no pin", () => {
    renderDetails();
    expect(walkingLink().searchParams.get("destination")).toBe(
      `${facility.entranceLocation!.lat},${facility.entranceLocation!.lng}`,
    );
  });

  it("keeps approximate straight-line distance visible after nearest-toilet selection", async () => {
    const origin = {
      latitude: facility.location.lat + 0.001,
      longitude: facility.location.lng,
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: origin } as GeolocationPosition),
      },
    });
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Find nearest toilet" }),
    );
    expect(
      await screen.findByRole("heading", { name: facility.name }),
    ).toBeVisible();
    expect(
      screen.getByText(/110 m.*approximate straight-line distance/i),
    ).toBeVisible();
    expect(walkingLink().searchParams.get("origin")).toBe(
      `${origin.latitude},${origin.longitude}`,
    );
  });
});
