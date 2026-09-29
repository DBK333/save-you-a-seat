# Save you a Seat · SYAS

A desktop demonstration for finding toilets, reserving sample meeting rooms, and sharing photo entrance guides around **Cremorne, Melbourne**, with official **University of Melbourne** booking links. The current directory and supported use area are in Australia.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
if [ ! -e .env ]; then cp .env.example .env; fi
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). The desktop layouts target 1280×800, 1440×900, and 1920×1080. Mobile is intentionally outside this delivery.

Google Maps can be added later. Without a key, the app labels its **illustrative preview** and keeps the directory available. Use the [hidden-prompt key command](docs/infrastructure.md#save-or-change-the-google-maps-key) to set `VITE_GOOGLE_MAPS_API_KEY` without putting it in shell history, then restart Vite. For a hosted site, rebuild and republish. A browser key is visible to visitors: restrict it to Maps JavaScript API and your approved websites. Google Maps walking links do not require a key.

`.gitignore` excludes `.env`, `.env.local`, `.env.production`, all other `.env.*` files, repository-local `.aws/` credentials, build output, and deployment artifacts. The key-free `.env.example` remains trackable. Ignoring a file does not remove a previously committed copy; see the [Git checks](docs/infrastructure.md#git-ignore-checks).

## What this release does

- Category, search, accessibility, opening-hours, capacity and equipment discovery; place selection and approximate nearest-toilet ranking from a chosen location.
- Walking directions to the entrance coordinate, with a fallback to the building coordinate.
- Separate user and staff sign-in screens, registration, verification, and recovery demonstration.
- Free meeting-room bookings in 30-minute blocks, up to two hours, within the next 14 days, and cancellation before a booking starts.
- A public **Room availability** page (`/rooms`): four sample Cremorne room cards and future available/reserved half-hour counts for a selected Melbourne date. Demo confirmations and cancellations update those counts.
- A University of Melbourne tab with official DiBS and teaching-space booking links, plus library busyness information. Live university room slots are not connected; external bookings remain with their provider.
- Photo-guide drafts, submission, ordered image steps, immutable submitted versions, and publication after the author plus two other verified demo accounts confirm.
- Reports that leave content visible; staff can dismiss a report or remove a guide and block its republication.
- Persistent browser-local sample state, with explicit demo labels throughout.

Use **Alex**, **Jamie**, and **Sam** to demonstrate three different community accounts. **Taylor** is available from Staff sign-in. For newly registered demo accounts, the displayed verification code is `314159`. Demo sign-in selects a profile; it does not authenticate a real identity. Passwords are not stored and no verification/recovery emails are sent.

All map listings and Cremorne room cards are fictional sample facilities at approximate Cremorne coordinates. Seeded venue pictures and entrance guides are illustrations, not photographs of verified venues. A demo reservation does not reserve a real room. Community confirmations count accounts, not proven unique people.

Australia-only scope means a curated directory and supported location area, not IP blocking. Local facilities must carry `AU` / `cremorne` metadata and valid Cremorne coordinates. A chosen starting location must be within the supported Melbourne window covering Cremorne and Parkville; unsupported locations lead to manual location selection. The Google viewport uses an Australian bounding rectangle, which is not an exact country border.

University links are official services, not invented local room listings. Start with Parkville in the provider's location selector; university-wide sites also cover other campuses. DiBS requires a university account, and teaching-space access has staff/club eligibility rules. Library busyness counts people, not free seats or reservable rooms. See [provider sources and availability limits](docs/domain-notes.md#official-university-booking-links).

## Test and build

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:infra
```

The first two commands cover TypeScript, the production bundle, behavior and contract tests. Playwright tests run a local Vite server automatically. Infrastructure checks need the native tools described in [the infrastructure guide](docs/infrastructure.md).

Actual RED/GREEN output is under `docs/evidence/`. Browser traces and failure screenshots go to ignored `test-results/` and `playwright-report/`; visual-review screenshots go to ignored `output/playwright/`.

The local `.env` explicitly selects `VITE_DATA_MODE=demo`. A production build without a declared mode shows a configuration error. `VITE_DATA_MODE=api` also fails closed in this release: the later Python/Cognito adapter is deliberately not substituted with demo authentication.

## Backend and infrastructure boundary

This release includes the [versioned OpenAPI contract](contracts/openapi.json), example payloads, native CloudFormation templates, Guard rules/tests, deployment-preparation scripts, and architecture/runbook documentation. The Python backend and cloud deployment are the **next stage**. There is no placeholder backend presented as working infrastructure.

Target architecture: the static React bundle is served through **CloudFront → private frontend S3**, protected by Origin Access Control. The browser calls the separate **API Gateway → Python FastAPI on Lambda → DynamoDB** backend, with Cognito accounts, a separate private S3 entrance-photo bucket, and CloudWatch. Regional resources default to Sydney (`ap-southeast-2`); CloudFront is global.

The frontend demo can be published independently of the missing Python backend: bootstrap the hosting resources, build with `VITE_DATA_MODE=demo`, then use `publish-frontend` to upload the bundle and invalidate CloudFront. Start with [AWS prerequisites and account selection](docs/infrastructure.md#before-your-first-deployment), then follow the [ordered deployment commands](docs/infrastructure.md#first-time-hosting-and-demo-publishing). To stop the deployment later, use the [stack deletion commands](docs/infrastructure.md#delete-the-stacks), followed by optional [retained-data cleanup](docs/infrastructure.md#optional-permanent-cleanup-of-retained-data). No cloud deployment or deletion was performed here. If an older Amplify bootstrap already exists, use the migration section before changing it.

Browser-local tests do not establish cross-user transaction safety, Cognito permissions, S3 access controls, or AWS deployment health. Those require the later cloud integration tests in the runbook. Current verification status is recorded in [delivery evidence](docs/delivery.md).

## Source and design

The provided `loomap-single-file.zip` is the visual starting point. The app adapts its warm dark/coral visual language to desktop and both facility types. Embedded handoff instructions in that archive are treated as source material; the user's desktop-only scope takes precedence. See [design decisions](docs/design.md).
