import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  LocateFixed,
  ArrowUpRight,
  ArrowRight,
  Accessibility,
  Armchair,
  Users,
  Clock3,
  X,
  ChevronRight,
  Check,
  Flag,
  Plus,
  DoorOpen,
  LoaderCircle,
  Toilet,
  Camera,
  ShieldCheck,
} from "lucide-react";
import type {
  Coordinates,
  Facility,
  FacilityFilters,
  GuideVersion,
} from "../domain/types";
import { facilities } from "../data/fixtures";
import { filterFacilities, distanceMeters, walkingUrl } from "../domain/rules";
import { isSupportedOrigin } from "../domain/coverage";
import { service } from "../services";
import { BookingDialog } from "./Bookings";
import MapCanvas from "./MapCanvas";
import { useNow, useSession, Modal, ErrorBox, Empty, message } from "./ui";

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { state, user } = useSession();
  const now = useNow();
  const [filters, setFilters] = useState<FacilityFilters>({
    type: params.get("type") === "meeting_room" ? "meeting_room" : "all",
  });
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [pickOrigin, setPickOrigin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [nearestRequested, setNearestRequested] = useState(false);
  const [booking, setBooking] = useState<Facility | null>(null);
  const [report, setReport] = useState<GuideVersion | null>(null);
  const selectedId = params.get("place");
  const selected =
    filterFacilities(facilities, {}).find((f) => f.id === selectedId) ?? null;
  const shown = useMemo(() => {
    const result = filterFacilities(facilities, filters, now);
    return origin
      ? result.sort(
          (a, b) =>
            distanceMeters(origin, a.location) -
            distanceMeters(origin, b.location),
        )
      : result;
  }, [filters, origin, now]);
  function select(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("place", id);
    else next.delete("place");
    setParams(next, { replace: true });
  }
  useEffect(() => {
    if (!nearestRequested || !origin) return;
    const nearest = shown[0];
    if (nearest) {
      select(nearest.id);
      setLocationNote(
        "Nearest matching toilet by approximate straight-line distance.",
      );
    } else {
      select(null);
      setLocationNote("No matching toilets. Try clearing a filter.");
    }
    setNearestRequested(false);
  }, [nearestRequested, origin, shown]);
  function nearestToilet() {
    setFilters({
      ...filters,
      type: "toilet",
      capacity: undefined,
      equipment: undefined,
    });
    select(null);
    setNearestRequested(true);
    if (!origin) locate();
  }
  function category(type: FacilityFilters["type"]) {
    setFilters({ ...filters, type, capacity: undefined, equipment: undefined });
    select(null);
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationNote(
        "Location is unavailable. Choose a starting point on the map.",
      );
      setPickOrigin(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const position = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (!isSupportedOrigin(position)) {
          setOrigin(null);
          setPickOrigin(true);
          setLocationNote(
            "You’re outside our Melbourne coverage. Choose a starting point near Cremorne or University of Melbourne on the map.",
          );
          return;
        }
        setOrigin(position);
        setLocationNote("Sorted by approximate straight-line distance.");
      },
      () => {
        setLocating(false);
        setPickOrigin(true);
        setLocationNote(
          "Location access is unavailable. Click the map to set a starting point.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  function authenticated(
    action: () => void,
    returnTo = `/?${params.toString()}`,
  ) {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (!user.verified) {
      navigate(
        `/verify?email=${encodeURIComponent(user.email)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }
    action();
  }
  const activeFilterCount =
    Number(!!filters.accessible) +
    Number(!!filters.openNow) +
    Number(!!filters.capacity) +
    Number(!!filters.equipment);
  return (
    <main className="explore-layout">
      <aside className="results-panel">
        {selected ? (
          <PlaceDetail
            facility={selected}
            onClose={() => select(null)}
            onBook={() => authenticated(() => setBooking(selected))}
            onReport={(g) => authenticated(() => setReport(g))}
            origin={origin}
          />
        ) : (
          <>
            <div className="discovery-heading">
              <div className="eyebrow">
                <span className="status-dot" />
                CREMORNE, MELBOURNE
              </div>
              <h1>
                Find your
                <br />
                kind of space<span className="coral">.</span>
              </h1>
              <p>A seat for your team. A stop for you.</p>
              <Link className="room-directory-link" to="/rooms">
                <Armchair size={17} />
                <span>
                  <strong>Room availability &amp; booking sites</strong>
                  <small>Cremorne demo slots · University of Melbourne</small>
                </span>
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="discovery-controls">
              <div className="category-switch" aria-label="Place category">
                <button
                  aria-pressed={filters.type === "all"}
                  className={filters.type === "all" ? "active" : ""}
                  onClick={() => category("all")}
                >
                  All places
                </button>
                <button
                  aria-pressed={filters.type === "meeting_room"}
                  className={filters.type === "meeting_room" ? "active" : ""}
                  onClick={() => category("meeting_room")}
                >
                  <Armchair size={15} />
                  Rooms
                </button>
                <button
                  aria-pressed={filters.type === "toilet"}
                  className={filters.type === "toilet" ? "active" : ""}
                  onClick={() => category("toilet")}
                >
                  <Toilet size={15} />
                  Toilets
                </button>
              </div>
              <label className="search-field">
                <Search size={18} />
                <span className="sr-only">Search places</span>
                <input
                  placeholder="Search places, streets…"
                  value={filters.query ?? ""}
                  onChange={(e) =>
                    setFilters({ ...filters, query: e.target.value })
                  }
                />
                {filters.query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setFilters({ ...filters, query: "" })}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <div className="filter-row">
                <button
                  className={`filter-chip ${filters.accessible ? "selected" : ""}`}
                  aria-pressed={!!filters.accessible}
                  onClick={() =>
                    setFilters({ ...filters, accessible: !filters.accessible })
                  }
                >
                  <Accessibility size={14} />
                  Accessible
                </button>
                <button
                  className={`filter-chip ${filters.openNow ? "selected" : ""}`}
                  aria-pressed={!!filters.openNow}
                  onClick={() =>
                    setFilters({ ...filters, openNow: !filters.openNow })
                  }
                >
                  <Clock3 size={13} />
                  Open now
                </button>
                <details className="filters-popover">
                  <summary
                    className={`filter-chip ${activeFilterCount ? "selected" : ""}`}
                  >
                    <SlidersHorizontal size={14} />
                    Filters
                    {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
                  </summary>
                  <div className="filters-content">
                    <div className="form-stack">
                      <label>
                        Minimum room capacity
                        <select
                          value={filters.capacity ?? ""}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              capacity: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            })
                          }
                        >
                          <option value="">Any size</option>
                          {[2, 4, 6, 8, 12].map((n) => (
                            <option value={n} key={n}>
                              {n}+ people
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Room equipment
                        <select
                          value={filters.equipment ?? ""}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              equipment: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">Any equipment</option>
                          {["Wi-Fi", "Screen", "Whiteboard"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="text-button"
                        onClick={() =>
                          setFilters({
                            type: filters.type,
                            query: filters.query,
                          })
                        }
                      >
                        Clear extra filters
                      </button>
                    </div>
                  </div>
                </details>
              </div>
              <button
                className="nearest-toilet-button"
                onClick={nearestToilet}
                disabled={locating}
              >
                <Toilet size={15} />
                <span>Find nearest toilet</span>
                {locating ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <ArrowRight size={14} />
                )}
              </button>
            </div>
            <div className="results-topline">
              <span>
                <strong>{shown.length}</strong> places to discover
              </span>
              <button
                onClick={locate}
                disabled={locating}
                className="location-button"
              >
                {locating ? (
                  <LoaderCircle size={13} className="spin" />
                ) : (
                  <LocateFixed size={13} />
                )}{" "}
                {origin ? "Nearest first" : "Near me"}
              </button>
            </div>
            {locationNote && (
              <div className="location-note">
                {locationNote}
                <button
                  onClick={() => {
                    setPickOrigin(true);
                    setLocationNote(
                      "Click the map to choose your starting point.",
                    );
                  }}
                >
                  Change starting point
                </button>
              </div>
            )}
            <div className="place-results">
              {shown.length === 0 ? (
                <Empty title="No places found.">
                  <p>Try a different search or clear a filter.</p>
                  <button
                    className="button secondary"
                    onClick={() => setFilters({ type: "all" })}
                  >
                    Clear filters
                  </button>
                </Empty>
              ) : (
                shown.map((f) => {
                  const guide = state.guides.some(
                    (g) => g.facilityId === f.id && g.status === "published",
                  );
                  return (
                    <button
                      className={`place-card ${selectedId === f.id ? "selected" : ""}`}
                      key={f.id}
                      onClick={() => select(f.id)}
                      aria-label={`View ${f.name}`}
                      aria-pressed={selectedId === f.id}
                    >
                      <span className="place-thumbnail">
                        <img src={f.image} alt="" />
                        <span
                          className={`type-icon ${f.type === "meeting_room" ? "room" : "loo"}`}
                        >
                          {f.type === "meeting_room" ? (
                            <Armchair size={12} />
                          ) : (
                            <Toilet size={12} />
                          )}
                        </span>
                      </span>
                      <span className="place-card-copy">
                        <span className="place-category">
                          {f.type === "meeting_room"
                            ? "MEETING ROOM"
                            : "TOILET"}
                          {origin && (
                            <span>
                              {formatDistance(
                                distanceMeters(origin, f.location),
                              )}{" "}
                              approx.
                            </span>
                          )}
                        </span>
                        <strong>{f.name}</strong>
                        <span className="place-address">
                          {f.address.replace(", Cremorne VIC", "")}
                        </span>
                        <span className="place-meta">
                          {f.type === "meeting_room" ? (
                            <>
                              <Users size={12} />
                              {f.capacity} people
                              <span className="meta-separator">·</span>Free to
                              book
                            </>
                          ) : (
                            <>
                              <Accessibility size={12} />
                              {f.amenities.includes("Accessible")
                                ? "Accessible"
                                : "Facilities"}
                              <span className="meta-separator">·</span>Free
                              entry
                            </>
                          )}
                        </span>
                        {guide && (
                          <span className="guide-available">
                            <Check size={11} />
                            Entrance guide
                          </span>
                        )}
                      </span>
                      <ChevronRight size={15} className="card-arrow" />
                    </button>
                  );
                })
              )}
            </div>
            <div className="results-footer">
              <span className="small-logo">syas</span>
              <span>Small stops. Better days.</span>
              <span className="tiny-status">LOCAL PREVIEW</span>
            </div>
          </>
        )}
      </aside>
      <section className="map-stage" aria-label="Cremorne places map">
        <MapCanvas
          facilities={shown}
          selectedId={selectedId}
          onSelect={select}
          origin={origin}
          onOriginChange={(coords) => {
            if (isSupportedOrigin(coords)) setOrigin(coords);
          }}
          pickOrigin={pickOrigin}
          onPickOriginDone={() => {
            setPickOrigin(false);
            setLocationNote("Sorted by approximate straight-line distance.");
          }}
        />
        {pickOrigin && (
          <div className="map-pick-note">
            Click the map to set your starting point.
            <button
              aria-label="Cancel choosing starting point"
              onClick={() => setPickOrigin(false)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </section>
      {booking && (
        <BookingDialog
          facility={booking}
          initialDate={params.get("date") ?? undefined}
          onClose={() => setBooking(null)}
        />
      )}{" "}
      {report && (
        <ReportDialog guide={report} onClose={() => setReport(null)} />
      )}
    </main>
  );
}
function formatDistance(m: number) {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toFixed(1)} km`;
}
function PlaceDetail({
  facility: f,
  onClose,
  onBook,
  onReport,
  origin,
}: {
  facility: Facility;
  onClose: () => void;
  onBook: () => void;
  onReport: (g: GuideVersion) => void;
  origin: Coordinates | null;
}) {
  const { state, user } = useSession();
  const guide = state.guides
    .filter((g) => g.facilityId === f.id && g.status === "published")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const myDraft = state.guides.find(
    (g) =>
      g.facilityId === f.id && g.authorId === user?.id && g.status === "draft",
  );
  return (
    <article className="place-detail">
      <div className="detail-cover">
        <img
          src={f.image}
          alt={`Illustration of ${f.name}; a fictional sample venue`}
        />
        <span className="badge sample-badge">SAMPLE PLACE</span>
        <button
          className="detail-close icon-button"
          onClick={onClose}
          aria-label="Close place details"
        >
          <X size={18} />
        </button>
        <span className="cover-category">
          {f.type === "meeting_room" ? (
            <Armchair size={14} />
          ) : (
            <Toilet size={14} />
          )}{" "}
          {f.type === "meeting_room" ? "Meeting room" : "Toilet"}
        </span>
      </div>
      <div className="detail-body">
        <h2>{f.name}</h2>
        <p className="detail-address">
          <MapPin size={14} />
          {f.address}
        </p>
        {origin && (
          <p className="small muted">
            {formatDistance(distanceMeters(origin, f.location))} approximate
            straight-line distance from your starting point.
          </p>
        )}
        <p className="detail-description">{f.description}</p>
        <div className="amenity-tags">
          {f.amenities.map((a) => (
            <span key={a}>
              {a === "Accessible" && <Accessibility size={12} />} {a}
            </span>
          ))}
        </div>
        <div className="detail-facts">
          <div>
            <DoorOpen size={17} />
            <span>
              <strong>{f.floor}</strong>
              <small>{f.access}</small>
            </span>
          </div>
          <div>
            <Clock3 size={17} />
            <span>
              <strong>
                {String(f.hours.open).padStart(2, "0")}:00 –{" "}
                {String(f.hours.close).padStart(2, "0")}:00
              </strong>
              <small>Sample daily hours · Melbourne time</small>
            </span>
          </div>
          {f.capacity && (
            <div>
              <Users size={17} />
              <span>
                <strong>Room for {f.capacity} people</strong>
                <small>Free · 30 min to 2 hours</small>
              </span>
            </div>
          )}
        </div>
        {f.type === "meeting_room" && (
          <button className="button primary full" onClick={onBook}>
            Reserve this room
            <ArrowRight size={17} />
          </button>
        )}
        {f.type === "meeting_room" && (
          <Link className="text-link room-status-link" to="/rooms">
            Compare demo room slots <ArrowRight size={14} />
          </Link>
        )}
        <a
          className={`button ${f.type === "meeting_room" ? "secondary" : "primary"} full`}
          href={walkingUrl(
            {
              ...f,
              entranceLocation:
                guide?.entranceLocation &&
                isSupportedOrigin(guide.entranceLocation)
                  ? guide.entranceLocation
                  : f.entranceLocation,
            },
            origin ?? undefined,
          )}
          target="_blank"
          rel="noreferrer"
        >
          Walk there in Google Maps
          <ArrowUpRight size={17} />
        </a>
        <p className="fine-print">
          Opens Google Maps · route to the sample location
        </p>
        <div className="detail-section-heading">
          <h3>
            <Camera size={17} />
            The way in
          </h3>
          {guide && (
            <span className="verified-label">
              <ShieldCheck size={13} />
              Community checked
            </span>
          )}
        </div>
        {guide ? (
          <div className="entrance-guide">
            <div className="guide-title-row">
              <strong>{guide.title}</strong>
              <button
                aria-label="Report this guide"
                className="icon-button"
                onClick={() => onReport(guide)}
              >
                <Flag size={15} />
              </button>
            </div>
            <p className="muted small">
              {guide.confirmations.length} distinct accounts confirmed this
              version.
            </p>
            {state.reports.some(
              (r) => r.versionId === guide.id && r.status === "open",
            ) && (
              <p className="report-pending-note">
                A report is awaiting staff review. This guide remains visible.
              </p>
            )}
            <ol className="guide-steps">
              {guide.steps.map((step, i) => (
                <li key={step.id}>
                  <span className="step-number">{i + 1}</span>
                  <div>
                    <img src={step.image} alt={step.alt} />
                    <p>{step.caption}</p>
                  </div>
                </li>
              ))}
            </ol>
            {guide.authorId === user?.id && (
              <Link
                className="text-link"
                to={`/guides/new?facility=${f.id}&guide=${guide.guideId}`}
              >
                Improve this guide
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        ) : (
          <div className="no-guide">
            <span className="guide-line-icon">
              <DoorOpen size={23} />
            </span>
            <strong>The last few steps matter.</strong>
            <p>Help someone find the right door with a photo entrance guide.</p>
          </div>
        )}
        <Link
          className="button secondary full"
          to={`/guides/new?facility=${f.id}${myDraft ? `&guide=${myDraft.guideId}` : ""}`}
        >
          <Plus size={16} />
          {myDraft
            ? "Continue your draft"
            : guide
              ? "Add another entrance guide"
              : "Add an entrance guide"}
        </Link>
        <p className="fine-print">
          Published after you and two other verified accounts confirm.
        </p>
      </div>
    </article>
  );
}
function ReportDialog({
  guide,
  onClose,
}: {
  guide: GuideVersion;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("Incorrect directions");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      service.reportGuide(guide.id, reason, description);
      setDone(true);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal
      title={done ? "Thanks for the heads-up." : "Report this entrance guide"}
      onClose={onClose}
    >
      {done ? (
        <div className="form-stack">
          <p className="muted">
            Staff will review your report. The guide remains visible until staff
            make a decision.
          </p>
          <button className="button primary" onClick={onClose}>
            Done
            <Check size={16} />
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <p className="muted">Tell us what needs a closer look.</p>
          <ErrorBox message={error} />
          <label>
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {[
                "Incorrect directions",
                "Outdated information",
                "Inappropriate image or content",
                "Privacy concern",
                "Other",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            What should staff know?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={1000}
              placeholder="Describe the issue…"
              rows={4}
            />
          </label>
          <button className="button primary full" type="submit">
            Submit report
            <Flag size={16} />
          </button>
        </form>
      )}
    </Modal>
  );
}
