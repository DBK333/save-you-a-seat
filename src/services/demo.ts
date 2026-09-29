import { Temporal } from "@js-temporal/polyfill";
import { demoUsers, facilities, initialGuides } from "../data/fixtures";
import { TIME_ZONE, withinBookingHorizon } from "../domain/rules";
import { isSupportedOrigin } from "../domain/coverage";
import type {
  AppService,
  Booking,
  BookingInput,
  Coordinates,
  DemoState,
  GuideInput,
  GuideVersion,
  Media,
  User,
} from "../domain/types";

export interface DemoOptions {
  storage?: Storage | null;
  now?: () => Date;
  seed?: Partial<DemoState>;
}
export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}
const STORAGE_KEY = "syas.demo.v1";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function fail(message: string, code = "VALIDATION_ERROR", status = 422): never {
  throw new DomainError(code, message, status);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function initialState(): DemoState {
  return {
    users: copy(demoUsers),
    currentUserId: null,
    guides: copy(initialGuides),
    reports: [],
    bookings: [],
    media: [],
    blockedGuides: [],
    revision: 0,
  };
}
function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? (window.localStorage ?? null) : null;
  } catch {
    return null;
  }
}
function text(
  value: string,
  label: string,
  max: number,
  required = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(
      `${label} ${required ? "is required and " : ""}must be at most ${max} characters.`,
    );
  return value.trim();
}
function emailAddress(value: string): string {
  const email = text(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("Enter a valid email address.");
  return email;
}
function validateCoordinates(value?: Coordinates): void {
  if (value !== undefined && !isSupportedOrigin(value))
    fail("Choose an entrance inside the supported Melbourne coverage area.");
}

/** Browser-local demonstration only. This is not an authentication boundary or
 * a multi-browser transaction implementation. Every mutation is synchronous
 * and committed once, so the current tab observes a consistent state. */
export class DemoService implements AppService {
  private state: DemoState;
  private readonly listeners = new Set<() => void>();
  private readonly storage: Storage | null;
  private readonly now: () => Date;

  constructor(options: DemoOptions = {}) {
    this.storage =
      options.storage === undefined ? browserStorage() : options.storage;
    this.now = options.now ?? (() => new Date());
    let state = { ...initialState(), ...copy(options.seed ?? {}) };
    if (!options.seed) {
      try {
        const saved = this.storage?.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (validStoredState(parsed)) state = parsed;
        }
      } catch {
        /* Corrupt/unavailable storage starts a fresh labelled demo. */
      }
    }
    this.state = freeze(state);
  }
  getSnapshot = (): DemoState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(update: (state: DemoState) => void): void {
    const next = copy(this.state);
    update(next);
    next.revision += 1;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      fail(
        "Browser storage is full or unavailable. Try a smaller photo or reset the local demo. Your change was not saved.",
        "STORAGE_ERROR",
        507,
      );
    }
    this.state = freeze(next);
    this.listeners.forEach((listener) => listener());
  }
  private account(verified = false): User {
    const user = this.state.users.find(
      (account) => account.id === this.state.currentUserId,
    );
    if (!user) fail("Sign in to continue.", "UNAUTHENTICATED", 401);
    if (verified && !user.verified)
      fail(
        "Verify your email before contributing or reserving a room.",
        "FORBIDDEN",
        403,
      );
    return user;
  }
  private guide(versionId: string): GuideVersion {
    const guide = this.state.guides.find((version) => version.id === versionId);
    if (!guide)
      fail("This entrance guide could not be found.", "NOT_FOUND", 404);
    return guide;
  }
  private unblocked(guideId: string): void {
    if (this.state.blockedGuides.includes(guideId))
      fail(
        "This guide has been removed by staff and cannot be republished.",
        "CONFLICT",
        409,
      );
  }

  login(userId: string): void {
    if (!this.state.users.some((user) => user.id === userId))
      fail("Choose an existing demo account.", "UNAUTHENTICATED", 401);
    this.commit((state) => {
      state.currentUserId = userId;
    });
  }
  logout(): void {
    this.commit((state) => {
      state.currentUserId = null;
    });
  }
  register(name: string, email: string): User {
    const normalized = emailAddress(email);
    const displayName = text(name, "Name", 80);
    if (
      this.state.users.some((user) => user.email.toLowerCase() === normalized)
    )
      fail("This email already has a demo account.", "CONFLICT", 409);
    const user: User = {
      id: id("user"),
      name: displayName,
      email: normalized,
      verified: false,
      role: "user",
    };
    this.commit((state) => {
      state.users.push(user);
      state.currentUserId = user.id;
    });
    return this.state.users.find((account) => account.id === user.id)!;
  }
  verify(email: string, code: string): void {
    const normalized = emailAddress(email);
    if (code !== "314159")
      fail(
        "Use the demo verification code 314159. No email is sent in this demo.",
      );
    const user = this.state.users.find(
      (account) => account.email === normalized,
    );
    if (!user)
      fail("Create a demo account before verifying it.", "NOT_FOUND", 404);
    this.commit((state) => {
      state.users.find((account) => account.id === user.id)!.verified = true;
    });
  }
  recover(email: string): void {
    emailAddress(
      email,
    ); /* Demo accounts have no passwords and no email is sent. */
  }

  async upload(file: File): Promise<Media> {
    const uploader = this.account(true);
    if (!IMAGE_TYPES.includes(file.type))
      fail("Choose a JPEG, PNG, or WebP image.");
    if (file.size === 0) fail("This image is empty. Choose another photo.");
    if (file.size > MAX_IMAGE_BYTES)
      fail("Each image must be 5 MB or smaller.");
    const source = await readImage(file);
    validateSignature(source, file.type);
    const image = await decodeImage(file, source);
    if (this.account(true).id !== uploader.id)
      fail(
        "Your account changed during the upload. Select the photo again.",
        "FORBIDDEN",
        403,
      );
    const media: Media = {
      id: id("media"),
      ownerId: uploader.id,
      filename: file.name,
      mime: image.slice(5, image.indexOf(";")),
      size: file.size,
      image,
    };
    this.commit((state) => {
      state.media.push(media);
    });
    return this.state.media.find((item) => item.id === media.id)!;
  }

  saveDraft(input: GuideInput, draftId?: string): GuideVersion {
    const author = this.account(true);
    if (!facilities.some((facility) => facility.id === input.facilityId))
      fail("Choose an existing facility.", "NOT_FOUND", 404);
    const title = text(input.title, "Guide title", 120, false);
    if (!Array.isArray(input.steps) || input.steps.length > 5)
      fail("A guide can contain up to five photo steps.");
    validateCoordinates(input.entranceLocation);
    const draft = draftId ? this.guide(draftId) : undefined;
    if (draft && draft.authorId !== author.id)
      fail("You can only edit your own drafts.", "FORBIDDEN", 403);
    if (draft && draft.status !== "draft")
      fail(
        "Submitted guide versions are immutable. Create a revision instead.",
        "CONFLICT",
        409,
      );
    const previous = input.guideId
      ? this.state.guides.find((guide) => guide.guideId === input.guideId)
      : undefined;
    if (input.guideId && !previous)
      fail("The original guide could not be found.", "NOT_FOUND", 404);
    const guideId = draft?.guideId ?? input.guideId ?? id("guide");
    this.unblocked(guideId);
    if (
      (draft && draft.facilityId !== input.facilityId) ||
      (previous && previous.facilityId !== input.facilityId)
    )
      fail("A revision must belong to the same facility.");
    if (draft && input.guideId && draft.guideId !== input.guideId)
      fail("A draft cannot be moved to a different guide.");
    const ids = new Set<string>();
    const steps = input.steps.map((step) => {
      if (!step.id || ids.has(step.id))
        fail("Each photo step needs a distinct identifier.");
      ids.add(step.id);
      const caption = text(step.caption, "Step instruction", 1000, false);
      const alt = text(step.alt, "Image description", 300, false);
      if (step.image) {
        const owned = this.state.media.find(
          (item) =>
            item.id === step.mediaId &&
            item.ownerId === author.id &&
            item.image === step.image,
        );
        // Only unchanged sample illustration steps may be retained in a revision.
        // User uploads always pass JPEG/PNG/WebP byte and decoder validation.
        const seedStep = this.state.guides.some(
          (guide) =>
            guide.guideId === guideId &&
            initialGuides.some((seed) => seed.guideId === guideId) &&
            guide.steps.some(
              (existing) =>
                existing.id === step.id &&
                existing.image === step.image &&
                step.image.startsWith("/images/"),
            ),
        );
        const existingStep = this.state.guides.some(
          (guide) =>
            guide.guideId === guideId &&
            guide.authorId === author.id &&
            guide.steps.some(
              (existing) =>
                existing.id === step.id &&
                existing.mediaId === step.mediaId &&
                existing.image === step.image,
            ),
        );
        if (!owned && !seedStep && !existingStep)
          fail(
            "Each photo must be your own validated upload or an unchanged photo from this guide.",
            "FORBIDDEN",
            403,
          );
      } else if (step.mediaId)
        fail("This photo could not be loaded. Upload it again.");
      return { ...step, caption, alt };
    });
    const version: GuideVersion = {
      id: draft?.id ?? id("version"),
      guideId,
      facilityId: input.facilityId,
      authorId: author.id,
      title,
      steps,
      entranceLocation: input.entranceLocation,
      status: "draft",
      confirmations: [],
      createdAt: draft?.createdAt ?? this.now().toISOString(),
    };
    this.commit((state) => {
      const index = state.guides.findIndex((guide) => guide.id === version.id);
      if (index < 0) state.guides.push(version);
      else state.guides[index] = version;
    });
    return this.guide(version.id);
  }
  submitGuide(versionId: string): GuideVersion {
    const author = this.account(true);
    const guide = this.guide(versionId);
    this.unblocked(guide.guideId);
    if (guide.authorId !== author.id)
      fail("You can only submit your own guide.", "FORBIDDEN", 403);
    if (guide.status !== "draft")
      fail("This guide has already been submitted.", "CONFLICT", 409);
    validateCoordinates(guide.entranceLocation);
    text(guide.title, "Guide title", 120);
    if (guide.steps.length < 1 || guide.steps.length > 5)
      fail("Include one to five photo steps.");
    guide.steps.forEach((step) => {
      if (!step.image) fail("Every step needs a photo.");
      text(step.caption, "Step instruction or caption", 1000);
    });
    this.commit((state) => {
      const version = state.guides.find((item) => item.id === versionId)!;
      version.status = "pending";
      version.confirmations = [author.id];
    });
    return this.guide(versionId);
  }
  confirmGuide(versionId: string): void {
    const user = this.account(true);
    const guide = this.guide(versionId);
    this.unblocked(guide.guideId);
    validateCoordinates(guide.entranceLocation);
    if (guide.confirmations.includes(user.id)) return;
    if (guide.status !== "pending")
      fail("This version is no longer awaiting confirmation.", "CONFLICT", 409);
    this.commit((state) => {
      const version = state.guides.find((item) => item.id === versionId)!;
      version.confirmations.push(user.id);
      if (version.confirmations.length >= 3) {
        state.guides.forEach((other) => {
          if (
            other.facilityId === version.facilityId &&
            other.status === "published"
          )
            other.status = "superseded";
        });
        version.status = "published";
        version.publishedAt = this.now().toISOString();
      }
    });
  }
  reportGuide(versionId: string, reason: string, description: string): void {
    const user = this.account(true);
    const guide = this.guide(versionId);
    if (guide.status !== "published")
      fail("Only a published guide can be reported.", "CONFLICT", 409);
    const report = {
      id: id("report"),
      versionId,
      reporterId: user.id,
      reason: text(reason, "Report reason", 120),
      description: text(description, "Description", 2000, false),
      status: "open" as const,
      createdAt: this.now().toISOString(),
    };
    this.commit((state) => {
      state.reports.push(report);
    });
  }
  moderate(
    reportId: string,
    action: "remove" | "dismiss",
    reason: string,
  ): void {
    const staff = this.account(true);
    if (staff.role !== "staff")
      fail("Staff access is required for moderation.", "FORBIDDEN", 403);
    const report = this.state.reports.find((item) => item.id === reportId);
    if (!report) fail("This report could not be found.", "NOT_FOUND", 404);
    if (report.status !== "open")
      fail("This report has already been reviewed.", "CONFLICT", 409);
    if (action !== "remove" && action !== "dismiss")
      fail("Choose remove or dismiss.");
    const decision = {
      staffId: staff.id,
      action,
      reason: text(reason, "Decision reason", 1000),
      at: this.now().toISOString(),
    };
    const guide = this.guide(report.versionId);
    this.commit((state) => {
      const target = state.reports.find((item) => item.id === reportId)!;
      target.status = action === "remove" ? "actioned" : "dismissed";
      target.decision = decision;
      if (action === "remove") {
        if (!state.blockedGuides.includes(guide.guideId))
          state.blockedGuides.push(guide.guideId);
        state.guides.forEach((version) => {
          if (version.guideId === guide.guideId) version.status = "removed";
        });
      }
    });
  }

  book(input: BookingInput): Booking {
    const user = this.account(true);
    const requestId = text(input.requestId, "Request identifier", 200);
    const existing = this.state.bookings.find(
      (booking) =>
        booking.requestId === requestId && booking.userId === user.id,
    );
    const startMs = Date.parse(input.start);
    if (
      !Number.isFinite(startMs) ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.start)
    )
      fail("Choose a valid start time with its time zone.");
    const canonicalStart = new Date(startMs).toISOString();
    if (existing) {
      if (
        existing.facilityId !== input.facilityId ||
        existing.start !== canonicalStart ||
        Date.parse(existing.end) - Date.parse(existing.start) !==
          input.duration * 60_000
      )
        fail(
          "This request identifier was used for a different reservation.",
          "CONFLICT",
          409,
        );
      return existing;
    }
    const room = facilities.find(
      (facility) => facility.id === input.facilityId,
    );
    if (!room || room.type !== "meeting_room")
      fail("Choose a meeting room to reserve.");
    if (![30, 60, 90, 120].includes(input.duration))
      fail("Choose a duration of 30, 60, 90, or 120 minutes.");
    const start =
      Temporal.Instant.from(canonicalStart).toZonedDateTimeISO(TIME_ZONE);
    const endMs = startMs + input.duration * 60_000;
    const end = Temporal.Instant.from(
      new Date(endMs).toISOString(),
    ).toZonedDateTimeISO(TIME_ZONE);
    const now = this.now();
    if (startMs <= now.getTime()) fail("Choose a start time in the future.");
    if (!withinBookingHorizon(start.toPlainDate().toString(), now))
      fail("Choose a date within the next 14 days.");
    if (
      start.minute % 30 !== 0 ||
      start.second !== 0 ||
      start.millisecond !== 0
    )
      fail("Reservations must start on a 30-minute boundary.");
    if (
      start.hour + start.minute / 60 < room.hours.open ||
      end.toPlainDate().toString() !== start.toPlainDate().toString() ||
      end.hour + end.minute / 60 > room.hours.close
    )
      fail("This reservation must fit within the room opening hours.");
    if (
      this.state.bookings.some(
        (booking) =>
          booking.facilityId === room.id &&
          booking.status === "confirmed" &&
          Date.parse(booking.start) < endMs &&
          Date.parse(booking.end) > startMs,
      )
    )
      fail(
        "This room is already reserved during that time. Choose another available slot.",
        "CONFLICT",
        409,
      );
    const booking: Booking = {
      id: id("booking"),
      facilityId: room.id,
      userId: user.id,
      start: canonicalStart,
      end: new Date(endMs).toISOString(),
      status: "confirmed",
      requestId,
      createdAt: now.toISOString(),
    };
    this.commit((state) => {
      state.bookings.push(booking);
    });
    return this.state.bookings.find((item) => item.id === booking.id)!;
  }
  cancelBooking(bookingId: string): void {
    const user = this.account();
    const booking = this.state.bookings.find((item) => item.id === bookingId);
    if (!booking) fail("This booking could not be found.", "NOT_FOUND", 404);
    if (booking.userId !== user.id)
      fail("You can only cancel your own reservations.", "FORBIDDEN", 403);
    if (booking.status === "cancelled") return;
    if (Date.parse(booking.start) <= this.now().getTime())
      fail(
        "A reservation can only be cancelled before it starts.",
        "CONFLICT",
        409,
      );
    this.commit((state) => {
      state.bookings.find((item) => item.id === bookingId)!.status =
        "cancelled";
    });
  }
  reset(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      fail("Browser storage could not be reset.", "STORAGE_ERROR", 507);
    }
    this.state = freeze(initialState());
    this.listeners.forEach((listener) => listener());
  }
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(
            new DomainError("INVALID_IMAGE", "This image could not be read."),
          );
    reader.onerror = () =>
      reject(
        new DomainError(
          "INVALID_IMAGE",
          "This image could not be read. Try again.",
        ),
      );
    reader.onabort = () =>
      reject(
        new DomainError(
          "INVALID_IMAGE",
          "Image upload was interrupted. Try again.",
        ),
      );
    reader.readAsDataURL(file);
  });
}
function validateSignature(dataUrl: string, mime: string): void {
  let bytes: string;
  try {
    bytes = atob(dataUrl.split(",")[1] ?? "");
  } catch {
    fail("This file is not a valid image.");
  }
  const valid =
    mime === "image/png"
      ? bytes.startsWith("\x89PNG\r\n\x1a\n")
      : mime === "image/jpeg"
        ? bytes.startsWith("\xff\xd8\xff")
        : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
  if (!valid)
    fail(
      "The image content does not match its file type. Choose a valid JPEG, PNG, or WebP photo.",
      "INVALID_IMAGE",
    );
}
async function decodeImage(file: File, source: string): Promise<string> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      try {
        return normalizeImage(
          bitmap,
          bitmap.width,
          bitmap.height,
          file.size,
          source,
        );
      } finally {
        bitmap.close();
      }
    } else {
      const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image could not be decoded"));
        image.src = source;
      });
      return normalizeImage(
        decoded,
        decoded.naturalWidth,
        decoded.naturalHeight,
        file.size,
        source,
      );
    }
  } catch {
    fail(
      "This image could not be opened. Choose another JPEG, PNG, or WebP photo.",
      "INVALID_IMAGE",
    );
  }
}
function normalizeImage(
  image: CanvasImageSource,
  width: number,
  height: number,
  sourceBytes: number,
  source: string,
): string {
  if (width <= 0 || height <= 0) fail("This image has no visible pixels.");
  if (Math.max(width, height) <= 1600 && sourceBytes <= 512 * 1024)
    return source;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context)
    fail(
      "Your browser could not prepare this large image. Try a smaller photo.",
    );
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const normalized = canvas.toDataURL("image/webp", 0.82);
  if (!/^data:image\/(webp|png);base64,/.test(normalized))
    fail("Your browser could not prepare this image.");
  return normalized;
}

function validStoredState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const state = value as DemoState;
  if (
    !Number.isInteger(state.revision) ||
    state.revision < 0 ||
    !["users", "guides", "reports", "bookings", "media", "blockedGuides"].every(
      (key) =>
        Array.isArray((state as unknown as Record<string, unknown>)[key]),
    )
  )
    return false;
  if (
    !state.users.every(
      (user) =>
        user &&
        typeof user.id === "string" &&
        typeof user.email === "string" &&
        typeof user.name === "string" &&
        typeof user.verified === "boolean" &&
        ["user", "staff"].includes(user.role),
    )
  )
    return false;
  if (
    state.currentUserId !== null &&
    !state.users.some((user) => user.id === state.currentUserId)
  )
    return false;
  if (
    !state.guides.every(
      (guide) =>
        guide &&
        typeof guide.id === "string" &&
        typeof guide.guideId === "string" &&
        typeof guide.title === "string" &&
        facilities.some((f) => f.id === guide.facilityId) &&
        Array.isArray(guide.steps) &&
        guide.steps.every(
          (step) =>
            step &&
            typeof step.image === "string" &&
            typeof step.caption === "string" &&
            typeof step.alt === "string",
        ) &&
        Array.isArray(guide.confirmations) &&
        guide.confirmations.every((userId) => typeof userId === "string") &&
        ["draft", "pending", "published", "superseded", "removed"].includes(
          guide.status,
        ),
    )
  )
    return false;
  if (
    !state.bookings.every(
      (booking) =>
        booking &&
        typeof booking.id === "string" &&
        typeof booking.requestId === "string" &&
        typeof booking.userId === "string" &&
        facilities.some((f) => f.id === booking.facilityId) &&
        Number.isFinite(Date.parse(booking.start)) &&
        Number.isFinite(Date.parse(booking.end)) &&
        ["confirmed", "cancelled"].includes(booking.status),
    )
  )
    return false;
  if (
    !state.media.every(
      (media) =>
        media &&
        typeof media.id === "string" &&
        typeof media.ownerId === "string" &&
        typeof media.filename === "string" &&
        typeof media.image === "string" &&
        IMAGE_TYPES.includes(media.mime) &&
        media.size > 0 &&
        media.size <= MAX_IMAGE_BYTES,
    )
  )
    return false;
  if (
    !state.reports.every(
      (report) =>
        report &&
        typeof report.id === "string" &&
        typeof report.versionId === "string" &&
        typeof report.reason === "string" &&
        typeof report.description === "string" &&
        ["open", "dismissed", "actioned"].includes(report.status),
    )
  )
    return false;
  return state.blockedGuides.every((guideId) => typeof guideId === "string");
}
