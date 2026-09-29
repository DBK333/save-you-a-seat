import { act, render, screen, waitFor } from "@testing-library/react";
import MapCanvas from "../src/components/MapCanvas";

vi.mock("../src/config", () => ({
  config: { mapsKey: "test-key", mapId: "" },
}));

afterEach(() => vi.unstubAllGlobals());

it("loads Google with the Australia region bias without making a network request in this test", () => {
  const view = render(
    <MapCanvas
      facilities={[]}
      selectedId={null}
      onSelect={vi.fn()}
      origin={null}
      onOriginChange={vi.fn()}
      pickOrigin={false}
      onPickOriginDone={vi.fn()}
    />,
  );
  const script = document.querySelector<HTMLScriptElement>(
    'script[src^="https://maps.googleapis.com/maps/api/js"]',
  );
  expect(script).not.toBeNull();
  expect(new URL(script!.src).searchParams.get("region")).toBe("AU");
  view.unmount();
  script!.remove();
});

it("restricts the Google viewport to Australia and rejects out-of-coverage origin clicks", async () => {
  let options: google.maps.MapOptions | undefined;
  let click: ((event: unknown) => void) | undefined;
  class MapDouble {
    constructor(_element: unknown, value: google.maps.MapOptions) {
      options = value;
    }
    addListener(_name: string, handler: (event: unknown) => void) {
      click = handler;
      return { remove() {} };
    }
    panTo() {}
  }
  vi.stubGlobal("google", {
    maps: {
      importLibrary: async () => ({ Map: MapDouble }),
      ColorScheme: { DARK: "DARK" },
      marker: {
        AdvancedMarkerElement: class {
          map = null;
        },
      },
    },
  });
  const choose = vi.fn();
  const done = vi.fn();
  const view = render(
    <MapCanvas
      facilities={[]}
      selectedId={null}
      onSelect={vi.fn()}
      origin={null}
      onOriginChange={choose}
      pickOrigin
      onPickOriginDone={done}
    />,
  );
  await waitFor(() => expect(options).toBeDefined());
  expect(options?.restriction).toEqual({
    latLngBounds: { north: -10, south: -44, west: 112, east: 154 },
    strictBounds: true,
  });
  act(() => click?.({ latLng: { toJSON: () => ({ lat: 51.5, lng: -0.1 }) } }));
  expect(choose).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/Melbourne coverage/i);
  act(() =>
    click?.({ latLng: { toJSON: () => ({ lat: -37.829, lng: 144.995 }) } }),
  );
  expect(choose).toHaveBeenCalledWith({ lat: -37.829, lng: 144.995 });
  expect(done).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.unmount();
  vi.unstubAllGlobals();
});
