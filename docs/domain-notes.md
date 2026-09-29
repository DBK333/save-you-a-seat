# Demo behavior and TDD record

The first delivery uses `DemoService` behind the `AppService` interface. It is an explicitly browser-local demonstration, not a backend or authentication boundary. Users, photographs, guides, reports, and reservations stay in this browser. Clearing/resetting browser storage removes those demo changes. No real venue is booked, no email is sent, and no passwords enter the service or storage.

## Decisions implemented

- `getSnapshot` returns a deeply frozen, referentially stable snapshot until a mutation commits. Subscribers are notified after the mutation is saved. Persistence failure leaves the previous snapshot unchanged. Malformed or incompatible saved state starts a fresh demo; `reset()` clears the saved demo and restores sample fixtures.
- Data is saved under `syas.demo.v1`. A supplied `Storage` double or `null`, fixed clock, and partial initial state make tests deterministic. Mutations are synchronous within one service instance. Cross-tab or cross-browser consistency is not guaranteed; DynamoDB transactions and deployed concurrency tests remain required.
- Public registration creates an unverified ordinary account. Verification uses the clearly labelled demo code `314159`. Recovery validates the address without claiming to send an email. Staff selection is only a demonstration of role-dependent UI; real permissions must come from Cognito/API authorization.
- Booking start times are canonical UTC ISO timestamps, with half-hour alignment and elapsed durations of 30, 60, 90, or 120 minutes. Valid local dates include today through today plus 14 calendar days; starts must be strictly in the future and the whole booking must fit the room's hours. `Australia/Melbourne` calendar conversion rejects nonexistent and ambiguous daylight-saving local times.
- Overlaps use half-open intervals, allowing adjacent bookings. A request ID is scoped to its account and returns the same booking for identical retries, including after cancellation. Reusing it with different input is a conflict. Cancellation checks ownership and start time; an already-cancelled booking is a safe no-op, so it cannot affect a later reservation.
- Drafts may be incomplete. Submission requires a title and one to five photos with written instructions. It freezes that version, with the verified author's confirmation counted once. Two additional distinct verified accounts publish it. Publication supersedes the previous published guide for the facility. A revision carries no previous confirmations.
- Photo input is limited to JPEG, PNG, and WebP, up to 5 MiB each. Validation checks the signature and browser decoder, then normalizes large photos to a maximum 1600-pixel edge using WebP when supported. This reduces storage pressure but cannot guarantee unlimited uploads: browser quota errors remain recoverable. `Media.size` records source size; `Media.mime` describes the stored representation. Unit tests replace the image decoder; real-file browser upload checks are a separate integration gate.
- Uploads belong to the account that started and completed them. Other accounts cannot attach those uploads, including through someone else's draft. Fixed sample illustrations can be retained in their existing guide revisions; SVG user uploads are rejected. Media and guide image strings are immutable snapshots. Orphaned demo uploads are cleared by a full demo reset.
- Reporting leaves publication intact. Staff dismissal records a reason; removal marks every version in that guide lineage removed and permanently blocks new revisions/submission/confirmation for its guide ID. This local state transition is not proof of a race-free cloud transaction.
- `DomainError` carries `code`, `message`, and HTTP-like `status`: 401 identity, 403 permission/verification, 404 missing resource, 409 state conflict, 422 invalid input, or 507 browser storage failure. A future HTTP adapter must map the OpenAPI response format at the boundary.

## Coverage and room availability

`src/domain/coverage.ts` separates three different limits. All bounds are inclusive latitude/longitude rectangles:

| Purpose                                                     | Latitude             | Longitude            |
| ----------------------------------------------------------- | -------------------- | -------------------- |
| Local facility catalogue                                    | -37.8343 to -37.8235 | 144.9878 to 145.0035 |
| Accepted starting location, covering Cremorne and Parkville | -37.85 to -37.78     | 144.94 to 145.02     |
| Google map viewport                                         | -44 to -10           | 112 to 154           |

Discovery and local availability reject malformed facilities, entries without `countryCode: "AU"` and `area: "cremorne"`, or location/entrance coordinates outside the Cremorne bounds. Geolocation and map-selected starting points must fall inside the separate Melbourne support window; unsupported locations offer manual selection. Public browsing does not depend on visitor IP or device location. Google's `region=AU` and strict viewport bounds support the map presentation, but a rectangle is not an exact Australian border. This scope does not imply a nationwide facility dataset.

The public `/rooms` page uses the four local sample meeting rooms. `roomSlotSummary` derives available and reserved **30-minute blocks**, plus the next available start, from room hours and this browser's confirmed reservations. Only starts strictly after the current time on the selected `Australia/Melbourne` date count. Today through today plus 14 local calendar days is valid; other dates produce no slots. A 60-minute reservation occupies two blocks, and counts alone do not guarantee enough consecutive blocks for a longer booking. Cancellation releases future blocks in the demo. The page refreshes its clock every 30 seconds and responds to service state changes. These are computed demo counters, not a live provider feed, occupancy count, or number of separate bookings.

## Official university booking links

`src/data/booking-sites.ts` holds curated Australian service links, separate from `Facility` records. The university tab points users to Parkville in the provider's location selector, but the linked university-wide websites may list other campuses. No university room inventory, coordinates, or live slot totals are inferred from these links. External bookings do not appear in SYAS My bookings.

Sources checked 30 September 2026:

| Card / action                                                 | Official destination and eligibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library study rooms / **Open DiBS**                           | [DiBS](https://go.unimelb.edu.au/dibs), linked by the [library booking hub](https://library.unimelb.edu.au/services/book-a-room-or-computer). University students/staff doing university-related work; the hub publishes two hours per person per day. [Booking guidance](https://library.unimelb.edu.au/services/book-a-room-or-computer/bookit) documents university SSO. Provider rules apply.                                                                                                   |
| Teaching & activity spaces / **View teaching-space bookings** | [Venue Management booking process](https://services.unimelb.edu.au/venuehire/home/booking-rooms-for-your-ad-hoc-booking-or-student-club-activity), including TE Reserve. [Eligibility](https://services.unimelb.edu.au/venuehire/home/rooms) covers staff and club executives affiliated with UMSU, GSA or University Sport using their registered student email. Other students must request through their department or use the external process, which can charge fees. Teaching takes priority. |
| Library busyness / **Check library busyness**                 | [Find study space](https://library.unimelb.edu.au/services/find-a-seat). Public occupancy information counts people, not seats physically available or reservable room slots. It does not make a booking.                                                                                                                                                                                                                                                                                           |

No documented public live room-slot API was identified in the official material reviewed. This is not a claim that no integration could exist. The application does not call provider booking systems, scrape authenticated calendars, retrieve current room slots, or imply provider confirmation. Its status is **Live availability is not connected**; users check current availability, eligibility and confirmation on the official website. Google's basemap does not supply this room availability data.

## Executed evidence

Tests were written against importable conservative scaffolds before implementation. The captured RED run contains direct behavior assertions, not missing imports, dependency errors, or placeholder exceptions.

| Evidence                            | Actual result                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `evidence/domain-red.txt`           | 37 failing behavior assertions and 1 passing fail-closed availability test; 38 total                              |
| `evidence/domain-hardening-red.txt` | 2 new failing assertions for photo normalization and foreign-draft upload reuse; existing 28 service tests passed |
| `evidence/domain-green.txt`         | 40 passing domain/service tests after implementation                                                              |

Command: `npm test -- src/domain/rules.test.ts src/services/demo.test.ts`.

The tested behaviors cover combined discovery filters, Google walking URLs, geographic distance, Melbourne/DST conversion, availability, account and verification flows, subscribers/persistence/reset, upload validation and account switching, immutable guide submission and independent revisions, distinct confirmations, reports/takedown, reservation conflicts/retries/ownership/cancellation, and source-image normalization. `npx tsc --noEmit` also passed during integration.

Python implementation, AWS identity/permissions, object immutability, deployed concurrency, and real email delivery are not established by these tests and remain in the separate backend/cloud stage.
