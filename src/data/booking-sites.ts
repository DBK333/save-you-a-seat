/** Curated official destinations, checked 30 September 2026. These are services,
 * not individual rooms; never use these records to generate local reservations. */
export const bookingSites = [
  {
    id: "unimelb-dibs",
    countryCode: "AU",
    area: "unimelb",
    kind: "booking",
    name: "Library study rooms",
    provider: "University of Melbourne · DiBS",
    description:
      "Find a study room for your next group session. Choose your library, room and time in the University's booking service.",
    eligibility:
      "University account required. For student and staff university-related work; provider limits apply.",
    action: "Open DiBS",
    url: "https://go.unimelb.edu.au/dibs",
    sourceUrl:
      "https://library.unimelb.edu.au/services/book-a-room-or-computer",
    status: "Check room slots with the provider",
  },
  {
    id: "unimelb-teaching",
    countryCode: "AU",
    area: "unimelb",
    kind: "booking",
    name: "Teaching & activity spaces",
    provider: "University of Melbourne · Venue Management",
    description:
      "Find the official process for classrooms, lecture theatres and student-club activities, including TE Reserve.",
    eligibility:
      "Staff and eligible registered student-club executives. Teaching takes priority; check the booking rules first.",
    action: "View teaching-space bookings",
    url: "https://services.unimelb.edu.au/venuehire/home/booking-rooms-for-your-ad-hoc-booking-or-student-club-activity",
    sourceUrl: "https://services.unimelb.edu.au/venuehire/home/rooms",
    status: "Check room slots with the provider",
  },
  {
    id: "unimelb-library-busyness",
    countryCode: "AU",
    area: "unimelb",
    kind: "occupancy",
    name: "Library busyness",
    provider: "University of Melbourne · Library",
    description:
      "See the University's library occupancy information before you visit. This counts people, not free seats or reservable rooms.",
    eligibility:
      "Public information. This does not reserve a seat or show available room slots.",
    action: "Check library busyness",
    url: "https://library.unimelb.edu.au/services/find-a-seat",
    sourceUrl: "https://library.unimelb.edu.au/services/find-a-seat",
    status: "Occupancy information only",
  },
] as const;
