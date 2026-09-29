export type FacilityType = "toilet" | "meeting_room";
export interface Coordinates {
  lat: number;
  lng: number;
}
export interface Facility {
  id: string;
  countryCode: "AU";
  area: "cremorne";
  name: string;
  type: FacilityType;
  address: string;
  description: string;
  location: Coordinates;
  entranceLocation?: Coordinates;
  access: string;
  floor: string;
  amenities: string[];
  capacity?: number;
  hours: { open: number; close: number };
  image: string;
  sample: true;
}
export interface User {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  role: "user" | "staff";
}
export interface GuideStep {
  id: string;
  caption: string;
  image: string;
  alt: string;
  mediaId?: string;
}
export interface GuideVersion {
  id: string;
  guideId: string;
  facilityId: string;
  authorId: string;
  title: string;
  steps: GuideStep[];
  entranceLocation?: Coordinates;
  status: "draft" | "pending" | "published" | "superseded" | "removed";
  confirmations: string[];
  createdAt: string;
  publishedAt?: string;
}
export interface Report {
  id: string;
  versionId: string;
  reporterId: string;
  reason: string;
  description: string;
  status: "open" | "dismissed" | "actioned";
  createdAt: string;
  decision?: {
    staffId: string;
    action: "remove" | "dismiss";
    reason: string;
    at: string;
  };
}
export interface Booking {
  id: string;
  facilityId: string;
  userId: string;
  start: string;
  end: string;
  status: "confirmed" | "cancelled";
  requestId: string;
  createdAt: string;
}
export interface Media {
  id: string;
  ownerId: string;
  image: string;
  filename: string;
  mime: string;
  size: number;
}
export interface DemoState {
  users: User[];
  currentUserId: string | null;
  guides: GuideVersion[];
  reports: Report[];
  bookings: Booking[];
  media: Media[];
  blockedGuides: string[];
  revision: number;
}
export interface GuideInput {
  facilityId: string;
  title: string;
  steps: GuideStep[];
  entranceLocation?: Coordinates;
  guideId?: string;
}
export interface BookingInput {
  facilityId: string;
  start: string;
  duration: number;
  requestId: string;
}
export interface FacilityFilters {
  type?: FacilityType | "all";
  query?: string;
  accessible?: boolean;
  openNow?: boolean;
  capacity?: number;
  equipment?: string;
}
export interface AppService {
  getSnapshot(): DemoState;
  subscribe(listener: () => void): () => void;
  login(userId: string): void;
  logout(): void;
  register(name: string, email: string): User;
  verify(email: string, code: string): void;
  recover(email: string): void;
  upload(file: File): Promise<Media>;
  saveDraft(input: GuideInput, draftId?: string): GuideVersion;
  submitGuide(versionId: string): GuideVersion;
  confirmGuide(versionId: string): void;
  reportGuide(versionId: string, reason: string, description: string): void;
  moderate(
    reportId: string,
    action: "remove" | "dismiss",
    reason: string,
  ): void;
  book(input: BookingInput): Booking;
  cancelBooking(bookingId: string): void;
  reset(): void;
}
