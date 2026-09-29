import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Armchair,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  GraduationCap,
  Users,
} from "lucide-react";
import { facilities } from "../data/fixtures";
import { bookingSites } from "../data/booking-sites";
import {
  filterFacilities,
  formatLocal,
  melbourneDate,
  roomSlotSummary,
  withinBookingHorizon,
} from "../domain/rules";
import { useNow, useSession } from "./ui";
import "./rooms.css";

export default function RoomAvailability() {
  const { state } = useSession();
  const [params, setParams] = useSearchParams();
  const area = params.get("area") === "unimelb" ? "unimelb" : "cremorne";
  const now = useNow();
  const [date, setDate] = useState(() => melbourneDate());
  const today = melbourneDate(now);
  const max = new Date(`${today}T12:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 14);
  const validDate = withinBookingHorizon(date, now);
  const rooms = filterFacilities(facilities, { type: "meeting_room" }, now);
  const summaries = rooms.map((room) => ({
    room,
    slots: roomSlotSummary(room, date, state.bookings, now),
  }));
  const totalFree = summaries.reduce(
    (sum, { slots }) => sum + slots.available,
    0,
  );
  const totalReserved = summaries.reduce(
    (sum, { slots }) => sum + slots.reserved,
    0,
  );
  function chooseArea(value: string) {
    setParams({ area: value });
  }
  return (
    <main className="page room-availability-page">
      <Link className="text-link room-back" to="/?type=meeting_room">
        <ArrowLeft size={15} /> Back to Explore
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            AUSTRALIA · CREMORNE + UNIVERSITY OF MELBOURNE
          </span>
          <h1>
            Room availability<span className="coral">.</span>
          </h1>
          <p className="muted">A little space for your next big idea.</p>
        </div>
        <span className="room-page-icon">
          <Armchair size={34} />
        </span>
      </div>
      <div className="room-area-switch" aria-label="Room area">
        <button
          aria-pressed={area === "cremorne"}
          onClick={() => chooseArea("cremorne")}
        >
          <Armchair size={17} />
          <span>
            Cremorne<small>Demo room slots</small>
          </span>
        </button>
        <button
          aria-pressed={area === "unimelb"}
          onClick={() => chooseArea("unimelb")}
        >
          <GraduationCap size={19} />
          <span>
            University of Melbourne<small>Official booking sites</small>
          </span>
        </button>
      </div>
      {area === "cremorne" ? (
        <>
          <section
            className="slot-overview"
            aria-label="Demo availability summary"
          >
            <div className="slot-heading">
              <span className="badge green-badge">LOCAL DEMO</span>
              <h2>Your room options</h2>
              <p>
                Browser-local demo availability. No real venue has been
                contacted.
              </p>
            </div>
            <div className="slot-totals">
              <div>
                <strong>{rooms.length}</strong>
                <span>sample rooms</span>
              </div>
              <div>
                <strong>{totalFree}</strong>
                <span>available blocks</span>
              </div>
              <div>
                <strong>{totalReserved}</strong>
                <span>reserved blocks</span>
              </div>
            </div>
            <label className="slot-date">
              <span>
                <CalendarDays size={15} /> Date in Melbourne
              </span>
              <input
                aria-label="Room availability date"
                type="date"
                min={today}
                max={max.toISOString().slice(0, 10)}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </section>
          {!validDate && (
            <p className="error-box" role="alert">
              Choose a date from today through the next 14 days.
            </p>
          )}
          <p className="slot-explanation">
            Each block is 30 minutes. Counts include only future blocks on this
            date, within sample opening hours. Longer bookings need consecutive
            blocks.
          </p>
          <div className="room-status-grid">
            {summaries.map(({ room, slots }) => (
              <article
                className="room-status-card"
                key={room.id}
                aria-label={room.name}
              >
                <img
                  src={room.image}
                  alt="Illustration of a fictional demo room"
                />
                <div className="room-status-body">
                  <span className="eyebrow">CREMORNE · SAMPLE ROOM</span>
                  <h2>{room.name}</h2>
                  <p className="room-status-meta">
                    <Users size={14} /> {room.capacity} people <span>·</span>{" "}
                    {room.hours.open}:00–{room.hours.close}:00
                  </p>
                  <div className="room-slot-count">
                    <strong>{slots.available} available blocks</strong>
                    <span>{slots.reserved} reserved blocks</span>
                  </div>
                  <p className="next-slot">
                    <Clock3 size={14} />{" "}
                    {slots.nextStart
                      ? `Next: ${formatLocal(slots.nextStart)}`
                      : "No remaining blocks for this date"}
                  </p>
                  <Link
                    className="button secondary full"
                    to={`/?place=${room.id}${validDate ? `&date=${date}` : ""}`}
                  >
                    View room &amp; reserve demo <ArrowUpRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="room-source-note">
            These fictional Cremorne rooms have no official external booking
            page. For real university rooms, select University of Melbourne
            above.
          </p>
        </>
      ) : (
        <>
          <section className="provider-intro">
            <div>
              <span className="badge green-badge">OFFICIAL SOURCES</span>
              <h2>Book with the University.</h2>
              <p>
                Live availability is not connected. Check current room slots,
                eligibility and confirmation on the provider’s website.
              </p>
            </div>
            <ExternalLink size={26} />
          </section>
          <div className="provider-grid">
            {bookingSites
              .filter((site) => site.countryCode === "AU" && site.area === area)
              .map((site) => (
                <article
                  className="provider-card"
                  key={site.id}
                  aria-label={site.name}
                >
                  <span className="provider-kind">
                    {site.kind === "booking"
                      ? "ROOM BOOKING"
                      : "STUDY SPACE INFORMATION"}
                  </span>
                  <h2>{site.name}</h2>
                  <span className="provider-name">{site.provider}</span>
                  <p>{site.description}</p>
                  <div className="provider-eligibility">{site.eligibility}</div>
                  <span className="provider-status">
                    <span className="status-dot" />
                    {site.status}
                  </span>
                  <a
                    className="button primary full"
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {site.action}
                    <ArrowUpRight size={16} />
                  </a>
                  <a
                    className="provider-source"
                    href={site.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Official information <ArrowUpRight size={12} />
                  </a>
                </article>
              ))}
          </div>
          <p className="room-source-note">
            Start with Parkville in the provider’s location selector.
            University-wide websites may also list other campuses. External
            bookings stay with that service and won’t appear in SYAS My
            bookings. Links checked 30 September 2026.
          </p>
        </>
      )}
    </main>
  );
}
