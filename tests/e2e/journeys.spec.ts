import { test, expect, type Page } from "@playwright/test";

async function signIn(
  page: Page,
  name: "Alex" | "Jamie" | "Sam" | "Taylor",
  returnTo = "/",
) {
  await page.goto(
    `${name === "Taylor" ? "/staff/login" : "/login"}?returnTo=${encodeURIComponent(returnTo)}`,
  );
  await page.getByRole("button", { name: `Continue as ${name}` }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === returnTo);
}

test("guest can discover a place and open walking directions to its entrance", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /find your/i })).toBeVisible();
  await page.getByRole("button", { name: "Rooms", exact: true }).click();
  await expect(page.getByRole("button", { name: /^View / })).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Show / })).toHaveCount(4);
  await page.getByLabel("Search places").fill("Studio");
  await expect(page.getByRole("button", { name: /^View / })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Show / })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Show Studio 12" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "All places", exact: true }).click();
  await page
    .getByRole("button", { name: "View Swan Street amenities" })
    .click();
  const link = page.getByRole("link", { name: /Walk there in Google Maps/i });
  await expect(link).toHaveAttribute("target", "_blank");
  const href = await link.getAttribute("href");
  const url = new URL(href!);
  expect(url.searchParams.get("travelmode")).toBe("walking");
  expect(url.searchParams.get("destination")).toBe("-37.82565,144.99372");
});

test("ordinary user cannot enter staff moderation", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as Alex" }).click();
  await page.goto("/staff/reports");
  await expect(
    page.getByText(/staff access|staff sign.in|staff only/i).first(),
  ).toBeVisible();
});

test("desktop views remain legible without horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const size of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /find your/i }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/explore-${size.width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/login-1440.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("nearest toilet uses explicit location and provides a manual fallback", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -37.8255, longitude: 144.9938 });
  await page.goto("/");
  await page.getByRole("button", { name: "Find nearest toilet" }).click();
  await expect(
    page.getByRole("heading", { name: "Swan Street amenities" }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Walk there in Google Maps" });
  expect(
    new URL((await link.getAttribute("href"))!).searchParams.get("origin"),
  ).toBe("-37.8255,144.9938");
  await context.clearPermissions();
  await page.goto("/");
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) =>
      error?.({
        code: 1,
        message: "Denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
  });
  await page.getByRole("button", { name: "Find nearest toilet" }).click();
  await expect(page.getByText(/Location access is unavailable/)).toBeVisible();
  await page
    .getByRole("button", { name: "Show Cremorne Corner facilities" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cremorne Corner facilities" }),
  ).toBeVisible();
});

test("registration verification and recovery are explicitly local demo flows", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Robin Demo");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("robin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("NotPersisted123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("NotPersisted123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  await page.getByLabel("Verification code").fill("314159");
  await page.getByRole("button", { name: "Verify account" }).click();
  await expect(page.getByText("You’re verified.")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "NotPersisted123",
  );
  await page.goto("/forgot-password");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("robin@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/No email was sent/)).toBeVisible();
  await page.getByRole("link", { name: "Continue demo reset" }).click();
  await page.getByLabel("Verification code").fill("314159");
  await page
    .getByLabel("New password", { exact: true })
    .fill("AlsoNotPersisted123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("AlsoNotPersisted123");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByText("Demo reset complete.")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "AlsoNotPersisted123",
  );
});

test("a member can reserve a room and cancel the browser-local reservation", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-29T23:00:00Z"));
  await signIn(page, "Alex", "/?place=room-01");
  await page.getByRole("button", { name: "Reserve this room" }).click();
  await page.getByLabel("Date", { exact: true }).fill("2026-10-01");
  await page
    .getByRole("combobox", { name: "Duration", exact: true })
    .selectOption("60");
  const time = page.getByLabel("Start time");
  const first = await time
    .locator("option:not([disabled])")
    .first()
    .getAttribute("value");
  await time.selectOption(first!);
  await page.getByRole("button", { name: "Confirm demo reservation" }).click();
  await expect(
    page.getByText(
      "This is a demo reservation. No real venue has been contacted.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/booking-receipt.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "View my bookings" }).click();
  await expect(
    page.getByRole("heading", { name: "The Green Room" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page.getByRole("button", { name: /Past & cancelled/ }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
});

test("photo guide gets two other confirmations, remains visible after report, then staff removes it", async ({
  page,
}) => {
  await signIn(page, "Alex", "/guides/new?facility=toilet-02");
  await page.getByLabel("Guide title").fill("A clear way inside");
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#778878";
    ctx.fillRect(0, 0, 120, 80);
    ctx.fillStyle = "#202a24";
    ctx.fillRect(40, 10, 40, 70);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload entrance photos").setInputFiles({
    name: "entrance.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await page
    .getByLabel("What should someone do here?")
    .fill("Enter through the green door, then turn left.");
  await page.screenshot({
    path: "output/playwright/guide-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Submit for confirmation" }).click();
  let card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "A clear way inside" }) });
  await expect(card.getByText("1 of 3 confirmations")).toBeVisible();
  await expect(
    card.getByRole("button", { name: "You’ve confirmed" }),
  ).toBeDisabled();
  await signIn(page, "Jamie", "/community");
  card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "A clear way inside" }) });
  await card.getByText("Review entrance steps").click();
  await card.getByRole("button", { name: "Confirm this entrance" }).click();
  await expect(card.getByText("2 of 3 confirmations")).toBeVisible();
  await signIn(page, "Sam", "/community");
  card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "A clear way inside" }) });
  await card.getByRole("button", { name: "Confirm this entrance" }).click();
  await page.goto("/?place=toilet-02");
  await expect(
    page.getByText("A clear way inside", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 distinct accounts confirmed this version."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Report this guide" }).click();
  await page
    .getByLabel("What should staff know?")
    .fill("The entrance has changed; please review this guide.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("A clear way inside", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/A report is awaiting staff review/),
  ).toBeVisible();
  await signIn(page, "Taylor", "/staff/reports");
  await expect(
    page.getByRole("button", { name: "Review report" }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/staff-reports.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Review report" }).click();
  await page.getByRole("radio", { name: /Remove guide/ }).check();
  await page
    .getByLabel("Decision note")
    .fill("Reviewed: entrance directions are no longer correct.");
  await page.getByRole("button", { name: "Remove guide", exact: true }).click();
  await page.goto("/?place=toilet-02");
  await expect(
    page.getByText("A clear way inside", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("The last few steps matter.")).toBeVisible();
});
