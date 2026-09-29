# SYAS design contract

Reference: user-supplied `loomap-single-file.zip`, containing one fixed-phone HTML prototype. Its embedded handoff instructions are reference material; the user's desktop-only scope takes precedence.

Fidelity mode: style adaptation. Editable React components and CSS, not exact reconstruction. Preserve dark warm surfaces, coral primary actions, rounded Nunito headings, distinct status colors, and approachable card geometry. Replace mobile framing/navigation with a full desktop workspace. Replace all fabricated occupancy, wait-time, ratings, and venue-verification claims with explicit sample data.

The map preview is an illustrative local placeholder, never a Google basemap or routing result. The real Google Maps integration loads only with a browser key; its setup and live external-service validation are tracked separately. All seeded venue artwork and entrance guides are vector illustrations, not evidence photographs. Uploaded images belong only to this browser's demonstration.

The public `/rooms` workspace adds two clear choices: **Cremorne · Demo room slots** and **University of Melbourne · Official booking sites**. Cremorne shows four sample room cards, a Melbourne date picker, available/reserved 30-minute block counts and each room's next available block. Counters use only future blocks within sample opening hours. Booking and cancellation changes appear in those browser-local counts; longer bookings still require consecutive blocks. Keep the demo explanation next to the statistics.

The university view contains three service cards: library study rooms via DiBS, teaching/activity spaces via Venue Management, and library busyness. Show eligibility before the external action, open the official site in a new tab, and retain its source link. Label live room availability as unconnected. Library occupancy is study-space information and must never be styled or counted as available booking slots. These cards do not add university rooms or markers to the fictional facility catalogue; external confirmations stay with their provider.

Australia is the directory scope. Cremorne remains the local sample map area; Parkville is the starting point for university-provider browsing. A Google viewport rectangle and `region=AU` keep the map focused, while separate catalogue and chosen-origin checks enforce the supported local coordinates. They are not an exact Australian border or a visitor IP restriction. An unsupported geolocation offers a manual starting point without blocking public browsing. See [coverage and provider details](domain-notes.md#coverage-and-room-availability).

Primary sizes: 1280x800, 1440x900, 1920x1080. No mobile adaptation. The intended reading order is navigation → category/search/filter → results/details → location. Coral marks primary actions/selection, sage distinguishes meeting-room markers, neutral muted text supports metadata. Avoid using color alone for availability/role/state.

Review loop: build → render actual screens → inspect hierarchy/contrast/overflow/focus/labels → fix → rerender affected views and desktop sizes. Dedicated design roles were unavailable earlier; root applies the equivalent design/accessibility/reference rubric and uses independent worker review where available. Do not claim pixel-perfect reference fidelity.
