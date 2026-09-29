import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { service } from "../src/services";

function show(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  service.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T21:59:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("rejects a starting point outside the supported Australian focus and offers map selection", () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: 51.5, longitude: -0.1 },
        } as GeolocationPosition),
    },
  });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Find nearest toilet" }));
  expect(screen.getByText(/outside our Melbourne coverage/i)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Change starting point" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Swan Street amenities" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Show Swan Street amenities" }),
  );
  const route = new URL(
    screen
      .getByRole("link", { name: "Walk there in Google Maps" })
      .getAttribute("href")!,
  );
  expect(route.searchParams.get("origin")).toBe("-37.82565,144.99372");
});

it("gives guests access to room status and booking sites from Explore", () => {
  show();
  fireEvent.click(
    screen.getByRole("link", { name: /Room availability & booking sites/i }),
  );
  expect(
    screen.getByRole("heading", { name: /Room availability/i }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: /^University of Melbourne/ }),
  ).toBeVisible();
});

it("shows remaining demo half-hour blocks and refreshes after booking and cancellation", () => {
  show("/rooms");
  const room = screen.getByRole("article", { name: "The Green Room" });
  expect(within(room).getByText("20 available blocks")).toBeVisible();
  expect(screen.getByText(/Browser-local demo availability/i)).toBeVisible();
  let id = "";
  act(() => {
    service.login("user-alex");
    id = service.book({
      facilityId: "room-01",
      start: "2026-09-30T00:00:00Z",
      duration: 60,
      requestId: "coverage-booking",
    }).id;
  });
  expect(within(room).getByText("18 available blocks")).toBeVisible();
  expect(within(room).getByText("2 reserved blocks")).toBeVisible();
  act(() => service.cancelBooking(id));
  expect(within(room).getByText("20 available blocks")).toBeVisible();
});

it("links UniMelb rooms to official booking services without inventing live slots or local reservations", () => {
  show("/rooms?area=unimelb");
  expect(screen.getByText(/Live availability is not connected/i)).toBeVisible();
  const dibs = screen.getByRole("link", { name: /Open DiBS/i });
  expect(dibs).toHaveAttribute("target", "_blank");
  expect(dibs).toHaveAttribute("rel", "noopener noreferrer");
  expect(new URL(dibs.getAttribute("href")!).protocol).toBe("https:");
  expect(screen.queryByText(/available blocks$/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /reserve/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/University account/i)).toBeVisible();
});

it("keeps the chosen availability date through room details, login and reservation", () => {
  show("/rooms");
  fireEvent.change(screen.getByLabelText("Room availability date"), {
    target: { value: "2026-10-01" },
  });
  const room = screen.getByRole("article", { name: "The Green Room" });
  fireEvent.click(within(room).getByRole("link", { name: /View room/ }));
  fireEvent.click(screen.getByRole("button", { name: "Reserve this room" }));
  fireEvent.click(screen.getByRole("button", { name: /Continue as Alex/ }));
  fireEvent.click(screen.getByRole("button", { name: "Reserve this room" }));
  expect(screen.getByLabelText("Date")).toHaveValue("2026-10-01");
});

it("removes expired booking starts and refreshes Open now as the clock advances", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T07:59:00Z")); // 17:59 Melbourne
  service.login("user-alex");
  show("/?place=room-01");
  fireEvent.click(screen.getByRole("button", { name: "Reserve this room" }));
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2026-10-01" },
  });
  const first = screen.getByRole("option", { name: "8:00 am" });
  expect(first).not.toBeDisabled();
  act(() => {
    vi.setSystemTime(new Date("2026-09-30T22:01:00Z")); // tomorrow 08:01
    vi.advanceTimersByTime(30_000);
  });
  expect(first).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.click(screen.getByRole("button", { name: "Close place details" }));
  fireEvent.change(screen.getByLabelText("Search places"), {
    target: { value: "The Green Room" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open now" }));
  expect(
    screen.getByRole("button", { name: "View The Green Room" }),
  ).toBeVisible();
  act(() => {
    vi.setSystemTime(new Date("2026-10-01T08:01:00Z")); // 18:01
    vi.advanceTimersByTime(30_000);
  });
  expect(
    screen.queryByRole("button", { name: "View The Green Room" }),
  ).not.toBeInTheDocument();
});
