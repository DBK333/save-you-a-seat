import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Armchair,
  ArrowUpRight,
  ChevronDown,
  LogOut,
  Monitor,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getConfigurationError, service } from "./services";
import { ErrorBox, RequireUser, useSession } from "./components/ui";
import Auth from "./components/Auth";
import Explore from "./components/Explore";
import Bookings from "./components/Bookings";
import RoomAvailability from "./components/RoomAvailability";
import Community, { GuideEditor, StaffReports } from "./components/Community";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, user } = useSession();
  const configError = getConfigurationError();
  const auth = [
    "/login",
    "/register",
    "/verify",
    "/forgot-password",
    "/reset-password",
    "/staff/login",
  ].includes(location.pathname);
  function logout() {
    service.logout();
    navigate("/");
  }
  return (
    <>
      <div className="desktop-notice">
        <span className="brand-mark">
          <Armchair size={25} />
        </span>
        <Monitor size={40} />
        <h1>A little more room, please.</h1>
        <p>
          SYAS is a desktop web experience for now. Open it in a window at least
          1,000 pixels wide.
        </p>
      </div>
      <div className="app-shell">
        <header className="site-header">
          <Link className="brand" to="/" aria-label="SYAS home">
            <span className="brand-mark">
              <Armchair size={23} strokeWidth={2} />
            </span>
            <span className="brand-wordmark">
              syas<span>save you a seat</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink end to="/">
              Explore
            </NavLink>
            <NavLink to="/bookings">My bookings</NavLink>
            <NavLink to="/rooms">Room availability</NavLink>
            <NavLink to="/community">
              Community confirmations
              <span className="nav-count">
                {state.guides.filter((g) => g.status === "pending").length}
              </span>
            </NavLink>
          </nav>
          <div className="header-account">
            {user ? (
              <>
                <span className="location-label">
                  <span className="status-dot" />
                  Melbourne, AU
                </span>
                <details className="account-menu">
                  <summary>
                    <span
                      className={`avatar ${user.role === "staff" ? "staff" : ""}`}
                    >
                      {user.name[0]}
                    </span>
                    <span>{user.name.split(" ")[0]}</span>
                    <ChevronDown size={14} />
                  </summary>
                  <div className="account-dropdown">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <span className="small">
                      {user.verified
                        ? "Verified demo account"
                        : "Email not verified"}
                    </span>
                    {user.role === "staff" && (
                      <Link to="/staff/reports">
                        <ShieldCheck size={15} />
                        Review reports
                      </Link>
                    )}
                    <Link to="/community">
                      My contributions
                      <ArrowUpRight size={14} />
                    </Link>
                    <button onClick={logout}>
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <>
                <Link className="header-login" to="/login">
                  Log in
                </Link>
                <Link className="button primary header-signup" to="/register">
                  Sign up
                  <ArrowUpRight size={15} />
                </Link>
              </>
            )}
          </div>
        </header>
        <div className="demo-banner">
          <span className="demo-tag">
            <Sparkles size={11} />
            DEMO
          </span>
          <span>
            Demonstration · SYAS places and bookings are samples. Official
            booking links open external services.
          </span>
          <span className="banner-local">AUSTRALIA · MELBOURNE</span>
        </div>
        {configError ? (
          <main className="page narrow">
            <h1>Connection needs configuration.</h1>
            <ErrorBox message={configError} />
            <p className="muted">
              Live mode stays unavailable until its backend is configured. No
              demo data will be presented as live data.
            </p>
          </main>
        ) : (
          <Routes>
            <Route path="/" element={<Explore />} />
            <Route path="/rooms" element={<RoomAvailability />} />
            <Route
              path="/bookings"
              element={
                <RequireUser>
                  <Bookings />
                </RequireUser>
              }
            />
            <Route
              path="/community"
              element={
                <RequireUser>
                  <Community />
                </RequireUser>
              }
            />
            <Route
              path="/guides/new"
              element={
                <RequireUser verified>
                  <GuideEditor key={location.search} />
                </RequireUser>
              }
            />
            <Route
              path="/staff/reports"
              element={
                <RequireUser staff>
                  <StaffReports />
                </RequireUser>
              }
            />
            {[
              "/login",
              "/register",
              "/verify",
              "/forgot-password",
              "/reset-password",
              "/staff/login",
            ].map((path) => (
              <Route
                key={path}
                path={path}
                element={<Auth key={location.pathname} />}
              />
            ))}
            <Route
              path="*"
              element={
                <main className="page narrow">
                  <h1>This place isn’t on our map.</h1>
                  <p className="muted">
                    Let’s take you back to somewhere familiar.
                  </p>
                  <Link className="button primary" to="/">
                    Back to Explore
                  </Link>
                </main>
              }
            />
          </Routes>
        )}
        {auth && (
          <div className="auth-bottom-note">
            A little local knowledge goes a long way. <span>SYAS © 2026</span>
          </div>
        )}
      </div>
    </>
  );
}
