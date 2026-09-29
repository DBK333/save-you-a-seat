import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoService } from "./demo";
import { facilities } from "../data/fixtures";
import { bookingStart } from "../domain/rules";
import type {
  DemoState,
  Coordinates,
  GuideInput,
  GuideVersion,
  Media,
  User,
} from "../domain/types";

const now = new Date("2026-09-29T00:00:00Z");
const stored = new Map<string, string>();
const localStorage: Storage = {
  get length() {
    return stored.size;
  },
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value);
  },
  removeItem: (key) => {
    stored.delete(key);
  },
  clear: () => {
    stored.clear();
  },
  key: (index) => [...stored.keys()][index] ?? null,
};
const users: User[] = [
  {
    id: "user-alex",
    name: "Alex",
    email: "alex@example.test",
    role: "user",
    verified: true,
  },
  {
    id: "user-jamie",
    name: "Jamie",
    email: "jamie@example.test",
    role: "user",
    verified: true,
  },
  {
    id: "user-sam",
    name: "Sam",
    email: "sam@example.test",
    role: "user",
    verified: true,
  },
  {
    id: "staff-taylor",
    name: "Taylor",
    email: "taylor@example.test",
    role: "staff",
    verified: true,
  },
  {
    id: "unverified",
    name: "New user",
    email: "new@example.test",
    role: "user",
    verified: false,
  },
];
const media: Media = {
  id: "media-alex",
  ownerId: "user-alex",
  image: "data:image/png;base64,iVBORw0KGgo=",
  filename: "entrance.png",
  mime: "image/png",
  size: 8,
};
const room = () => facilities.find((f) => f.type === "meeting_room")!;
const toilet = () => facilities.find((f) => f.type === "toilet")!;
const input = (): GuideInput => ({
  facilityId: toilet().id,
  title: "Accessible entrance",
  steps: [
    {
      id: "step-1",
      caption: "Enter through this door.",
      image: media.image,
      mediaId: media.id,
      alt: "The entrance door",
    },
  ],
});
function service(seed: Partial<DemoState> = {}, clock = () => now) {
  return new DemoService({
    storage: null,
    now: clock,
    seed: {
      users,
      currentUserId: "user-alex",
      media: [media],
      guides: [],
      reports: [],
      bookings: [],
      blockedGuides: [],
      ...seed,
    },
  });
}
function pending(s: DemoService) {
  return s.submitGuide(s.saveDraft(input()).id);
}
function published(s: DemoService) {
  const guide = pending(s);
  s.login("user-jamie");
  s.confirmGuide(guide.id);
  s.login("user-sam");
  s.confirmGuide(guide.id);
  return s.getSnapshot().guides.find((g) => g.id === guide.id)!;
}
function bookingInput(requestId = "request-1") {
  return {
    facilityId: room().id,
    start: bookingStart("2026-09-30", "10:00"),
    duration: 60,
    requestId,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("demo identities and external store", () => {
  it("switches accounts, emits changes, keeps snapshots stable, and logs out", () => {
    const s = service({ currentUserId: null });
    const listener = vi.fn();
    const off = s.subscribe(listener);
    const initial = s.getSnapshot();
    expect(s.getSnapshot()).toBe(initial);
    s.login("user-jamie");
    expect(s.getSnapshot().currentUserId).toBe("user-jamie");
    expect(s.getSnapshot()).not.toBe(initial);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    s.logout();
    expect(s.getSnapshot().currentUserId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown accounts and creates only unverified ordinary accounts without passwords", () => {
    const s = service();
    expect(() => s.login("unknown")).toThrow(/account/i);
    const account = s.register("Pat", "PAT@Example.test");
    expect(account).toMatchObject({
      email: "pat@example.test",
      role: "user",
      verified: false,
    });
    expect(s.getSnapshot().users).toContainEqual(account);
    expect(JSON.stringify(s.getSnapshot())).not.toMatch(/password/i);
    expect(() => s.register("Again", "pat@example.test")).toThrow(/already/i);
    expect(() => s.register("", "bad")).toThrow();
  });
  it("requires the explicit demo verification code and allows generic recovery", () => {
    const s = service();
    expect(() => s.verify("new@example.test", "wrong")).toThrow(/code/i);
    s.verify("new@example.test", "314159");
    expect(
      s.getSnapshot().users.find((u) => u.id === "unverified")?.verified,
    ).toBe(true);
    expect(() => s.recover("absent@example.test")).not.toThrow();
  });
  it("guests cannot mutate guides, upload media, reserve, or report", async () => {
    const s = service({ currentUserId: null });
    expect(() => s.saveDraft(input())).toThrow(/sign in/i);
    expect(() => s.book(bookingInput())).toThrow(/sign in/i);
    expect(() => s.reportGuide("no-guide", "Incorrect", "")).toThrow(
      /sign in/i,
    );
    await expect(
      s.upload(new File(["x"], "photo.png", { type: "image/png" })),
    ).rejects.toThrow(/sign in/i);
  });
  it("persists local state, rejects corrupt storage safely, and clears a demo on reset", () => {
    const s = new DemoService({
      storage: localStorage,
      now: () => now,
      seed: { users, currentUserId: null },
    });
    s.login("user-jamie");
    expect(localStorage.length).toBe(1);
    expect(
      new DemoService({ storage: localStorage }).getSnapshot().currentUserId,
    ).toBe("user-jamie");
    const key = localStorage.key(0)!;
    localStorage.setItem(key, "{bad json");
    const clean = new DemoService({ storage: localStorage });
    expect(clean.getSnapshot().currentUserId).toBeNull();
    clean.login("user-alex");
    clean.reset();
    expect(clean.getSnapshot().currentUserId).toBeNull();
    expect(clean.getSnapshot().bookings).toEqual([]);
  });
  it("leaves state intact if persistence runs out of quota", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    const s = new DemoService({
      storage,
      seed: { users, currentUserId: null },
    });
    expect(() => s.login("user-alex")).toThrow(/storage/i);
    expect(s.getSnapshot().currentUserId).toBeNull();
  });
  it("does not expose writable snapshots", () => {
    const s = service();
    expect(() => {
      s.getSnapshot().blockedGuides.push("forged");
    }).toThrow();
  });
});

describe("image uploads", () => {
  const png = () =>
    new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])],
      "door.png",
      { type: "image/png" },
    );
  it("decodes an image and associates immutable content with its uploader", async () => {
    const decode = vi
      .fn()
      .mockResolvedValue({ width: 100, height: 100, close: vi.fn() });
    vi.stubGlobal("createImageBitmap", decode);
    const s = service();
    const result = await s.upload(png());
    expect(decode).toHaveBeenCalled();
    expect(result.ownerId).toBe("user-alex");
    expect(result.image).toMatch(/^data:image\/png;base64,/);
    expect(s.getSnapshot().media).toContainEqual(result);
  });
  it("rejects unsupported, oversized, empty, disguised and undecodable files", async () => {
    const s = service();
    await expect(
      s.upload(new File(["svg"], "door.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow(/JPEG|PNG|WebP/i);
    await expect(
      s.upload(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow(/5 MB/i);
    await expect(
      s.upload(new File([], "empty.png", { type: "image/png" })),
    ).rejects.toThrow(/empty/i);
    await expect(
      s.upload(new File(["not an image"], "fake.png", { type: "image/png" })),
    ).rejects.toThrow(/image/i);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("cannot decode")),
    );
    await expect(s.upload(png())).rejects.toThrow(/image/i);
    expect(s.getSnapshot().media).toHaveLength(1);
  });
  it("does not attach an upload after the uploading account changes", async () => {
    let resolveDecode!: (value: unknown) => void;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDecode = resolve;
          }),
      ),
    );
    const s = service();
    const upload = s.upload(png());
    await vi.waitFor(() => expect(resolveDecode).toBeDefined());
    s.login("user-jamie");
    resolveDecode({ width: 100, height: 100, close: () => {} });
    await expect(upload).rejects.toThrow(/account|sign in/i);
  });
  it("normalizes large photos for browser storage after decoding", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 3200, height: 2400, close: vi.fn() }),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/webp;base64,UklGRgAAAABXRUJQ",
    );
    const result = await service().upload(png());
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(result.image).toMatch(/^data:image\/webp;/);
    expect(result.mime).toBe("image/webp");
  });
});

describe("guide authoring and community publication", () => {
  it.each([
    { lat: -33.8688, lng: 151.2093 },
    { lat: 51.5072, lng: -0.1276 },
    { lat: -37.83, lng: 145.03 },
    null,
  ])(
    "rejects an entrance outside supported Melbourne coverage: %j",
    (entranceLocation) => {
      const s = service();
      expect(() =>
        s.saveDraft({
          ...input(),
          entranceLocation: entranceLocation as Coordinates,
        }),
      ).toThrow(
        expect.objectContaining({
          status: 422,
          code: "VALIDATION_ERROR",
          message: expect.stringMatching(/Melbourne.*coverage/i),
        }),
      );
      expect(s.getSnapshot().guides).toHaveLength(0);
    },
  );

  it("allows an omitted entrance and a pin inside the local Melbourne focus window", () => {
    const s = service();
    expect(s.saveDraft(input()).entranceLocation).toBeUndefined();
    const entranceLocation = { lat: -37.7983, lng: 144.961 };
    expect(
      s.saveDraft({ ...input(), entranceLocation }).entranceLocation,
    ).toEqual(entranceLocation);
  });

  it("revalidates an old persisted draft before submission", () => {
    const draft = service().saveDraft(input());
    const s = service({
      guides: [{ ...draft, entranceLocation: { lat: 51.5072, lng: -0.1276 } }],
    });
    expect(() => s.submitGuide(draft.id)).toThrow(/Melbourne.*coverage/i);
    expect(s.getSnapshot().guides[0].status).toBe("draft");
  });

  it("cannot publish an old out-of-area pending guide through new confirmations", () => {
    const guide = pending(service());
    const s = service({
      guides: [
        {
          ...guide,
          entranceLocation: { lat: 51.5072, lng: -0.1276 },
          confirmations: ["user-alex", "user-jamie"],
        },
      ],
    });
    s.login("user-sam");
    expect(() => s.confirmGuide(guide.id)).toThrow(/Melbourne.*coverage/i);
    expect(s.getSnapshot().guides[0].status).toBe("pending");
    expect(s.getSnapshot().guides[0].confirmations).toHaveLength(2);
  });

  it("saves ordered steps and starts immutable submission with author confirmation", () => {
    const s = service();
    const draft = s.saveDraft({
      ...input(),
      steps: [
        ...input().steps,
        { ...input().steps[0], id: "step-2", caption: "Turn left." },
      ],
    });
    expect(draft.status).toBe("draft");
    expect(draft.steps.map((step) => step.caption)).toEqual([
      "Enter through this door.",
      "Turn left.",
    ]);
    const submitted = s.submitGuide(draft.id);
    expect(submitted.status).toBe("pending");
    expect(submitted.confirmations).toEqual(["user-alex"]);
    expect(() => s.saveDraft(input(), draft.id)).toThrow(
      /submitted|immutable|draft/i,
    );
  });
  it("requires complete photos and captions at submission and limits steps", () => {
    const s = service();
    const draft = s.saveDraft({
      ...input(),
      steps: [{ ...input().steps[0], caption: "" }],
    });
    expect(() => s.submitGuide(draft.id)).toThrow(/caption|instruction/i);
    expect(() =>
      s.saveDraft({
        ...input(),
        steps: Array.from({ length: 6 }, (_, i) => ({
          ...input().steps[0],
          id: `s${i}`,
        })),
      }),
    ).toThrow(/five|5/i);
    expect(() =>
      s.submitGuide(s.saveDraft({ ...input(), steps: [] }).id),
    ).toThrow(/step/i);
  });
  it("rejects foreign media, unowned edits and forged image content", () => {
    const s = service();
    const draft = s.saveDraft(input());
    s.login("user-jamie");
    expect(() => s.saveDraft(input(), draft.id)).toThrow(/own|permission/i);
    expect(() => s.saveDraft(input())).toThrow(/image|photo|own/i);
    s.login("user-alex");
    expect(() =>
      s.saveDraft({
        ...input(),
        steps: [{ ...input().steps[0], image: "data:fake" }],
      }),
    ).toThrow(/image|photo/i);
  });
  it("requires verified accounts, counts each person once and publishes at three", () => {
    const s = service();
    const guide = pending(s);
    s.confirmGuide(guide.id);
    expect(s.getSnapshot().guides[0].confirmations).toHaveLength(1);
    s.login("unverified");
    expect(() => s.confirmGuide(guide.id)).toThrow(/verify|verified/i);
    s.login("user-jamie");
    s.confirmGuide(guide.id);
    s.confirmGuide(guide.id);
    expect(s.getSnapshot().guides[0].confirmations).toHaveLength(2);
    s.login("user-sam");
    s.confirmGuide(guide.id);
    expect(s.getSnapshot().guides[0]).toMatchObject({
      status: "published",
      publishedAt: now.toISOString(),
    });
  });
  it("keeps an old published version until its independent revision qualifies", () => {
    const s = service();
    const first = published(s);
    s.login("user-alex");
    const revised = s.submitGuide(
      s.saveDraft({
        ...input(),
        guideId: first.guideId,
        title: "Updated entrance",
      }).id,
    );
    expect(revised.confirmations).toEqual(["user-alex"]);
    expect(s.getSnapshot().guides.find((g) => g.id === first.id)?.status).toBe(
      "published",
    );
    s.login("user-jamie");
    s.confirmGuide(revised.id);
    s.login("user-sam");
    s.confirmGuide(revised.id);
    expect(s.getSnapshot().guides.find((g) => g.id === first.id)?.status).toBe(
      "superseded",
    );
    expect(
      s.getSnapshot().guides.filter((g) => g.status === "published"),
    ).toHaveLength(1);
  });
  it("cannot move a revision to another facility", () => {
    const s = service();
    const first = published(s);
    s.login("user-alex");
    expect(() =>
      s.saveDraft({
        ...input(),
        guideId: first.guideId,
        facilityId: room().id,
      }),
    ).toThrow(/facility/i);
  });
  it("does not let a second user attach an upload from somebody else’s draft", () => {
    const s = service();
    const draft = s.saveDraft(input());
    s.login("user-jamie");
    expect(() => s.saveDraft({ ...input(), guideId: draft.guideId })).toThrow(
      /image|photo|own/i,
    );
  });
});

describe("reporting and staff decisions", () => {
  it("keeps a reported guide published and rejects nonstaff moderation", () => {
    const s = service();
    const guide = published(s);
    s.reportGuide(guide.id, "Wrong entrance", "This door is locked.");
    expect(s.getSnapshot().guides[0].status).toBe("published");
    expect(s.getSnapshot().reports[0].status).toBe("open");
    expect(() =>
      s.moderate(s.getSnapshot().reports[0].id, "remove", "Checked"),
    ).toThrow(/staff/i);
  });
  it("dismisses a report with a staff decision while keeping the guide visible", () => {
    const s = service();
    const guide = published(s);
    s.reportGuide(guide.id, "Wrong entrance", "");
    s.login("staff-taylor");
    s.moderate(s.getSnapshot().reports[0].id, "dismiss", "Entrance verified.");
    expect(s.getSnapshot().reports[0]).toMatchObject({
      status: "dismissed",
      decision: { staffId: "staff-taylor", action: "dismiss" },
    });
    expect(s.getSnapshot().guides[0].status).toBe("published");
  });
  it("removes all guide versions and blocks late confirmation or revisions from restoring it", () => {
    const s = service();
    const guide = published(s);
    s.login("user-alex");
    const revision = pendingRevision(s, guide);
    s.reportGuide(guide.id, "Private entrance", "");
    s.login("staff-taylor");
    s.moderate(
      s.getSnapshot().reports[0].id,
      "remove",
      "Private entrance confirmed.",
    );
    expect(s.getSnapshot().blockedGuides).toContain(guide.guideId);
    expect(s.getSnapshot().guides.every((g) => g.status === "removed")).toBe(
      true,
    );
    s.login("user-jamie");
    expect(() => s.confirmGuide(revision.id)).toThrow(/removed|blocked/i);
    s.login("user-alex");
    expect(() => s.saveDraft({ ...input(), guideId: guide.guideId })).toThrow(
      /removed|blocked/i,
    );
  });
});
function pendingRevision(s: DemoService, guide: GuideVersion) {
  return s.submitGuide(s.saveDraft({ ...input(), guideId: guide.guideId }).id);
}

describe("room reservations", () => {
  it("creates a booking and an exact retry returns it without duplicate slots", () => {
    const s = service();
    const booking = s.book(bookingInput());
    expect(booking).toMatchObject({
      userId: "user-alex",
      status: "confirmed",
      start: "2026-09-30T00:00:00.000Z",
      end: "2026-09-30T01:00:00.000Z",
    });
    expect(s.book(bookingInput()).id).toBe(booking.id);
    expect(s.getSnapshot().bookings).toHaveLength(1);
    expect(() => s.book({ ...bookingInput(), duration: 30 })).toThrow(
      /request|idempotency/i,
    );
  });
  it("rejects overlapping requests entirely but allows adjacent bookings", () => {
    const s = service();
    s.book(bookingInput());
    s.login("user-jamie");
    expect(() =>
      s.book({
        ...bookingInput("other"),
        start: bookingStart("2026-09-30", "09:30"),
        duration: 90,
      }),
    ).toThrow(/available|reserved|overlap/i);
    expect(s.getSnapshot().bookings).toHaveLength(1);
    expect(
      s.book({
        ...bookingInput("adjacent"),
        start: bookingStart("2026-09-30", "11:00"),
      }).status,
    ).toBe("confirmed");
  });
  it.each([0, 15, 45, 150])("rejects invalid duration %i", (duration) => {
    expect(() => service().book({ ...bookingInput(), duration })).toThrow(
      /duration|30|120/i,
    );
  });
  it("rejects past, misaligned, after-hours and excessive-horizon reservations", () => {
    const s = service();
    for (const [date, time] of [
      ["2026-09-28", "10:00"],
      ["2026-09-30", "10:15"],
      ["2026-09-30", "23:30"],
      ["2026-10-14", "10:00"],
    ])
      expect(() =>
        s.book({ ...bookingInput(), start: bookingStart(date, time) }),
      ).toThrow();
    expect(() =>
      s.book({ ...bookingInput(), facilityId: toilet().id }),
    ).toThrow(/room/i);
  });
  it("enforces cancellation ownership and time while retries cannot erase a later reservation", () => {
    const s = service();
    const original = s.book(bookingInput());
    s.login("user-jamie");
    expect(() => s.cancelBooking(original.id)).toThrow(/own|permission/i);
    s.login("user-alex");
    s.cancelBooking(original.id);
    const later = s.book(bookingInput("later"));
    s.cancelBooking(original.id);
    expect(
      s.getSnapshot().bookings.find((b) => b.id === later.id)?.status,
    ).toBe("confirmed");
    const past = service({
      bookings: [{ ...original, start: "2026-09-28T00:00:00Z" }],
    });
    expect(() => past.cancelBooking(original.id)).toThrow(/start|past/i);
  });
  it("keeps elapsed duration accurate across the Melbourne spring clock change", () => {
    const s = service();
    const result = s.book({
      ...bookingInput("dst"),
      start: bookingStart("2026-10-05", "10:00"),
      duration: 120,
    });
    expect(result.start).toBe("2026-10-04T23:00:00.000Z");
    expect(Date.parse(result.end) - Date.parse(result.start)).toBe(
      120 * 60_000,
    );
  });
});
