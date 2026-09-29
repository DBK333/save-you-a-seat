import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { ArrowRight, Check, ShieldCheck, Armchair, MapPin } from "lucide-react";
import { service } from "../services";
import { useSession, ErrorBox, safeReturn, message } from "./ui";

export default function Auth() {
  const location = useLocation();
  const mode = location.pathname;
  const staff = mode === "/staff/login";
  const register = mode === "/register";
  const verify = mode === "/verify";
  const forgot = mode === "/forgot-password";
  const reset = mode === "/reset-password";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const returnTo = safeReturn(
    params.get("returnTo"),
    staff ? "/staff/reports" : "/",
  );
  const title = staff
    ? "Staff sign in"
    : register
      ? "Make yourself at home."
      : verify
        ? "Check your inbox."
        : forgot
          ? "Reset your password"
          : reset
            ? "Choose a new password"
            : "Welcome back.";
  function choose(id: string) {
    try {
      service.login(id);
      navigate(returnTo);
    } catch (e) {
      setError(message(e));
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (register) {
        if (password.length < 8)
          throw new Error("Use at least 8 characters for your password.");
        if (password !== confirm)
          throw new Error("Your passwords do not match.");
        service.register(name, email);
        navigate(
          `/verify?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnTo)}`,
        );
      } else if (verify) {
        service.verify(email, code);
        setDone(true);
      } else if (forgot) {
        service.recover(email);
        setDone(true);
      } else if (reset) {
        if (code !== "314159")
          throw new Error("Use the demo verification code 314159.");
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (password !== confirm)
          throw new Error("Your passwords do not match.");
        setDone(true);
      } else {
        const account = state.users.find(
          (u) =>
            u.email.toLowerCase() === email.toLowerCase().trim() &&
            (staff ? u.role === "staff" : u.role === "user"),
        );
        if (!account)
          throw new Error(
            "Choose a sample account below, or create a demo account.",
          );
        choose(account.id);
      }
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="eyebrow">
          <MapPin size={14} /> A LITTLE HELP, AROUND THE CORNER
        </div>
        <h1>
          Good places.
          <br />
          <span>Better days.</span>
        </h1>
        <p>
          A meeting that needs a room. A moment that needs a loo. Find your next
          stop in Cremorne.
        </p>
        <div className="auth-art" aria-hidden="true">
          <div className="art-ring ring-one" />
          <div className="art-ring ring-two" />
          <div className="art-tile tile-back">
            <MapPin size={40} />
          </div>
          <div className="art-tile tile-front">
            <Armchair size={76} strokeWidth={1.3} />
            <span>There’s a place for you.</span>
          </div>
          <div className="art-dot" />
          <div className="art-spark">✳</div>
        </div>
        <div className="story-foot">
          <span className="mini-avatars">
            <i>A</i>
            <i>J</i>
            <i>S</i>
          </span>
          <span>Better directions, made together.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card" key={mode}>
          <span className="eyebrow">
            {staff ? "SYAS · STAFF PORTAL" : "SAVE YOU A SEAT"}
          </span>
          <h2>{title}</h2>
          <p className="muted">
            {register
              ? "Save your next spot and help someone find theirs."
              : verify
                ? "Verify your demo account to contribute and book."
                : forgot
                  ? "Try the password recovery experience."
                  : reset
                    ? "This preview simulates the password reset flow."
                    : staff
                      ? "Keep the community’s directions useful and up to date."
                      : "A good place to pick up where you left off."}
          </p>
          <div className="demo-note">
            <span className="status-dot" /> Demo accounts stay in this browser.
            Passwords are never checked or saved.
          </div>
          <ErrorBox message={error} />
          {done ? (
            <div className="auth-success">
              <span className="success-icon">
                <Check size={24} />
              </span>
              <h3>
                {verify
                  ? "You’re verified."
                  : forgot
                    ? "Your next step is ready."
                    : "Demo reset complete."}
              </h3>
              <p>
                {forgot
                  ? "No email was sent. Continue with demo code 314159."
                  : reset
                    ? "No password was stored or changed. Use a sample account to sign in."
                    : "You can now reserve rooms and confirm entrance guides."}
              </p>
              <Link
                className="button primary full"
                to={
                  forgot
                    ? `/reset-password?email=${encodeURIComponent(email)}`
                    : verify
                      ? returnTo
                      : "/login"
                }
              >
                {forgot
                  ? "Continue demo reset"
                  : verify
                    ? "Start exploring"
                    : "Back to sign in"}
                <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack">
              {register && (
                <label>
                  Full name
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Your name"
                    maxLength={80}
                  />
                </label>
              )}
              {(register ||
                forgot ||
                verify ||
                reset ||
                (!staff && !register)) && (
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {staff && (
                <label>
                  Staff email
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="taylor@example.test"
                  />
                </label>
              )}
              {(verify || reset) && (
                <label>
                  Verification code
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    placeholder="314159"
                    maxLength={6}
                  />
                  <small>
                    For this demo, enter <strong>314159</strong>.
                  </small>
                </label>
              )}
              {!verify && !forgot && (
                <label>
                  {reset ? "New password" : "Password"}
                  <input
                    type="password"
                    autoComplete={
                      register || reset ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={register || reset ? 8 : 1}
                    placeholder={
                      register || reset
                        ? "At least 8 characters"
                        : "Enter a demo password"
                    }
                  />
                </label>
              )}
              {(register || reset) && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Enter it again"
                  />
                </label>
              )}
              {!register && !verify && !forgot && !reset && (
                <Link className="form-forgot" to="/forgot-password">
                  Forgot password?
                </Link>
              )}
              <button className="button primary full" type="submit">
                {register
                  ? "Create account"
                  : verify
                    ? "Verify account"
                    : forgot
                      ? "Continue"
                      : reset
                        ? "Reset password"
                        : "Sign in"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {!register && !verify && !forgot && !reset && (
            <>
              <div className="divider-label">
                <span />
                or try a sample account
                <span />
              </div>
              <div className="demo-accounts">
                {state.users
                  .filter(
                    (u) =>
                      [
                        "user-alex",
                        "user-jamie",
                        "user-sam",
                        "staff-taylor",
                      ].includes(u.id) &&
                      (staff ? u.role === "staff" : u.role === "user"),
                  )
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => choose(u.id)}
                      className="demo-account"
                    >
                      <span
                        className={`avatar ${u.role === "staff" ? "staff" : ""}`}
                      >
                        {u.name[0]}
                      </span>
                      <span>Continue as {u.name.split(" ")[0]}</span>
                      {staff ? (
                        <ShieldCheck size={17} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                    </button>
                  ))}
              </div>
            </>
          )}
          <div className="auth-footer">
            {register ? (
              <p>
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            ) : !verify && !forgot && !reset && !staff ? (
              <p>
                New around here? <Link to="/register">Create an account</Link>
              </p>
            ) : null}
            {staff ? (
              <Link to="/login">Back to regular sign in</Link>
            ) : (
              <Link className="quiet-link" to="/staff/login">
                <ShieldCheck size={13} />
                Staff sign in
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
