import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ArrowRight,
  ArrowUpRight,
  Users,
  Camera,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Flag,
  X,
  CheckCircle2,
} from "lucide-react";
import type { Coordinates, GuideStep, Report } from "../domain/types";
import { facilities } from "../data/fixtures";
import { service } from "../services";
import { formatLocal } from "../domain/rules";
import MapCanvas from "./MapCanvas";
import { useSession, ErrorBox, Empty, Modal, message } from "./ui";

export default function Community() {
  const { state, user } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"pending" | "mine">("pending");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const pending = state.guides.filter((g) => g.status === "pending");
  const guides =
    tab === "pending"
      ? pending
      : state.guides.filter(
          (g) =>
            g.authorId === user?.id &&
            g.status !== "superseded" &&
            g.status !== "removed",
        );
  function confirm(id: string) {
    if (!user) {
      navigate("/login?returnTo=%2Fcommunity");
      return;
    }
    if (!user.verified) {
      navigate(
        `/verify?email=${encodeURIComponent(user.email)}&returnTo=%2Fcommunity`,
      );
      return;
    }
    try {
      service.confirmGuide(id);
      setConfirmed(id);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <main className="page community-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">KNOW THE WAY? PASS IT ON.</span>
          <h1>
            Better directions,
            <br />
            made together<span className="coral">.</span>
          </h1>
          <p className="muted">
            A photo of the right door can make someone’s day a little easier.
          </p>
        </div>
        <div className="community-summary">
          <span className="summary-icon">
            <Camera size={24} />
          </span>
          <div>
            <strong>
              {state.guides.filter((g) => g.status === "published").length}
            </strong>
            <span>community-checked guides</span>
          </div>
        </div>
      </div>
      <div className="community-explainer">
        <span className="number-circle">1</span>
        <span>Someone shares the way in</span>
        <ArrowRight size={15} />
        <span className="number-circle">2</span>
        <span>Two other verified accounts confirm</span>
        <ArrowRight size={15} />
        <span className="number-circle">3</span>
        <span>Everyone finds the right door</span>
      </div>
      <div className="section-tabs">
        <button
          className={tab === "pending" ? "active" : ""}
          onClick={() => setTab("pending")}
        >
          Needs confirmation <span>{pending.length}</span>
        </button>
        <button
          className={tab === "mine" ? "active" : ""}
          onClick={() => setTab("mine")}
        >
          My guides
        </button>
      </div>
      <ErrorBox message={error} />
      {confirmed && (
        <div role="status" className="success-banner">
          <CheckCircle2 size={17} />
          Thanks for confirming.{" "}
          {state.guides.find((g) => g.id === confirmed)?.status === "published"
            ? "The guide is now published."
            : "One step closer to a published guide."}
          <button
            className="icon-button"
            aria-label="Dismiss confirmation"
            onClick={() => setConfirmed(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {guides.length === 0 ? (
        <Empty
          title={
            tab === "mine"
              ? "Your local knowledge belongs here."
              : "All caught up."
          }
        >
          <p>
            {tab === "mine"
              ? "Open a place and add an entrance guide to help someone find the door."
              : "There are no guides waiting for confirmation right now."}
          </p>
          <Link className="button secondary" to="/">
            Explore places
            <ArrowRight size={16} />
          </Link>
        </Empty>
      ) : (
        <div className="community-grid">
          {guides.map((g) => {
            const f = facilities.find((f) => f.id === g.facilityId);
            const author = state.users.find((u) => u.id === g.authorId);
            const hasConfirmed = g.confirmations.includes(user?.id ?? "");
            return (
              <article className="community-card" key={g.id}>
                <div className="community-image">
                  <img
                    src={g.steps[0]?.image || f?.image}
                    alt={g.steps[0]?.alt ?? "Entrance guide illustration"}
                  />
                  <span
                    className={`badge ${g.status === "published" ? "green-badge" : ""}`}
                  >
                    {g.status === "pending"
                      ? "Needs confirmation"
                      : g.status === "published"
                        ? "Published"
                        : g.status === "removed"
                          ? "Removed by staff"
                          : "Draft"}
                  </span>
                  <span className="step-count">
                    <Camera size={12} />
                    {g.steps.length} {g.steps.length === 1 ? "step" : "steps"}
                  </span>
                </div>
                <div className="community-card-body">
                  <span className="place-category">{f?.name}</span>
                  <h2>{g.title}</h2>
                  <p className="muted small">
                    Shared by {author?.name.split(" ")[0] ?? "a neighbour"} ·{" "}
                    {formatLocal(g.createdAt)}
                  </p>
                  <div className="confirmation-progress">
                    <div className="progress-dots">
                      {[0, 1, 2].map((i) => (
                        <span
                          className={
                            i < g.confirmations.length ? "complete" : ""
                          }
                          key={i}
                        >
                          {i < g.confirmations.length ? (
                            <Check size={12} />
                          ) : (
                            i + 1
                          )}
                        </span>
                      ))}
                    </div>
                    <span>
                      {Math.min(g.confirmations.length, 3)} of 3 confirmations
                    </span>
                  </div>
                  <details className="review-steps">
                    <summary>
                      Review entrance steps
                      <ArrowRight size={14} />
                    </summary>
                    <ol>
                      {g.steps.map((s, i) => (
                        <li key={s.id}>
                          <img src={s.image} alt={s.alt} />
                          <p>
                            <strong>{i + 1}.</strong> {s.caption}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                  {g.status === "pending" ? (
                    <>
                      <p className="small muted">
                        Confirm only if these steps match the entrance you know.
                      </p>
                      <button
                        className={`button ${hasConfirmed ? "secondary" : "primary"} full`}
                        onClick={() => confirm(g.id)}
                        disabled={hasConfirmed}
                      >
                        {hasConfirmed ? (
                          <>
                            <Check size={16} />
                            You’ve confirmed
                          </>
                        ) : (
                          <>
                            Confirm this entrance
                            <Check size={16} />
                          </>
                        )}
                      </button>
                    </>
                  ) : g.status === "draft" ? (
                    <Link
                      className="button secondary full"
                      to={`/guides/new?facility=${g.facilityId}&guide=${g.guideId}`}
                    >
                      Continue editing
                      <ArrowRight size={16} />
                    </Link>
                  ) : g.status === "published" ? (
                    <Link
                      className="button secondary full"
                      to={`/?place=${g.facilityId}`}
                    >
                      View published guide
                      <ArrowUpRight size={16} />
                    </Link>
                  ) : (
                    <p className="small muted">
                      This guide cannot be republished after staff removal.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="page-footnote">
        Sample guides and confirmations are stored in this browser during the
        demo.
      </p>
    </main>
  );
}

export function GuideEditor() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, user } = useSession();
  const facility = facilities.find((f) => f.id === params.get("facility"));
  const gid = params.get("guide");
  const versions = state.guides.filter(
    (g) => g.guideId === gid && g.authorId === user?.id,
  );
  const source =
    versions.find((g) => g.status === "draft") ??
    versions.find((g) => g.status === "published");
  const isRevision = versions.some((g) => g.status === "published");
  const [title, setTitle] = useState(
    source?.title ?? "The way to the entrance",
  );
  const [steps, setSteps] = useState<GuideStep[]>(
    () => source?.steps.map((s) => ({ ...s })) ?? [],
  );
  const [draftId, setDraftId] = useState<string | undefined>(
    source?.status === "draft" ? source.id : undefined,
  );
  const [entrance, setEntrance] = useState<Coordinates | null>(
    source?.entranceLocation ?? facility?.entranceLocation ?? null,
  );
  const [pick, setPick] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!facility)
    return (
      <main className="page">
        <Empty title="Choose a place first.">
          <Link className="button primary" to="/">
            Explore places
            <ArrowRight size={16} />
          </Link>
        </Empty>
      </main>
    );
  const blocked = !!gid && state.blockedGuides.includes(gid);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    if (steps.length + files.length > 5) {
      setError("A guide can have up to 5 photos.");
      return;
    }
    setUploading(true);
    try {
      const added: GuideStep[] = [];
      for (const file of Array.from(files)) {
        const media = await service.upload(file);
        added.push({
          id: crypto.randomUUID(),
          image: media.image,
          mediaId: media.id,
          alt: `Entrance photo for ${facility!.name}`,
          caption: "",
        });
      }
      setSteps((prev) => [...prev, ...added]);
      setSaved(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setUploading(false);
    }
  }
  function move(i: number, offset: number) {
    const copy = [...steps];
    [copy[i], copy[i + offset]] = [copy[i + offset], copy[i]];
    setSteps(copy);
    setSaved(false);
  }
  function save(submit: boolean) {
    try {
      setError(null);
      const draft = service.saveDraft(
        {
          facilityId: facility!.id,
          title,
          steps,
          entranceLocation: entrance ?? undefined,
          guideId: gid ?? undefined,
        },
        draftId,
      );
      setDraftId(draft.id);
      if (submit) {
        service.submitGuide(draft.id);
        navigate("/community");
      } else setSaved(true);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <main className="page guide-editor">
      <div className="editor-breadcrumb">
        <Link to={`/?place=${facility.id}`}>{facility.name}</Link>
        <span>/</span>Entrance guide
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">HELP SOMEONE FIND THE RIGHT DOOR</span>
          <h1>{isRevision ? "Improve the way in." : "Show the way in."}</h1>
          <p className="muted">
            A few photos. Clear directions. A much easier arrival.
          </p>
        </div>
        <span className="badge">{isRevision ? "NEW REVISION" : "DRAFT"}</span>
      </div>
      <ErrorBox message={error} />
      {blocked && (
        <ErrorBox message="Staff removed this guide. It cannot be republished." />
      )}
      {saved && (
        <div role="status" className="success-banner">
          <Check size={17} />
          Draft saved in this browser.
        </div>
      )}
      {isRevision && (
        <div className="inline-note">
          Your published guide stays visible while this new version collects its
          own confirmations.
        </div>
      )}
      <div className="editor-layout">
        <section className="editor-main">
          <label className="title-input-label">
            Guide title
            <input
              className="guide-title-input"
              value={title}
              maxLength={100}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              placeholder="A simple name for this entrance"
            />
          </label>
          <div className="editor-section-label">
            <h2>Your photo steps</h2>
            <span>{steps.length} / 5 photos</span>
          </div>
          {steps.map((step, i) => (
            <article className="editor-step" key={step.id}>
              <div className="editor-step-head">
                <span className="step-number">{i + 1}</span>
                <strong>Step {i + 1}</strong>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => {
                      setSteps(steps.filter((_, j) => j !== i));
                      setSaved(false);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <img className="editor-photo" src={step.image} alt={step.alt} />
              <label>
                What should someone do here?
                <textarea
                  maxLength={300}
                  value={step.caption}
                  onChange={(e) => {
                    setSteps(
                      steps.map((s, j) =>
                        j === i ? { ...s, caption: e.target.value } : s,
                      ),
                    );
                    setSaved(false);
                  }}
                  rows={2}
                  placeholder="For example: Enter through the glass door beside the café."
                />
                <small>{step.caption.length}/300 characters</small>
              </label>
            </article>
          ))}
          {steps.length < 5 && (
            <label className={`photo-upload ${uploading ? "busy" : ""}`}>
              <span className="upload-icon">
                {uploading ? (
                  <LoaderCircle size={25} className="spin" />
                ) : (
                  <Upload size={25} />
                )}
              </span>
              <strong>
                {uploading
                  ? "Adding your photos…"
                  : steps.length
                    ? "Add another photo"
                    : "Start with a photo of the entrance"}
              </strong>
              <span>JPG, PNG or WebP · up to 5 MB each</span>
              <span className="button secondary">
                <Plus size={16} />
                Choose photos
              </span>
              <input
                aria-label="Upload entrance photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <p className="muted small">
            Keep each step short and specific. Photos should show the route,
            without identifying people.
          </p>
        </section>
        <aside className="editor-sidebar">
          <div className="editor-summary">
            <h3>
              <MapPin size={17} />
              Where’s the entrance?
            </h3>
            <p className="small muted">
              Place an optional entrance pin so directions finish at the right
              door.
            </p>
            <div className="editor-map">
              <MapCanvas
                facilities={[facility]}
                selectedId={facility.id}
                onSelect={() => {}}
                origin={entrance}
                onOriginChange={setEntrance}
                pickOrigin={pick}
                onPickOriginDone={() => setPick(false)}
              />
            </div>
            <button
              className="button secondary full"
              onClick={() => setPick(!pick)}
            >
              {pick
                ? "Cancel placing pin"
                : entrance
                  ? "Adjust entrance pin"
                  : "Set entrance pin"}
              <MapPin size={15} />
            </button>
            {pick && (
              <p className="small coral">Click the map to mark the entrance.</p>
            )}
            {entrance && (
              <button
                className="text-button small"
                onClick={() => setEntrance(null)}
              >
                Remove entrance pin
              </button>
            )}
          </div>
          <div className="editor-summary">
            <span className="summary-icon">
              <Users size={22} />
            </span>
            <h3>A little shared confidence.</h3>
            <p className="muted small">
              Submitting counts as your confirmation. Two other verified
              accounts must confirm this version before it appears on the place.
            </p>
            <div className="publish-progress">
              <span className="complete">You</span>
              <span>+1</span>
              <span>+1</span>
              <ArrowRight size={15} />
              <Check size={16} />
            </div>
            <button
              className="button primary full"
              disabled={uploading || blocked || steps.length === 0}
              onClick={() => save(true)}
            >
              Submit for confirmation
              <ArrowRight size={16} />
            </button>
            <button
              className="button secondary full"
              disabled={uploading || blocked}
              onClick={() => save(false)}
            >
              Save draft
            </button>
            <p className="fine-print">
              Demo only · photos stay in this browser
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export function StaffReports() {
  const { state } = useSession();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [review, setReview] = useState<Report | null>(null);
  const [action, setAction] = useState<"remove" | "dismiss">("dismiss");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shown = state.reports.filter((r) =>
    tab === "open" ? r.status === "open" : r.status !== "open",
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      service.moderate(review!.id, action, note);
      setReview(null);
      setNote("");
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <main className="page staff-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={14} />
            STAFF WORKSPACE
          </span>
          <h1>
            A closer look<span className="coral">.</span>
          </h1>
          <p className="muted">
            Review community reports and keep directions helpful.
          </p>
        </div>
        <span className="badge">
          {state.reports.filter((r) => r.status === "open").length} open reports
        </span>
      </div>
      <div className="section-tabs">
        <button
          className={tab === "open" ? "active" : ""}
          onClick={() => setTab("open")}
        >
          Awaiting review
        </button>
        <button
          className={tab === "resolved" ? "active" : ""}
          onClick={() => setTab("resolved")}
        >
          Resolved
        </button>
      </div>
      <p className="inline-note">
        Reports do not automatically hide a guide. Only a staff removal takes it
        offline and blocks republication.
      </p>
      {shown.length === 0 ? (
        <Empty title="Nothing waiting here.">
          <p>
            {tab === "open"
              ? "New reports will appear here for staff review."
              : "Reviewed reports and decision notes will appear here."}
          </p>
        </Empty>
      ) : (
        <div className="report-list">
          {shown.map((r) => {
            const g = state.guides.find((g) => g.id === r.versionId);
            const f = facilities.find((f) => f.id === g?.facilityId);
            return (
              <article className="report-card" key={r.id}>
                <span className="report-icon">
                  <Flag size={22} />
                </span>
                <div>
                  <div className="card-overline">
                    <span className="badge">
                      {r.status === "open"
                        ? "Open report"
                        : r.status === "dismissed"
                          ? "Dismissed"
                          : "Guide removed"}
                    </span>
                    <span className="muted small">
                      {formatLocal(r.createdAt)}
                    </span>
                  </div>
                  <h2>{r.reason}</h2>
                  <p className="muted small">
                    {f?.name} · {g?.title}
                  </p>
                  <p>{r.description}</p>
                  {r.decision && (
                    <p className="decision-note">
                      <strong>Staff decision:</strong> {r.decision.reason}
                    </p>
                  )}
                </div>
                {r.status === "open" && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setReview(r);
                      setAction("dismiss");
                      setNote("");
                      setError(null);
                    }}
                  >
                    Review report
                    <ArrowRight size={16} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {review && (
        <Modal
          title="Review community report"
          onClose={() => setReview(null)}
          wide
        >
          <form className="form-stack" onSubmit={submit}>
            <ErrorBox message={error} />
            <div className="review-report-copy">
              <span className="badge">{review.reason}</span>
              <p>{review.description}</p>
            </div>
            {state.guides
              .find((g) => g.id === review.versionId)
              ?.steps.map((s, i) => (
                <div className="staff-step-preview" key={s.id}>
                  <img src={s.image} alt={s.alt} />
                  <p>
                    <strong>Step {i + 1}</strong>
                    <br />
                    {s.caption}
                  </p>
                </div>
              ))}
            <fieldset className="moderation-options">
              <legend>Staff decision</legend>
              <label>
                <input
                  type="radio"
                  checked={action === "dismiss"}
                  onChange={() => setAction("dismiss")}
                />
                <span>
                  <strong>Dismiss report</strong>
                  <small>Keep the guide visible.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={action === "remove"}
                  onChange={() => setAction("remove")}
                />
                <span>
                  <strong>Remove guide</strong>
                  <small>Hide this guide and block future republication.</small>
                </span>
              </label>
            </fieldset>
            <label>
              Decision note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                maxLength={1000}
                rows={3}
                placeholder="Explain the decision for the review record."
              />
            </label>
            <button className="button primary full" type="submit">
              {action === "remove" ? "Remove guide" : "Dismiss report"}
              <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
