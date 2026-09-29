import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Check,
  ArrowRight,
  X,
} from "lucide-react";
import type { Facility, Booking } from "../domain/types";
import { facilities } from "../data/fixtures";
import { service } from "../services";
import {
  availableSlots,
  formatLocal,
  melbourneDate,
  withinBookingHorizon,
} from "../domain/rules";
import { useNow, useSession, Modal, ErrorBox, Empty, message } from "./ui";

export function BookingDialog({
  facility,
  onClose,
  initialDate,
}: {
  facility: Facility;
  onClose: () => void;
  initialDate?: string;
}) {
  const { state } = useSession();
  const navigate = useNavigate();
  const now = useNow();
  const today = melbourneDate(now);
  const [date, setDate] = useState(() =>
    initialDate && withinBookingHorizon(initialDate, now) ? initialDate : today,
  );
  const [duration, setDuration] = useState(30);
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Booking | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const maxDate = new Date(`${today}T12:00:00Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 14);
  const slots = useMemo(() => {
    try {
      return availableSlots(facility, date, state.bookings, now);
    } catch {
      return [];
    }
  }, [facility, date, state.bookings, now]);
  const canStart = (time: string) => {
    const from = new Date(time).getTime();
    return Array.from({ length: duration / 30 }, (_, i) =>
      slots.some(
        (s) =>
          s.available && new Date(s.start).getTime() === from + i * 30 * 60000,
      ),
    ).every(Boolean);
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      setReceipt(
        service.book({ facilityId: facility.id, start, duration, requestId }),
      );
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal
      title={receipt ? "You’ve got a place." : "Reserve this room"}
      onClose={onClose}
    >
      {receipt ? (
        <div className="booking-receipt">
          <span className="success-icon">
            <Check size={28} />
          </span>
          <h3>{facility.name}</h3>
          <p>{formatLocal(receipt.start)}</p>
          <div className="receipt-meta">
            <span>
              <Clock3 size={16} />
              {duration} minutes
            </span>
            <span>Free</span>
          </div>
          <div className="receipt-id">
            Demo confirmation{" "}
            <strong>{receipt.id.slice(-8).toUpperCase()}</strong>
          </div>
          <p className="demo-note">
            This is a demo reservation. No real venue has been contacted.
          </p>
          <button
            className="button primary full"
            onClick={() => {
              onClose();
              navigate("/bookings");
            }}
          >
            View my bookings
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <div className="booking-room">
            <img
              src={facility.image}
              alt="Illustration of the sample meeting room"
            />
            <div>
              <h3>{facility.name}</h3>
              <p>
                {facility.capacity} people · {facility.floor}
              </p>
            </div>
          </div>
          <ErrorBox message={error} />
          <div className="form-two">
            <label>
              Date
              <input
                type="date"
                min={today}
                max={maxDate.toISOString().slice(0, 10)}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setStart("");
                }}
                required
              />
            </label>
            <label>
              Duration
              <select
                value={duration}
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  setStart("");
                }}
              >
                {[30, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Start time
            <select
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose an available time
              </option>
              {slots.map((s) => (
                <option
                  key={s.start}
                  value={s.start}
                  disabled={!canStart(s.start)}
                >
                  {s.label}
                  {canStart(s.start) ? "" : " · unavailable"}
                </option>
              ))}
            </select>
            <small>All times are in Melbourne ({"Australia/Melbourne"}).</small>
          </label>
          {!slots.some((s) => canStart(s.start)) && (
            <p className="inline-note">
              No times are available for this duration. Try another day.
            </p>
          )}
          <div className="booking-total">
            <span>Your reservation</span>
            <strong>
              Free <small>/ {duration} min</small>
            </strong>
          </div>
          <p className="muted small">
            Book in 30-minute blocks, up to 2 hours, up to 14 days ahead. Cancel
            any time before your booking starts.
          </p>
          <button
            className="button primary full"
            type="submit"
            disabled={!start || !canStart(start)}
          >
            Confirm demo reservation
            <ArrowRight size={17} />
          </button>
          <span className="fine-print">
            Sample room · this does not reserve a real venue
          </span>
        </form>
      )}
    </Modal>
  );
}

export default function Bookings() {
  const { state, user } = useSession();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const mine = state.bookings
    .filter((b) => b.userId === user?.id)
    .sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = mine.filter(
    (b) => b.status === "confirmed" && new Date(b.end).getTime() > Date.now(),
  );
  const past = mine.filter((b) => !upcoming.includes(b));
  const shown = tab === "upcoming" ? upcoming : past;
  function cancel() {
    try {
      if (cancelId) service.cancelBooking(cancelId);
      setCancelId(null);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <main className="page bookings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE SPACE, SET ASIDE</span>
          <h1>
            My bookings<span className="coral">.</span>
          </h1>
          <p className="muted">Your next conversation has a place to happen.</p>
        </div>
        <Link className="button secondary" to="/?type=meeting_room">
          Find a room
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="section-tabs">
        <button
          onClick={() => setTab("upcoming")}
          className={tab === "upcoming" ? "active" : ""}
        >
          Upcoming <span>{upcoming.length}</span>
        </button>
        <button
          onClick={() => setTab("past")}
          className={tab === "past" ? "active" : ""}
        >
          Past & cancelled <span>{past.length}</span>
        </button>
      </div>
      <ErrorBox message={error} />
      {shown.length === 0 ? (
        <Empty
          title={
            tab === "upcoming"
              ? "A little room in your calendar."
              : "No past bookings yet."
          }
        >
          <p>
            {tab === "upcoming"
              ? "Find a meeting room in Cremorne and make it yours for a little while."
              : "Your completed and cancelled demo bookings will appear here."}
          </p>
          {tab === "upcoming" && (
            <Link className="button primary" to="/?type=meeting_room">
              Explore meeting rooms
              <ArrowRight size={17} />
            </Link>
          )}
        </Empty>
      ) : (
        <div className="booking-list">
          {shown.map((b) => {
            const f = facilities.find((f) => f.id === b.facilityId);
            if (!f) return null;
            return (
              <article className="booking-card" key={b.id}>
                <img src={f.image} alt="Sample room illustration" />
                <div className="booking-card-body">
                  <div className="card-overline">
                    <span
                      className={`badge ${b.status === "cancelled" ? "muted-badge" : "green-badge"}`}
                    >
                      {b.status === "cancelled"
                        ? "Cancelled"
                        : new Date(b.end).getTime() <= Date.now()
                          ? "Completed"
                          : "Confirmed · demo"}
                    </span>
                    <span className="muted small">
                      #{b.id.slice(-8).toUpperCase()}
                    </span>
                  </div>
                  <Link className="heading-link" to={`/?place=${f.id}`}>
                    <h2>{f.name}</h2>
                    <ArrowUpRight size={18} />
                  </Link>
                  <p>
                    <CalendarDays size={16} />
                    {formatLocal(b.start)}
                  </p>
                  <p>
                    <Clock3 size={16} />
                    {Math.round(
                      (+new Date(b.end) - +new Date(b.start)) / 60000,
                    )}{" "}
                    minutes · {f.capacity} people · Free
                  </p>
                  <div className="booking-card-actions">
                    <Link to={`/?place=${f.id}`}>View room</Link>
                    {b.status === "confirmed" &&
                      new Date(b.start).getTime() > Date.now() && (
                        <button
                          className="text-button"
                          onClick={() => setCancelId(b.id)}
                        >
                          Cancel booking
                        </button>
                      )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="page-footnote">
        These are browser-local demo bookings. No real venues have been
        reserved.
      </p>
      {cancelId && (
        <Modal title="Cancel your booking?" onClose={() => setCancelId(null)}>
          <p className="muted">
            The room’s time slots will become available again. There’s no
            cancellation fee.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setCancelId(null)}
            >
              Keep booking
            </button>
            <button className="button primary" onClick={cancel}>
              <X size={16} />
              Cancel booking
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
