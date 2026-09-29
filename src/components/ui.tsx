import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Navigate, useLocation } from "react-router-dom";
import { X, CircleAlert, Armchair } from "lucide-react";
import { service } from "../services";

const subscribe = (listener: () => void) => service.subscribe(listener);
const snapshot = () => service.getSnapshot();
/** Refresh visible time-dependent availability without a page reload. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}
export function useSession() {
  const state = useSyncExternalStore(subscribe, snapshot);
  return {
    state,
    user: state.users.find((u) => u.id === state.currentUserId) ?? null,
  };
}
export function safeReturn(value: string | null, fallback = "/") {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.startsWith("/login") &&
    !value.startsWith("/staff/login")
    ? value
    : fallback;
}
export function RequireUser({
  children,
  staff = false,
  verified = false,
}: {
  children: ReactNode;
  staff?: boolean;
  verified?: boolean;
}) {
  const { user } = useSession();
  const location = useLocation();
  if (!user)
    return (
      <Navigate
        to={`${staff ? "/staff/login" : "/login"}?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (staff && user.role !== "staff")
    return (
      <div className="page narrow">
        <ErrorBox message="This page is for staff accounts. Please use staff sign in." />
        <a className="button primary" href="/staff/login">
          Staff sign in
        </a>
      </div>
    );
  if (verified && !user.verified)
    return (
      <Navigate
        to={`/verify?email=${encodeURIComponent(user.email)}&returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return children;
}
export function ErrorBox({ message }: { message: string | null }) {
  return message ? (
    <div role="alert" className="error-box">
      <CircleAlert size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Armchair size={28} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((e) => !e.hasAttribute("hidden"));
    focusable()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const list = focusable();
        if (!list.length) {
          e.preventDefault();
          return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="modal-heading">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
