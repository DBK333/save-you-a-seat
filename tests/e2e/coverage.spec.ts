import { test, expect } from "@playwright/test";

test("Australian coverage rejects an overseas origin and retains manual discovery", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 51.5, longitude: -0.1 });
  await page.goto("/");
  await page.getByRole("button", { name: "Find nearest toilet" }).click();
  await expect(page.getByText(/outside our Melbourne coverage/)).toBeVisible();
  await page
    .getByRole("button", { name: "Show Swan Street amenities" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Swan Street amenities" }),
  ).toBeVisible();
  expect(
    new URL(
      (await page
        .getByRole("link", { name: "Walk there in Google Maps" })
        .getAttribute("href"))!,
    ).searchParams.get("origin"),
  ).toBe("-37.82565,144.99372");
});

test("guests can compare local demo slots and use official UniMelb booking links", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-29T21:59:00Z"));
  await page.goto("/");
  await page
    .getByRole("link", { name: /Room availability & booking sites/ })
    .click();
  await expect(page).toHaveURL(/\/rooms$/);
  const room = page.getByRole("article", { name: "The Green Room" });
  await expect(room.getByText("20 available blocks")).toBeVisible();
  await page.getByLabel("Room availability date").fill("2026-10-01");
  await room.getByRole("link", { name: /View room/ }).click();
  await page.getByRole("button", { name: "Reserve this room" }).click();
  await page.getByRole("button", { name: "Continue as Alex" }).click();
  await page.getByRole("button", { name: "Reserve this room" }).click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-10-01",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("link", { name: "Room availability", exact: true })
    .click();
  await expect(page.getByText(/Browser-local demo availability/)).toBeVisible();
  await page.getByRole("button", { name: /^University of Melbourne/ }).click();
  await expect(
    page.getByText(/Live availability is not connected/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open DiBS" })).toHaveAttribute(
    "href",
    "https://go.unimelb.edu.au/dibs",
  );
  await expect(page.getByRole("link", { name: "Open DiBS" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(page.getByText(/available blocks$/)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Check library busyness" }),
  ).toBeVisible();
  await expect(page.getByText(/counts people, not free seats/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^University of Melbourne/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("room status and provider screens fit all agreed desktop sizes", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-29T21:59:00Z"));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({
      width,
      height: width === 1280 ? 800 : width === 1440 ? 900 : 1080,
    });
    for (const area of ["cremorne", "unimelb"]) {
      await page.goto(`/rooms?area=${area}`);
      await expect(
        page.getByRole("heading", { name: "Room availability." }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `output/playwright/coverage-${area}-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});
