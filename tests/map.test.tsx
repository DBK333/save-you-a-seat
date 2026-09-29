import { render, screen, fireEvent } from "@testing-library/react";
import MapCanvas from "../src/components/MapCanvas";
import { configurationError } from "../src/config";
import { facilities } from "../src/data/fixtures";

const config = {
  mode: "demo",
  mapsKey: "",
  mapId: "",
  apiUrl: "",
  poolId: "",
  clientId: "",
};
describe("configuration boundary", () => {
  it("never silently enters demo when production configuration is incomplete", () => {
    expect(configurationError({ ...config, mode: "api" })).toMatch(
      /not available|not connected|not implemented/i,
    );
  });
  it("rejects an unknown mode rather than granting local demo privileges", () => {
    expect(configurationError({ ...config, mode: "production" })).toBeTruthy();
  });
  it("allows an explicitly selected demo", () => {
    expect(configurationError(config)).toBeNull();
  });
});
describe("map without a Google key", () => {
  it("honestly identifies an illustrative preview and keeps place selection working", () => {
    const select = vi.fn();
    render(
      <MapCanvas
        facilities={[facilities[0]]}
        selectedId={null}
        onSelect={select}
        origin={null}
        onOriginChange={vi.fn()}
        pickOrigin={false}
        onPickOriginDone={vi.fn()}
      />,
    );
    expect(screen.getByText(/illustrative preview/i)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: `Show ${facilities[0].name}` }),
    );
    expect(select).toHaveBeenCalledWith(facilities[0].id);
  });
  it("does not treat a map centre as the user location", () => {
    const origin = vi.fn();
    render(
      <MapCanvas
        facilities={[]}
        selectedId={null}
        onSelect={vi.fn()}
        origin={null}
        onOriginChange={origin}
        pickOrigin={false}
        onPickOriginDone={vi.fn()}
      />,
    );
    expect(origin).not.toHaveBeenCalled();
  });
});
