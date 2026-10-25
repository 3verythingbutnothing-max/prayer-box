import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  authorLabel,
  canViewRequest,
  getAudienceLabel,
  getEffectiveAudience,
  screenText,
  seedRequests,
} from "./domain";
import type { Audience, BoxId, PrayerRequest, Viewer } from "./domain";
import { BoxArt, CountryFlag, Icon, Modal, PrayerBoxMark } from "./ui";
import PrayerComposer from "./components/PrayerComposer";
import PrayerDetail from "./components/PrayerDetail";
import AccountPages from "./components/AccountPages";
import AboutPage from "./components/AboutPage";
import CommunityPages from "./components/CommunityPages";
import CareResources from "./components/CareResources";
import GetHelpPage from "./components/GetHelpPage";
import DeleteRequests from "./components/DeleteRequests";
import { OrganizationWebsiteLink } from "./components/OrganizationWebsite";
import { normalizeOrganizationWebsite } from "./organization";
import SharePrayerBoxQr from "./components/SharePrayerBoxQr";
import {
  formatStoryDate,
  getStoryPosts,
  hasPrayedForLatest,
  publishStoryPost,
  storyPublicationPlan,
  withdrawOwnDeliveries,
} from "./story";
import {
  CareReviewQueue,
  PrivateSupportNotifications,
} from "./components/CareFlow";
import {
  addCareConcern,
  buildPlatformAcknowledgment,
  hasSupportLanguage,
  visibleSupportNotes,
} from "./care";
import type { CareConcern, SupportNote } from "./care";
import "./account.css";
import "./story-list.css";

function FeedbackUnavailable() {
  return (
    <section className="empty-state">
      <h1>Report a bug</h1>
      <p>
        The feedback form couldn’t load. Please reload the page and try again.
      </p>
      <button className="button" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </section>
  );
}
const FeedbackPage = lazy(() =>
  import("./components/FeedbackPage").catch(() => ({
    default: FeedbackUnavailable,
  })),
);

type Membership = "none" | "pending" | "invited" | "approved";
type Scenario = "normal" | "empty" | "loading" | "error" | "denied";
type Report = {
  id: string;
  actorId: string;
  reason: string;
  evidence: string;
  state: "open" | "validated" | "dismissed";
  evaluation?: boolean;
};
type HeldStory = {
  id: string;
  authorId: Viewer;
  sourceId: string;
  destinations: string[];
  text: string;
  kind: "testimony" | "update";
  state: "pending" | "changes" | "appeal";
  reason: string;
};
const aboutAnchors = [
  "about",
  "our-foundation",
  "personal-prayer",
  "prayer-guide",
  "scripture-collection",
];
const viewerNames: Record<Viewer, string> = {
  elena: "Elena",
  maria: "Maria",
  member: "Samuel",
  owner: "Grace owner",
  guest: "Visitor",
  operator: "Safety reviewer",
};
const boxNames: Record<BoxId, string> = {
  maria: "Maria",
  grace: "Grace Church",
  mine: "Elena",
};
const withPlatformAcknowledgment = (row: PrayerRequest): PrayerRequest =>
  row.moderation === "approved" && !row.platformAcknowledgment
    ? {
        ...row,
        platformAcknowledgment: buildPlatformAcknowledgment(
          row.text,
          row.topic,
        ),
      }
    : row;
const cloneFixtures = () =>
  structuredClone(seedRequests).map(withPlatformAcknowledgment);

function PrayerCard({
  row,
  onNavigate,
  outsideAudience,
}: {
  row: PrayerRequest;
  onNavigate: (route: string) => void;
  outsideAudience: Audience;
}) {
  const posts = getStoryPosts(row);
  const latest = posts.at(-1);
  return (
    <article className="prayer-card panel">
      <div className="card-topline">
        <div className="request-byline">
          <span
            className={`avatar avatar-small ${row.anonymous ? "anonymous" : ""}`}
          >
            {row.anonymous ? (
              <Icon name="heart" size={16} />
            ) : (
              authorLabel(row).slice(0, 1)
            )}
          </span>
          <span>{authorLabel(row)}</span>
        </div>
        <span className="card-date">
          {row.postedAt ? formatStoryDate(row.postedAt) : row.createdAt}
        </span>
      </div>
      <h3>
        <button onClick={() => onNavigate(`request/${row.id}`)}>
          {row.topic}
        </button>
      </h3>
      <p className="card-prayer-text">{row.text}</p>
      {latest && (
        <div className="card-latest-post">
          <Icon name={latest.kind === "testimony" ? "sun" : "link"} size={15} />
          <strong>
            {latest.kind === "testimony" ? "Testimony shared" : "Update shared"}
          </strong>
          <time dateTime={latest.createdAt}>
            {formatStoryDate(latest.createdAt)}
          </time>
        </div>
      )}
      <div className="card-bottom">
        <span className="audience-line">
          <Icon
            name={outsideAudience === "public" ? "globe" : "lock"}
            size={14}
          />
          {getAudienceLabel(outsideAudience, row.recipient)}
        </span>
        <button
          className="text-link"
          onClick={() => onNavigate(`request/${row.id}`)}
        >
          {latest ? "Read the whole story" : "Read & pray"}{" "}
          <Icon name="arrow" size={16} />
        </button>
      </div>
      {row.media && (
        <p className="media-inline">
          <Icon name={row.media.kind} size={14} />
          {row.media.kind}{" "}
          {row.media.status === "pending"
            ? "review pending · unavailable"
            : "example · text alternative available"}
        </p>
      )}
    </article>
  );
}

function EmptyState({
  kind,
  onAction,
}: {
  kind: Scenario;
  onAction: () => void;
}) {
  return (
    <div
      className={`empty-state panel ${kind === "loading" ? "is-loading" : ""}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <BoxArt small />
      <h2>
        {kind === "loading"
          ? "Opening this little box…"
          : kind === "error"
            ? "This box needs another moment."
            : kind === "denied"
              ? "This space is private."
              : "A little quiet, for now."}
      </h2>
      <p>
        {kind === "loading"
          ? "A simulated loading state. No request text is exposed in a placeholder."
          : kind === "error"
            ? "The fictional connection was interrupted. Your saved demo content is still here."
            : kind === "denied"
              ? "Only permitted recipients and approved members can open this space. No private details are shown."
              : "There aren’t any requests in this view yet. You’re welcome to begin with a few honest words."}
      </p>
      <button className="button secondary" onClick={onAction}>
        {kind === "error"
          ? "Try again"
          : kind === "loading"
            ? "Finish loading demo"
            : kind === "denied"
              ? "Return to a public box"
              : "Leave a prayer request"}
      </button>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(
    () => window.location.hash.slice(1) || "box/maria",
  );
  const [viewer, setViewer] = useState<Viewer>("elena");
  const [requests, setRequests] = useState<PrayerRequest[]>(cloneFixtures);
  const [organizationWebsite, setOrganizationWebsite] = useState(
    "https://example.org/",
  );
  const [membership, setMembership] = useState<Membership>("none");
  const [memberActive, setMemberActive] = useState(true);
  const [officialAllowed, setOfficialAllowed] = useState(false);
  const [friends, setFriends] = useState(["maria", "daniel"]);
  const [privacyByViewer, setPrivacyByViewer] = useState<
    Partial<Record<Viewer, Audience>>
  >({ elena: "private", maria: "public" });
  const [countryByViewer, setCountryByViewer] = useState<
    Partial<Record<Viewer, { country: string; show: boolean }>>
  >({ maria: { country: "us", show: true } });
  const [associationByViewer, setAssociationByViewer] = useState<
    Partial<Record<Viewer, boolean>>
  >({ maria: true });
  const [reminders, setReminders] = useState(true);
  const [automatic, setAutomatic] = useState<Partial<Record<BoxId, boolean>>>({
    mine: false,
    maria: false,
    grace: false,
  });
  const [automaticMessages, setAutomaticMessages] = useState<
    Partial<Record<BoxId, string>>
  >({});
  const [blocked, setBlocked] = useState<Partial<Record<Viewer, string[]>>>({});
  const [boxRemoved, setBoxRemoved] = useState<
    Partial<Record<BoxId, string[]>>
  >({});
  const [reports, setReports] = useState<Report[]>([]);
  const [careConcerns, setCareConcerns] = useState<CareConcern[]>([]);
  const [supportNotes, setSupportNotes] = useState<SupportNote[]>([]);
  const [dismissedSupportNotes, setDismissedSupportNotes] = useState<string[]>(
    [],
  );
  const [readSupportNotes, setReadSupportNotes] = useState<string[]>([]);
  const [heldStories, setHeldStories] = useState<HeldStory[]>([]);
  const [restricted, setRestricted] = useState<string[]>([]);
  const [composer, setComposer] = useState<{
    recipient: BoxId;
    initial?: PrayerRequest;
  } | null>(null);
  const [dialog, setDialog] = useState<
    "demo" | "notifications" | "blocked" | "share" | "support" | null
  >(null);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [deleteStory, setDeleteStory] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
  const [updateStory, setUpdateStory] = useState<string | null>(null);
  const [updateKind, setUpdateKind] = useState<"testimony" | "update">(
    "update",
  );
  const [updateText, setUpdateText] = useState(
    "The story is still unfolding. I am thankful for a little more peace today, and I am still asking for wisdom for the next step.",
  );
  const [updateDestinations, setUpdateDestinations] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationRead, setNotificationRead] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cleanRoute = route.split("?")[0];
  const [page, resource] = cleanRoute.split("/");
  const isAbout = aboutAnchors.includes(page);
  const box: BoxId =
    resource === "grace" ? "grace" : resource === "mine" ? "mine" : "maria";
  const roleActive = viewer === "member" ? memberActive : true;
  const groupMember =
    viewer === "owner" ||
    viewer === "maria" ||
    (viewer === "member" && memberActive) ||
    (viewer === "elena" && membership === "approved");
  const privacy = privacyByViewer[viewer] ?? "private";
  const privateSupportNotes = visibleSupportNotes(supportNotes, viewer).filter(
    (note) => !dismissedSupportNotes.includes(note.id),
  );
  const unreadSupport = privateSupportNotes.some(
    (note) => !readSupportNotes.includes(note.id),
  );
  const blockedActors = blocked[viewer] ?? [];
  const accessContext = {
    elenaApprovedMember: membership === "approved",
    memberActive,
    acceptedElenaFriends: friends,
    boxCeilings: {
      maria: privacyByViewer.maria ?? "public",
      mine: "private",
      grace: "public",
    } as Record<BoxId, Audience>,
  };
  const canRead = (row: PrayerRequest) =>
    canViewRequest(row, viewer, accessContext) &&
    !blockedActors.includes(row.authorId) &&
    !(boxRemoved[row.recipient] ?? []).includes(row.authorId);
  const outsideAudience = (row: PrayerRequest) =>
    getEffectiveAudience(
      row.audience,
      row.authorCeiling,
      accessContext.boxCeilings[row.recipient],
    );
  const ownBox: BoxId =
    viewer === "owner" ? "grace" : viewer === "maria" ? "maria" : "mine";
  const canSeeMariaProfile =
    viewer === "maria" ||
    (privacyByViewer.maria ?? "public") === "public" ||
    (privacyByViewer.maria === "friends" &&
      viewer === "elena" &&
      friends.includes("maria"));
  const offerGrace = !!associationByViewer.maria && canSeeMariaProfile;

  function setPrivacy(next: Audience) {
    setPrivacyByViewer((previous) => ({ ...previous, [viewer]: next }));
    setRequests((previous) =>
      previous.map((row) =>
        row.authorId === viewer ? { ...row, authorCeiling: next } : row,
      ),
    );
  }

  function notify(message: string) {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), 6500);
  }
  function navigate(destination: string) {
    const target =
      destination === "box"
        ? `box/${ownBox}`
        : destination.replace(/^testimony\//, "request/");
    setMenuOpen(false);
    setScenario("normal");
    if (window.location.hash.slice(1) === target) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    window.location.hash = target;
  }
  useEffect(() => {
    const update = () => setRoute(window.location.hash.slice(1) || "box/maria");
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
      clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (aboutAnchors.includes(page) && page !== "about") {
      requestAnimationFrame(() => {
        const element = document.getElementById(page);
        if (element instanceof HTMLDetailsElement) element.open = true;
        element?.scrollIntoView({ block: "start" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
      mainRef.current?.focus({ preventScroll: true });
    }
    document.title = `${isAbout ? "About" : page === "box" ? `${boxNames[box]}’s Prayer Box` : page === "inbox" ? "Grace Church inbox" : page === "requests" ? "My Requests" : page === "prayers" ? "My Prayers" : page === "help" ? "Get Help" : page === "feedback" ? "Report a bug" : page === "church" ? "My Church" : page === "donation-history" ? "My Donations" : page === "donations" ? "Donations" : page === "settings" ? "Settings" : "Prayer Box"} · Prayer Box`;
  }, [route]);
  useEffect(() => {
    setMenuOpen(false);
    setScenario("normal");
    setDeleteStory(null);
    setUpdateStory(null);
  }, [viewer]);

  function openComposer(recipient: BoxId, initial?: PrayerRequest) {
    if (restricted.includes(viewer)) {
      notify(
        "This fictional account is temporarily restricted after a validated review. An appeal requires a human decision.",
      );
      return;
    }
    setComposer({ recipient, initial });
  }
  function saveOrganizationWebsite(value: string) {
    if (viewer !== "owner") {
      notify("Only the organization owner can change its website.");
      return;
    }
    const result = normalizeOrganizationWebsite(value);
    if (!result.valid) {
      notify(result.error);
      return;
    }
    setOrganizationWebsite(result.url);
    notify(
      result.url
        ? "Organization website saved in this demo. It is visible on Grace Church’s public prayer box."
        : "Organization website removed from this demo’s public prayer box.",
    );
  }
  function removeActor(actorId: string, reportReason?: string, evidence = "") {
    setBlocked((previous) => ({
      ...previous,
      [viewer]: [...new Set([...(previous[viewer] ?? []), actorId])],
    }));
    const current = requests.find((r) => r.id === resource);
    const recipient = current?.recipient ?? (page === "inbox" ? "grace" : box);
    const ownsAffectedBox =
      (recipient === "mine" && viewer === "elena") ||
      (recipient === "maria" && viewer === "maria") ||
      (recipient === "grace" && viewer === "owner");
    if (ownsAffectedBox)
      setBoxRemoved((previous) => ({
        ...previous,
        [recipient]: [...new Set([...(previous[recipient] ?? []), actorId])],
      }));
    if (reportReason)
      setReports((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          actorId,
          reason: reportReason,
          evidence,
          state: "open",
        },
      ]);
    notify(
      reportReason
        ? "Report recorded in the demo. This account’s content has been removed from your affected box or view."
        : "Account blocked in the demo. Its requests and linked material are removed from your affected box or view.",
    );
    navigate(
      recipient === "grace" && groupMember ? "inbox" : `box/${recipient}`,
    );
  }

  function raiseCareConcern(requestId: string) {
    const row = requests.find((request) => request.id === requestId);
    const isReviewEvidence =
      viewer === "operator" &&
      row &&
      (row.moderation !== "approved" || row.media?.status === "pending");
    if (!row || viewer === "guest" || (!canRead(row) && !isReviewEvidence)) {
      notify(
        "Only an accessible request or assigned review example can be flagged for care.",
      );
      return;
    }
    if (careConcerns.some((concern) => concern.requestId === row.id)) {
      notify(
        "A care concern is already recorded for this request. No duplicate note was added.",
      );
      return;
    }
    setCareConcerns((previous) =>
      addCareConcern(previous, {
        id: crypto.randomUUID(),
        requestId: row.id,
        authorId: row.authorId,
        title: row.topic,
        evidence: row.text,
        anonymous: row.anonymous,
        reportedBy: viewer,
        status: "new",
      }),
    );
    notify(
      "A compassionate review was requested in this demo. The request stays in place; no account was blocked, restricted or contacted.",
    );
  }

  function sendSupportNote(concernId: string) {
    const concern = careConcerns.find((item) => item.id === concernId);
    if (viewer !== "operator" || !concern || concern.status !== "new") return;
    const sourceId = requests.find(
      (row) => row.id === concern.requestId,
    )?.sourceId;
    const alreadyOffered = (note: SupportNote) =>
      note.authorId === concern.authorId &&
      (note.requestId === concern.requestId ||
        (!!sourceId &&
          requests.some(
            (row) => row.id === note.requestId && row.sourceId === sourceId,
          )));
    const existed = supportNotes.some(alreadyOffered);
    setSupportNotes((previous) =>
      previous.some(alreadyOffered)
        ? previous
        : [
            ...previous,
            {
              id: crypto.randomUUID(),
              concernId: concern.id,
              authorId: concern.authorId,
              requestId: concern.requestId,
            },
          ],
    );
    setCareConcerns((previous) =>
      previous.map((item) =>
        item.id === concern.id ? { ...item, status: "support-sent" } : item,
      ),
    );
    notify(
      existed
        ? "Support has already been offered privately for this request. No duplicate reminder was added or reopened."
        : "A private support note was added to the requester's demo notifications. No external message or emergency alert was sent.",
    );
  }

  function commitRequests(rows: PrayerRequest[]) {
    setRequests((previous) => [
      ...previous,
      ...rows.map((row) =>
        withPlatformAcknowledgment({
          ...row,
          postedAt: row.postedAt ?? new Date().toISOString(),
        }),
      ),
    ]);
    const offers = rows.filter((row) => hasSupportLanguage(row.text));
    if (offers.length)
      setSupportNotes((previous) => {
        const next = [...previous];
        for (const row of offers) {
          const concernId = `private-offer-${row.sourceId}`;
          if (!next.some((note) => note.concernId === concernId)) {
            next.push({
              id: crypto.randomUUID(),
              concernId,
              authorId: row.authorId,
              requestId: row.id,
            });
          }
        }
        return next;
      });
  }

  function deleteDeliveries(ids: string[]) {
    const removed = requests.filter(
      (row) => row.authorId === viewer && ids.includes(row.id),
    );
    if (viewer === "guest" || !removed.length) return;
    const removedIds = removed.map((row) => row.id);
    setRequests((previous) =>
      withdrawOwnDeliveries(previous, viewer, removedIds),
    );
    setSupportNotes((previous) =>
      previous.filter((note) => !removedIds.includes(note.requestId)),
    );
    setCareConcerns((previous) =>
      previous.filter((concern) => !removedIds.includes(concern.requestId)),
    );
    setHeldStories((previous) =>
      previous
        .map((story) => ({
          ...story,
          destinations: story.destinations.filter(
            (id) => !removedIds.includes(id),
          ),
        }))
        .filter((story) => story.destinations.length > 0),
    );
    setUpdateDestinations((previous) =>
      previous.filter((id) => !removedIds.includes(id)),
    );
    setDeleteStory(null);
    navigate("requests");
    notify(
      "Selected deliveries and their linked stories were deleted from this fictional session. Unselected prayer boxes keep their separate copies.",
    );
  }

  function renderBox() {
    const mine =
      box === ownBox &&
      ((viewer === "elena" && box === "mine") || viewer === "maria");
    const inaccessible = box === "mine" && viewer !== "elena";
    const rows = requests.filter(
      (r) =>
        r.recipient === box &&
        r.authorId !==
          (box === "mine" ? "elena" : box === "maria" ? "maria" : "grace") &&
        r.moderation === "approved" &&
        canRead(r),
    );
    const displayedRows = rows.filter(
      (row) => !hasPrayedForLatest(row, viewer),
    );
    const prayedRows = rows.filter((row) => hasPrayedForLatest(row, viewer));
    return (
      <>
        <div className="breadcrumb">
          <span>Prayer boxes</span>
          <Icon name="chevron" size={14} />
          <span>{boxNames[box]}</span>
          {mine && <span className="chip">Your personal box</span>}
        </div>
        <section
          className={`box-hero ${box === "grace" ? "ministry-hero" : ""}`}
          aria-labelledby="box-title"
        >
          <div className="hero-content">
            <div className="profile-heading">
              <span
                className={`avatar profile-avatar ${box === "grace" ? "sage" : ""}`}
              >
                {box === "grace" ? (
                  <Icon name="people" size={27} />
                ) : (
                  boxNames[box].slice(0, 1)
                )}
              </span>
              <div>
                <div className="profile-name">
                  {boxNames[box]}{" "}
                  {box === "maria" &&
                    canSeeMariaProfile &&
                    countryByViewer.maria?.show && (
                      <CountryFlag country={countryByViewer.maria.country} />
                    )}{" "}
                  {box === "mine" &&
                    viewer === "elena" &&
                    countryByViewer.elena?.show && (
                      <CountryFlag country={countryByViewer.elena.country} />
                    )}
                </div>
                <p>
                  {box === "grace"
                    ? "A church prayer community"
                    : mine
                      ? "Your little space to receive prayer"
                      : "A little space to pray with one another"}
                </p>
              </div>
            </div>
            <h1 id="box-title">
              {box === "grace" ? "Grace Church’s" : `${boxNames[box]}’s`} Prayer
              Box<span className="hero-dot">.</span>
            </h1>
            <p className="hero-intro">
              {box === "grace"
                ? "Bring your needs, your gratitude, and your unfinished stories. Our approved prayer community is here to receive them with care."
                : mine
                  ? "There’s room for honest requests, kind encouragement, and stories still unfolding."
                  : "You don’t have to carry it all alone. Leave a request, pray for someone, or share a little hope."}
            </p>
            {box === "grace" && (
              <OrganizationWebsiteLink value={organizationWebsite} />
            )}
            {box === "grace" && viewer === "owner" && (
              <button
                className="text-link organization-website-edit"
                onClick={() => navigate("settings")}
              >
                Edit organization website
              </button>
            )}
            {box === "maria" && offerGrace && (
              <button
                className="association-chip"
                onClick={() => navigate("box/grace")}
              >
                <Icon name="people" size={14} />
                Member of Grace Church
                <Icon name="arrow" size={13} />
              </button>
            )}
            <div className="hero-actions">
              <button className="button" onClick={() => openComposer(box)}>
                <Icon name="note" size={18} />
                Leave a prayer request
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  document.getElementById("box-requests")?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  })
                }
              >
                Pray with others <Icon name="arrow" size={17} />
              </button>
            </div>
          </div>
          <div className="hero-art">
            <BoxArt />
            <span>
              A few words.
              <br />A little hope.
            </span>
          </div>
        </section>
        {box === "grace" && (
          <section className="membership-strip">
            <div>
              <Icon name="shield" size={20} />
              <p>
                {groupMember
                  ? "You are viewing an approved member fixture. The shared inbox is separate from every personal delivery."
                  : membership === "pending"
                    ? "Your fictional membership request is waiting for the church owner. No private access yet."
                    : membership === "invited" && viewer === "elena"
                      ? "Grace Church has invited your demo account. Membership begins only when you accept."
                      : "Church approval is required to open organization-only requests. A public visit does not create membership."}
              </p>
            </div>
            {groupMember ? (
              <button
                className="button secondary compact"
                onClick={() => navigate("inbox")}
              >
                Open shared inbox <Icon name="arrow" size={16} />
              </button>
            ) : membership === "invited" && viewer === "elena" ? (
              <button
                className="button compact"
                onClick={() => {
                  setMembership("approved");
                  notify(
                    "Invitation accepted for the fictional account. Group access is now active.",
                  );
                }}
              >
                Accept demo invitation
              </button>
            ) : (
              <button
                className="button secondary compact"
                disabled={membership === "pending"}
                onClick={() => {
                  if (viewer === "guest") navigate("signup");
                  else {
                    setMembership("pending");
                    notify(
                      "Fictional membership request sent to the owner. Access is still pending.",
                    );
                  }
                }}
              >
                {membership === "pending"
                  ? "Approval pending"
                  : "Request church approval"}
              </button>
            )}
          </section>
        )}
        <div className="box-layout">
          <section
            id="box-requests"
            className="box-list"
            aria-labelledby="list-heading"
          >
            <div className="list-toolbar">
              <h2 id="list-heading">A place to pray together</h2>
              <button
                className="button secondary compact qr-share-trigger"
                aria-label="Share this prayer box"
                onClick={() => {
                  setDialog("share");
                }}
              >
                <Icon name="qr" size={18} /> Share box
              </button>
            </div>
            <p className="story-list-intro">
              One card for each request, with its updates and testimonies linked
              together inside.
            </p>
            <div id="request-list" className="request-list">
              {inaccessible || scenario === "denied" ? (
                <EmptyState
                  kind="denied"
                  onAction={() => navigate("box/maria")}
                />
              ) : scenario !== "normal" ? (
                <EmptyState
                  kind={scenario}
                  onAction={() =>
                    scenario === "empty"
                      ? openComposer(box)
                      : setScenario("normal")
                  }
                />
              ) : displayedRows.length ? (
                displayedRows.map((row) => (
                  <PrayerCard
                    key={row.id}
                    row={row}
                    outsideAudience={outsideAudience(row)}
                    onNavigate={navigate}
                  />
                ))
              ) : (
                <EmptyState kind="empty" onAction={() => openComposer(box)} />
              )}
            </div>
            <p className="list-end">
              <Icon name="heart" size={14} />
              Small words, shared with care.
            </p>
            {!inaccessible && scenario === "normal" && viewer !== "guest" && (
              <section
                className="my-prayers-section"
                aria-labelledby="box-my-prayers-title"
              >
                <div className="section-heading">
                  <h2 id="box-my-prayers-title">
                    <Icon name="heart" size={20} /> My Prayers
                  </h2>
                  <button
                    className="text-link"
                    onClick={() => navigate("prayers")}
                  >
                    All my prayers <Icon name="arrow" size={16} />
                  </button>
                </div>
                <p className="story-list-intro">
                  Requests you’ve added a prayer or encouragement to rest here.
                  A new author update or testimony brings them back above.
                </p>
                <div className="request-list">
                  {prayedRows.length ? (
                    prayedRows.map((row) => (
                      <PrayerCard
                        key={row.id}
                        row={row}
                        outsideAudience={outsideAudience(row)}
                        onNavigate={navigate}
                      />
                    ))
                  ) : (
                    <p className="my-prayers-empty">
                      After you add a prayer or encouragement, you can return to
                      that request here. Opening a request or receiving an
                      automatic reply does not move it.
                    </p>
                  )}
                </div>
              </section>
            )}
          </section>
          <aside className="box-sidebar">
            <div className="side-note butter-wash">
              <span className="side-icon">
                <Icon name="sun" size={23} />
              </span>
              <h2>You can come as you are.</h2>
              <p>
                There’s no need for perfect words. Bring your gratitude, your
                questions, or the thing that feels heavy today.
              </p>
              <button
                className="text-link"
                onClick={() => navigate("prayer-guide")}
              >
                A little guide to prayer <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="side-note faith-note">
              <span className="eyebrow">Rooted in hope</span>
              <h2>
                To the Father.
                <br />
                Through Jesus.
                <br />
                With the Holy Spirit.
              </h2>
              <p>
                We believe in one God: Father, Son, and Holy Spirit. Everyone
                seeking prayer is welcome.
              </p>
              <button className="text-link" onClick={() => navigate("about")}>
                About Prayer Box <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="side-note help-note">
              <span className="side-icon">
                <Icon name="heart" size={23} />
              </span>
              <h2>A little help, beyond prayer.</h2>
              <p>
                Find therapy, crisis support and ways to talk with someone you
                trust. You are welcome here.
              </p>
              <button className="text-link" onClick={() => navigate("help")}>
                Get Help <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="box-link-note">
              <Icon name="lock" size={16} />
              <p>
                {box === "grace"
                  ? "Organization-only means all active church-approved members. Personal boxes stay separate."
                  : "Choose who can see each request. Anonymous never displays your account identity."}
              </p>
            </div>
          </aside>
        </div>
      </>
    );
  }

  function renderMyRequests() {
    if (viewer === "guest")
      return <EmptyState kind="denied" onAction={() => navigate("signup")} />;
    const own = requests.filter((r) => r.authorId === viewer);
    const sourceIds = [...new Set(own.map((r) => r.sourceId))];
    return (
      <div className="my-requests-page">
        <header className="page-heading">
          <p className="eyebrow">
            <Icon name="lock" size={15} />
            Private to you
          </p>
          <h1 className="page-title">
            My Requests<span className="hero-dot">.</span>
          </h1>
          <p className="page-intro">
            Your words, with room to return. Each recipient has a separate
            delivery and conversation.
          </p>
        </header>
        <div className="page-toolbar">
          <button className="button" onClick={() => openComposer("maria")}>
            <Icon name="note" size={18} />A new prayer request
          </button>
          {own.length > 0 && (
            <button
              className="button secondary"
              onClick={() => setDeleteStory("all")}
            >
              Delete requests
            </button>
          )}
          <span className="quiet-copy">
            An update can be hopeful, difficult, or still unfinished.
          </span>
        </div>
        {sourceIds.length ? (
          <div className="own-request-list">
            {sourceIds.map((source) => {
              const copies = own.filter((r) => r.sourceId === source);
              const first = copies[0];
              return (
                <article className="own-request panel" key={source}>
                  <div className="section-heading">
                    <h2>{first.topic}</h2>
                    <span className="chip">Your authored request</span>
                  </div>
                  <p>{first.text}</p>
                  <div className="delivery-list">
                    {copies.map((copy) => (
                      <div className="delivery-list-row" key={copy.id}>
                        <span
                          className={`recipient-icon ${copy.recipient === "grace" ? "sage" : ""}`}
                        >
                          <Icon
                            name={copy.recipient === "grace" ? "people" : "box"}
                            size={18}
                          />
                        </span>
                        <div>
                          <strong>{boxNames[copy.recipient]}</strong>
                          <span>
                            {copy.anonymous ? "Anonymous" : "Name shown"} ·{" "}
                            {getAudienceLabel(copy.audience, copy.recipient)}
                          </span>
                          <span
                            className={`status-label ${copy.moderation === "approved" ? "" : "held"}`}
                          >
                            {copy.moderation === "approved"
                              ? copy.media?.status === "pending"
                                ? "Text delivered · media held"
                                : "Delivered in demo"
                              : copy.moderation === "appeal"
                                ? "Appeal awaiting human review"
                                : copy.moderation === "changes"
                                  ? "Changes needed · not delivered"
                                  : "Review pending · not delivered"}
                          </span>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => navigate(`request/${copy.id}`)}
                        >
                          Open <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="own-actions">
                    <button
                      className="button secondary compact"
                      onClick={() => {
                        setUpdateStory(source);
                        setUpdateDestinations([]);
                      }}
                    >
                      Add update or testimony
                    </button>
                    <button
                      className="text-link"
                      onClick={() =>
                        openComposer(
                          first.recipient === "maria" ? "grace" : "maria",
                          first,
                        )
                      }
                    >
                      Send a separate copy <Icon name="arrow" size={15} />
                    </button>
                    <button
                      className="text-link delete-action"
                      onClick={() => setDeleteStory(source)}
                    >
                      Delete request
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState kind="empty" onAction={() => openComposer("maria")} />
        )}
      </div>
    );
  }

  function renderMyPrayers() {
    if (viewer === "guest")
      return <EmptyState kind="denied" onAction={() => navigate("signup")} />;
    const rows = requests.filter(
      (row) => canRead(row) && hasPrayedForLatest(row, viewer),
    );
    return (
      <div className="my-prayers-page">
        <header className="page-heading">
          <p className="eyebrow">
            <Icon name="heart" size={16} /> Room to keep praying
          </p>
          <h1 className="page-title">
            My Prayers<span className="hero-dot">.</span>
          </h1>
          <p className="page-intro">
            Requests you’ve added a prayer or encouragement to. When the author
            shares an update or testimony, their request returns to the active
            list in its prayer box.
          </p>
        </header>
        <div className="page-toolbar">
          <button
            className="button secondary"
            onClick={() => navigate(`box/${ownBox}`)}
          >
            Back to my box <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="request-list">
          {rows.length ? (
            rows.map((row) => (
              <PrayerCard
                key={row.id}
                row={row}
                outsideAudience={outsideAudience(row)}
                onNavigate={navigate}
              />
            ))
          ) : (
            <div className="my-prayers-empty">
              <strong>There’s room to begin.</strong>
              <p>
                Add a prayer or encouragement to an accessible request, and it
                will be here for you to return to.
              </p>
              <button
                className="text-link"
                onClick={() => navigate("box/maria")}
              >
                Visit Maria’s example <Icon name="arrow" size={16} />
              </button>
            </div>
          )}
        </div>
        <p className="quiet-copy">
          Only requests you can still access are shown. Your list does not
          change anyone else’s prayer box.
        </p>
      </div>
    );
  }

  function renderInbox() {
    if (!groupMember || !roleActive)
      return (
        <>
          <header className="page-heading">
            <p className="eyebrow">Grace Church</p>
            <h1 className="page-title">A shared prayer community.</h1>
          </header>
          <EmptyState kind="denied" onAction={() => navigate("box/grace")} />
        </>
      );
    const allRows = requests.filter(
      (r) =>
        r.recipient === "grace" && r.moderation === "approved" && canRead(r),
    );
    const rows = allRows.filter((row) => !hasPrayedForLatest(row, viewer));
    const prayedRows = allRows.filter((row) => hasPrayedForLatest(row, viewer));
    const take = (row: PrayerRequest) => {
      if (row.assignedTo) {
        notify(
          `This example is already assigned to ${row.assignedTo}. The owner can explicitly reassign it.`,
        );
        return;
      }
      setRequests((previous) =>
        previous.map((r) =>
          r.id === row.id
            ? { ...r, assignedTo: viewerNames[viewer], workState: "assigned" }
            : r,
        ),
      );
      notify(
        "Request assigned to you in the demo. Every active approved member can still read it.",
      );
    };
    return (
      <>
        <header className="page-heading">
          <p className="eyebrow">
            <Icon name="people" size={16} />
            Grace Church · approved community
          </p>
          <h1 className="page-title">A little care, shared.</h1>
          <p className="page-intro">
            All active approved members can read organization requests. Taking a
            request helps share the work; it never narrows who can see it.
          </p>
          <OrganizationWebsiteLink value={organizationWebsite} />
        </header>
        <div className="inbox-toolbar">
          <span className="chip">
            <Icon name="shield" size={14} />
            Church-approved access · fictional
          </span>
          {viewer === "owner" && (
            <button
              className="button secondary compact"
              onClick={() => navigate("members")}
            >
              Manage members <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
        <div className="notice sage">
          <Icon name="lock" />
          <p>
            This is Grace Church’s shared inbox. Maria’s private personal
            deliveries and Elena’s personal box are separate. New members may
            see retained group history under the proposed policy.
          </p>
        </div>
        <div className="inbox-list">
          {rows.length ? (
            rows.map((row) => (
              <article className="inbox-card panel" key={row.id}>
                <div className="inbox-card-main">
                  <div className="section-heading">
                    <span className="eyebrow">
                      {row.workState === "follow-up"
                        ? "Follow-up"
                        : row.workState === "archived"
                          ? "Archived"
                          : row.assignedTo
                            ? "Assigned"
                            : "New"}
                    </span>
                    <span className="chip">
                      {getAudienceLabel(row.audience, "grace")}
                    </span>
                  </div>
                  <h2>
                    <button onClick={() => navigate(`request/${row.id}`)}>
                      {row.topic}
                    </button>
                  </h2>
                  <p>{row.text}</p>
                  <p className="quiet-copy">
                    {authorLabel(row)} ·{" "}
                    {row.assignedTo
                      ? `With ${row.assignedTo}`
                      : "Ready for someone to take"}
                  </p>
                </div>
                <div className="inbox-actions">
                  <button
                    className="button secondary compact"
                    onClick={() => take(row)}
                  >
                    {row.assignedTo
                      ? "Assignment details"
                      : "Take this request"}
                  </button>
                  <label className="field">
                    Work state
                    <select
                      value={row.workState}
                      onChange={(event) =>
                        setRequests((previous) =>
                          previous.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  workState: event.target
                                    .value as PrayerRequest["workState"],
                                }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="new">New</option>
                      <option value="assigned">Assigned</option>
                      <option value="follow-up">Follow-up</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  {viewer === "owner" && (
                    <label className="field">
                      Owner reassignment
                      <select
                        value={row.assignedTo ?? ""}
                        onChange={(event) => {
                          setRequests((previous) =>
                            previous.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    assignedTo: event.target.value || undefined,
                                    workState: event.target.value
                                      ? "assigned"
                                      : "new",
                                  }
                                : r,
                            ),
                          );
                          notify("Owner reassignment updated in this demo.");
                        }}
                      >
                        <option value="">Unassigned</option>
                        <option>Maria</option>
                        <option>Samuel</option>
                        <option>Grace owner</option>
                        <option>Elena</option>
                      </select>
                    </label>
                  )}
                  <button
                    className="text-link"
                    onClick={() => navigate(`request/${row.id}`)}
                  >
                    Open conversation <Icon name="arrow" size={15} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState kind="empty" onAction={() => openComposer("grace")} />
          )}
        </div>
        <p className="quiet-copy">
          Internal work states are not claims that a person has prayed or that
          God has answered.
        </p>
        <section
          className="my-prayers-section"
          aria-labelledby="inbox-my-prayers-title"
        >
          <div className="section-heading">
            <h2 id="inbox-my-prayers-title">
              <Icon name="heart" size={20} /> My Prayers
            </h2>
            <button className="text-link" onClick={() => navigate("prayers")}>
              All my prayers <Icon name="arrow" size={16} />
            </button>
          </div>
          <p className="story-list-intro">
            Your own prayed-for requests rest here until an author update. Other
            approved members keep their own lists and the same group access.
          </p>
          <div className="request-list">
            {prayedRows.length ? (
              prayedRows.map((row) => (
                <PrayerCard
                  key={row.id}
                  row={row}
                  outsideAudience={outsideAudience(row)}
                  onNavigate={navigate}
                />
              ))
            ) : (
              <p className="my-prayers-empty">
                After you add a prayer or encouragement, that request will be
                here for you.
              </p>
            )}
          </div>
        </section>
      </>
    );
  }

  function renderDetail() {
    const row = requests.find((r) => r.id === resource);
    if (!row || !canRead(row))
      return (
        <EmptyState kind="denied" onAction={() => navigate("box/maria")} />
      );
    return (
      <PrayerDetail
        key={`${row.id}-${viewer}`}
        request={row}
        viewer={viewer}
        groupMember={groupMember}
        officialAllowed={viewer === "member" && officialAllowed}
        outsideAudience={outsideAudience(row)}
        postingRestricted={restricted.includes(viewer)}
        isFriend={viewer === "elena" && friends.includes(row.authorId)}
        reminders={reminders}
        onDelete={
          row.authorId === viewer
            ? () => setDeleteStory(row.sourceId)
            : undefined
        }
        blockedActors={blockedActors}
        onRemindersChange={setReminders}
        onUpdate={(update) =>
          setRequests((previous) =>
            previous.map((r) => (r.id === row.id ? update(r) : r)),
          )
        }
        onNavigate={navigate}
        onReport={(reason, actor) =>
          removeActor(
            actor,
            reason,
            actor === row.authorId
              ? row.text
              : (row.replies.find((r) => r.actorId === actor)?.text ??
                  "Reported reply fixture"),
          )
        }
        onBlock={(actor) => removeActor(actor)}
        onCareConcern={() => raiseCareConcern(row.id)}
        onSupport={() => setDialog("support")}
        onReuse={() => {
          if (row.authorId !== viewer) {
            notify("Only the author can authorize another delivery.");
            return;
          }
          openComposer(row.recipient, row);
        }}
        onNotice={notify}
      />
    );
  }

  function renderPage() {
    if (page === "box" || page === "") return renderBox();
    if (page === "requests") return renderMyRequests();
    if (page === "prayers") return renderMyPrayers();
    if (page === "feedback")
      return (
        <Suspense
          fallback={
            <p className="quiet-copy" role="status">
              Opening the feedback form…
            </p>
          }
        >
          <FeedbackPage key={resetVersion} />
        </Suspense>
      );
    if (page === "help")
      return (
        <GetHelpPage
          onSupport={() => setDialog("support")}
          onNavigate={navigate}
        />
      );
    if (page === "request" || page === "testimony") return renderDetail();
    if (page === "inbox") return renderInbox();
    if (isAbout) return <AboutPage onNavigate={navigate} />;
    if (
      page === "settings" ||
      page === "donations" ||
      page === "donation-history"
    )
      return null;
    if (
      page === "church" ||
      page === "members" ||
      page === "signup" ||
      page === "review"
    )
      return (
        <>
          <CommunityPages
            key={resetVersion}
            page={page}
            viewer={viewer}
            requests={requests}
            onNavigate={navigate}
            onNotice={notify}
            onViewerChange={setViewer}
            onUpdateRequests={(update) =>
              setRequests((previous) =>
                update(previous).map(withPlatformAcknowledgment),
              )
            }
            onCareConcern={raiseCareConcern}
            membershipStatus={membership}
            onMembershipChange={setMembership}
            friends={friends}
            onFriendsChange={setFriends}
            memberActive={memberActive}
            onMemberActiveChange={setMemberActive}
            officialReplyAllowed={officialAllowed}
            onOfficialReplyChange={setOfficialAllowed}
            onCreateOrganization={(website) => {
              if (page !== "signup") return;
              const result = normalizeOrganizationWebsite(website);
              if (result.valid) setOrganizationWebsite(result.url);
            }}
          />
          {page === "review" && viewer === "operator" && (
            <CareReviewQueue
              concerns={careConcerns}
              onSend={sendSupportNote}
              onClose={(id) =>
                setCareConcerns((previous) =>
                  previous.map((item) =>
                    item.id === id ? { ...item, status: "closed" } : item,
                  ),
                )
              }
            />
          )}
          {page === "review" && viewer === "operator" && (
            <section className="validated-reports panel">
              <h2>Reports that need a person</h2>
              <p>
                Reports remove content from the reporter’s view immediately.
                They do not restrict an account globally until a reviewer
                validates the evidence.
              </p>
              {reports.length ? (
                reports.map((report) => (
                  <article className="report-case" key={report.id}>
                    <span className="chip">
                      {report.state === "open"
                        ? "Unverified report"
                        : report.state === "validated"
                          ? "Validated example"
                          : "Dismissed example"}
                    </span>
                    <h3>{report.reason}</h3>
                    <blockquote>{report.evidence}</blockquote>
                    {report.state === "open" ? (
                      <div className="inline-actions">
                        <button
                          className="button secondary compact"
                          onClick={() => {
                            setReports((previous) =>
                              previous.map((r) =>
                                r.id === report.id
                                  ? { ...r, state: "validated" }
                                  : r,
                              ),
                            );
                            setRestricted((previous) => [
                              ...new Set([...previous, report.actorId]),
                            ]);
                            notify(
                              "Human-review decision simulated. Account posting is restricted in this local demo.",
                            );
                          }}
                        >
                          Confirm violation & restrict demo account
                        </button>
                        <button
                          className="text-link"
                          onClick={() =>
                            setReports((previous) =>
                              previous.map((r) =>
                                r.id === report.id
                                  ? { ...r, state: "dismissed" }
                                  : r,
                              ),
                            )
                          }
                        >
                          Dismiss report
                        </button>
                      </div>
                    ) : (
                      report.state === "validated" && (
                        <button
                          className="text-link"
                          disabled={report.evaluation}
                          onClick={() => {
                            setReports((previous) =>
                              previous.map((r) =>
                                r.id === report.id
                                  ? { ...r, evaluation: true }
                                  : r,
                              ),
                            );
                            notify(
                              "Marked for a proposed deidentified evaluation set. No model is trained or connected.",
                            );
                          }}
                        >
                          {report.evaluation
                            ? "Marked for proposed evaluation set"
                            : "Mark validated example for evaluation"}
                        </button>
                      )
                    )}
                  </article>
                ))
              ) : (
                <p className="quiet-copy">
                  No user reports in this session. Try reporting a public
                  fixture to see the separate queue.
                </p>
              )}
              <p className="quiet-copy">
                No automatic retraining. Proposed learning requires validated
                reports, minimization, human labels, evaluation and approval
                before model changes.
              </p>
            </section>
          )}
        </>
      );
    return (
      <div className="welcome-page">
        <BoxArt />
        <p className="eyebrow">Welcome to Prayer Box</p>
        <h1 className="page-title">A little space for prayer.</h1>
        <p className="page-intro">
          Bring your needs to God. Pray for someone else. Return with an update,
          or simply an unfinished story.
        </p>
        <div className="inline-actions">
          <button className="button" onClick={() => navigate("signup")}>
            Create a demo box <Icon name="arrow" size={17} />
          </button>
          <button
            className="button secondary"
            onClick={() => navigate("box/maria")}
          >
            Visit Maria’s example
          </button>
        </div>
        <div className="known-boxes">
          <h2>Try a known prayer-box link</h2>
          <button className="known-box" onClick={() => navigate("box/maria")}>
            <span className="avatar">M</span>
            <span>
              Maria’s Prayer Box<small>Personal · public example</small>
            </span>
            <Icon name="arrow" />
          </button>
          <button className="known-box" onClick={() => navigate("box/grace")}>
            <span className="avatar sage">
              <Icon name="people" />
            </span>
            <span>
              Grace Church<small>Public box · approved-member inbox</small>
            </span>
            <Icon name="arrow" />
          </button>
        </div>
        <p className="quiet-copy">
          There is no discovery feed, ranking, or public member directory.
        </p>
      </div>
    );
  }

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="demo-banner">
        <span>
          <span className="demo-dot" />
          Fictional prototype{" "}
          <span className="banner-detail">· Nothing is sent or charged.</span>
        </span>
        <button onClick={() => setDialog("demo")}>
          Preview options <Icon name="settings" size={14} />
        </button>
      </div>
      <header className="app-header">
        <div className="header-inner">
          <a
            href="#box/maria"
            className="brand"
            aria-label="Prayer Box, Maria’s example"
          >
            <PrayerBoxMark size={38} />
            Prayer Box<span aria-hidden="true">✦</span>
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            {[
              {
                route: `box/${ownBox}`,
                label: "My Box",
                icon: "box",
                active: page === "box" && box === ownBox,
              },
              {
                route: "requests",
                label: "My Requests",
                icon: "note",
                active: page === "requests",
              },
              {
                route: "church",
                label: "My Church",
                icon: "people",
                active: page === "church",
              },
            ].map((item) => (
              <a
                href={`#${item.route}`}
                className={item.active ? "active" : ""}
                aria-current={item.active ? "page" : undefined}
                key={item.label}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="header-utilities">
            <button
              className="icon-button notification-button"
              aria-label="Open fictional notifications"
              onClick={() => {
                setReadSupportNotes((previous) => [
                  ...new Set([
                    ...previous,
                    ...privateSupportNotes.map((note) => note.id),
                  ]),
                ]);
                setDialog("notifications");
              }}
            >
              <Icon name="bell" />
              {(!notificationRead || unreadSupport) && (
                <span className="notification-dot" />
              )}
            </button>
            <div className="account-menu-wrap">
              <button
                className="account-trigger"
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="avatar header-avatar">
                  {viewerNames[viewer].slice(0, 1)}
                </span>
                <span className="header-name">{viewerNames[viewer]}</span>
                <Icon name="chevron" size={15} />
              </button>
              {menuOpen && (
                <>
                  <button
                    className="menu-dismiss"
                    tabIndex={-1}
                    aria-label="Close account menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <nav
                    id="account-menu"
                    className="account-menu"
                    aria-label="Account"
                  >
                    <p>Fictional {viewerNames[viewer]} account</p>
                    <a href="#box/maria" onClick={() => setMenuOpen(false)}>
                      Visit Maria’s box
                    </a>
                    <a href="#box/grace" onClick={() => setMenuOpen(false)}>
                      Grace Church
                    </a>
                    <a href="#prayers" onClick={() => setMenuOpen(false)}>
                      My Prayers
                    </a>
                    {groupMember && (
                      <a href="#inbox" onClick={() => setMenuOpen(false)}>
                        Shared church inbox
                      </a>
                    )}
                    {viewer === "owner" && (
                      <a href="#members" onClick={() => setMenuOpen(false)}>
                        Manage members
                      </a>
                    )}
                    <a href="#settings" onClick={() => setMenuOpen(false)}>
                      Settings
                    </a>
                    <a
                      href="#donation-history"
                      onClick={() => setMenuOpen(false)}
                    >
                      My Donations
                    </a>
                    <a href="#about" onClick={() => setMenuOpen(false)}>
                      About Prayer Box
                    </a>
                    <a href="#help" onClick={() => setMenuOpen(false)}>
                      Get Help
                    </a>
                    <a href="#feedback" onClick={() => setMenuOpen(false)}>
                      Report a bug
                    </a>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setDialog("demo");
                      }}
                    >
                      Switch demo viewer
                    </button>
                    <a href="#signup" onClick={() => setMenuOpen(false)}>
                      Try signup & recovery
                    </a>
                  </nav>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className={`main-container ${isAbout ? "main-about" : ""}`}
      >
        {restricted.includes(viewer) && (
          <div className="notice butter">
            <Icon name="shield" />
            <p>
              This fictional account’s posting is temporarily restricted after
              review. Existing access remains subject to its audience. Appeals
              require a human review.
            </p>
            <button
              className="text-link"
              onClick={() =>
                notify(
                  "A simulated account appeal has been recorded. Restriction remains until a person reviews it.",
                )
              }
            >
              Appeal restriction
            </button>
          </div>
        )}
        {page === "settings" && viewer !== "guest" && (
          <div className="session-settings-bar">
            <p>
              <Icon name="shield" size={17} /> Safety choices in this demo
              session
            </p>
            <button className="text-link" onClick={() => setDialog("blocked")}>
              Manage blocked accounts
            </button>
          </div>
        )}
        <div
          hidden={
            page !== "settings" &&
            page !== "donations" &&
            page !== "donation-history"
          }
        >
          <AccountPages
            key={resetVersion}
            page={
              page === "donations"
                ? "donations"
                : page === "donation-history"
                  ? "donation-history"
                  : "settings"
            }
            viewer={viewer}
            approvedMember={groupMember}
            privacyValue={privacy}
            remindersValue={reminders}
            countryPreference={
              countryByViewer[viewer] ?? { country: "none", show: false }
            }
            onCountryPreferenceChange={(next) =>
              setCountryByViewer((previous) => ({
                ...previous,
                [viewer]: next,
              }))
            }
            associationVisibleValue={!!associationByViewer[viewer]}
            onAssociationVisibleChange={(next) =>
              setAssociationByViewer((previous) => ({
                ...previous,
                [viewer]: next,
              }))
            }
            onNavigate={navigate}
            onNotice={notify}
            onPrivacyChange={setPrivacy}
            onRemindersChange={setReminders}
            organizationWebsite={organizationWebsite}
            onOrganizationWebsiteChange={saveOrganizationWebsite}
            onAutomaticChange={(enabled, scope, message) => {
              if (
                viewer !== "elena" &&
                viewer !== "maria" &&
                viewer !== "owner"
              ) {
                if (enabled)
                  notify(
                    "This viewer’s personal box is not part of the sample deliveries. No other person’s box has been changed.",
                  );
                return;
              }
              const target: BoxId =
                scope === "grace" && viewer === "owner"
                  ? "grace"
                  : viewer === "maria"
                    ? "maria"
                    : "mine";
              setAutomatic((previous) => ({ ...previous, [target]: enabled }));
              if (message)
                setAutomaticMessages((previous) => ({
                  ...previous,
                  [target]: message,
                }));
            }}
          />
        </div>
        {renderPage()}
        {page === "requests" &&
          heldStories.some((story) => story.authorId === viewer) && (
            <section className="held-stories panel">
              <h2>Your story drafts in review</h2>
              {heldStories
                .filter((story) => story.authorId === viewer)
                .map((story) => (
                  <article className="report-case" key={story.id}>
                    <span className="chip">
                      {story.state === "appeal"
                        ? "Appeal awaiting a person"
                        : story.state === "changes"
                          ? "Changes requested"
                          : "Review pending"}
                    </span>
                    <p>{story.text}</p>
                    <p className="quiet-copy">
                      {story.reason} This story is not visible on the original
                      request or any recipient’s linked page.
                    </p>
                    {story.state !== "appeal" && (
                      <button
                        className="text-link"
                        onClick={() =>
                          setHeldStories((previous) =>
                            previous.map((item) =>
                              item.id === story.id
                                ? { ...item, state: "appeal" }
                                : item,
                            ),
                          )
                        }
                      >
                        Appeal for human review
                      </button>
                    )}
                  </article>
                ))}
            </section>
          )}
        {page === "review" &&
          viewer === "operator" &&
          heldStories.length > 0 && (
            <section className="held-stories panel">
              <h2>Linked stories awaiting review</h2>
              {heldStories.map((story) => (
                <article className="report-case" key={story.id}>
                  <span className="chip">
                    {story.state === "appeal"
                      ? "Author appeal"
                      : "Held story draft"}
                  </span>
                  <p>{story.text}</p>
                  <p className="quiet-copy">{story.reason}</p>
                  <div className="inline-actions">
                    <button
                      className="button secondary compact"
                      onClick={() => {
                        const plan = storyPublicationPlan(
                          requests,
                          story.authorId,
                          story.destinations,
                          restricted.includes(story.authorId),
                        );
                        if (!plan.ready.length) {
                          notify(
                            restricted.includes(story.authorId)
                              ? "This author's posting restriction is still active. The story remains held until that restriction is reviewed."
                              : "No selected original delivery is currently approved. This story draft remains held; nothing was published.",
                          );
                          return;
                        }
                        setRequests((previous) =>
                          publishStoryPost(
                            previous,
                            story.authorId,
                            plan.ready,
                            {
                              text: story.text,
                              kind: story.kind,
                              createdAt: new Date().toISOString(),
                            },
                            () => `story-${crypto.randomUUID()}`,
                          ),
                        );
                        setHeldStories((previous) =>
                          previous.flatMap((item) =>
                            item.id !== story.id
                              ? [item]
                              : plan.held.length
                                ? [
                                    {
                                      ...item,
                                      destinations: plan.held,
                                      reason:
                                        "This draft remains held for the remaining destinations because their original requests are not currently approved. No story was published to those boxes.",
                                    },
                                  ]
                                : [],
                          ),
                        );
                        notify(
                          plan.held.length
                            ? "Story approved only for currently eligible deliveries. Its remaining destinations stay in the review queue with the draft preserved."
                            : "Story approved in the simulated human-review queue. Its selected delivery audiences remain unchanged.",
                        );
                      }}
                    >
                      Simulate human approval
                    </button>
                    <button
                      className="text-link"
                      onClick={() => {
                        setHeldStories((previous) =>
                          previous.map((item) =>
                            item.id === story.id
                              ? {
                                  ...item,
                                  state: "changes",
                                  reason:
                                    "Human review requests changes to remove payment instructions or unsafe details before sharing. An appeal remains available.",
                                }
                              : item,
                          ),
                        );
                        notify(
                          "Story remains unpublished. The author can read the reason and appeal.",
                        );
                      }}
                    >
                      Request changes
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
      </main>
      <footer className="site-footer">
        <div>
          <a href="#home" className="footer-brand">
            <PrayerBoxMark size={30} />
            Prayer Box
          </a>
          <p>A little space for prayer, encouragement, and hope.</p>
        </div>
        <nav aria-label="Footer">
          <a href="#about">About</a>
          <a href="#donations">Donations</a>
          <a href="#help">Get Help</a>
          <a href="#feedback">Report a bug</a>
          <button onClick={() => setDialog("support")}>
            Support resources
          </button>
          <button onClick={() => setDialog("demo")}>Prototype details</button>
        </nav>
        <p className="footer-foundation">
          One God · Father, Son, and Holy Spirit
        </p>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile main navigation">
        {[
          {
            route: `box/${ownBox}`,
            label: "My Box",
            icon: "box",
            active: page === "box" && box === ownBox,
          },
          {
            route: "requests",
            label: "My Requests",
            icon: "note",
            active: page === "requests",
          },
          {
            route: "church",
            label: "My Church",
            icon: "people",
            active: page === "church",
          },
        ].map((item) => (
          <a
            href={`#${item.route}`}
            className={item.active ? "active" : ""}
            aria-current={item.active ? "page" : undefined}
            key={item.label}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Icon name="info" size={18} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss update"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {composer && (
        <PrayerComposer
          key={`${composer.recipient}-${composer.initial?.id ?? "new"}`}
          {...composer}
          viewer={viewer}
          privacy={privacy}
          automatic={automatic}
          automaticMessages={automaticMessages}
          offerGrace={offerGrace}
          boxCeilings={accessContext.boxCeilings}
          onClose={() => setComposer(null)}
          onCommit={commitRequests}
          onNavigate={navigate}
          onSignIn={() => setViewer("elena")}
        />
      )}
      {deleteStory && viewer !== "guest" && (
        <DeleteRequests
          key={`${deleteStory}-${viewer}`}
          requests={requests.filter(
            (row) =>
              row.authorId === viewer &&
              (deleteStory === "all" || row.sourceId === deleteStory),
          )}
          onClose={() => setDeleteStory(null)}
          onDelete={deleteDeliveries}
        />
      )}
      {dialog === "demo" && (
        <Modal
          title="Explore the fictional prototype"
          onClose={() => setDialog(null)}
        >
          <p className="form-intro">
            Everything resets when this page reloads. These controls let you
            compare roles and boundary states.
          </p>
          <label className="field">
            View as
            <select
              value={viewer}
              onChange={(event) => setViewer(event.target.value as Viewer)}
            >
              <option value="elena">
                Elena · personal account, not initially a church member
              </option>
              <option value="maria">
                Maria · owner of Maria’s personal box
              </option>
              <option value="member">
                Samuel · approved Grace Church member
              </option>
              <option value="owner">Grace Church owner</option>
              <option value="guest">Visitor · no account</option>
              <option value="operator">
                Platform reviewer · no general private inbox access
              </option>
            </select>
          </label>
          <label className="field">
            Box-list scenario
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value as Scenario)}
            >
              <option value="normal">Normal fictional content</option>
              <option value="empty">Empty</option>
              <option value="loading">Loading</option>
              <option value="error">Interrupted / retry</option>
              <option value="denied">Access denied</option>
            </select>
          </label>
          <div className="prototype-boundary">
            <Icon name="shield" />
            <p>
              Presentation logic only. Every fixture is bundled in the browser.
              No live authentication, authorization, screening, CAPTCHA, secure
              upload, payment, or production protection is connected.
            </p>
          </div>
          <div className="demo-route-grid">
            <button
              className="button secondary compact"
              onClick={() => {
                navigate("box/maria");
                setDialog(null);
              }}
            >
              Maria’s public box
            </button>
            <button
              className="button secondary compact"
              onClick={() => {
                navigate("box/grace");
                setDialog(null);
              }}
            >
              Grace Church
            </button>
            <button
              className="button secondary compact"
              onClick={() => {
                navigate("inbox");
                setDialog(null);
              }}
            >
              Member inbox
            </button>
            <button
              className="button secondary compact"
              onClick={() => {
                setViewer("operator");
                navigate("review");
                setDialog(null);
              }}
            >
              Review queue
            </button>
          </div>
          <p className="quiet-copy">
            Confirmed: church-approved access, sender-chosen separate
            deliveries, anonymous identity protection, and a Trinitarian
            foundation. Proposed: exact public wording, Bible edition,
            future-member history, retention, block/group semantics, moderation
            operations, providers and donation surplus policy.
          </p>
          <div className="modal-actions">
            <button
              className="text-link"
              onClick={() => {
                setRequests(cloneFixtures());
                setOrganizationWebsite("https://example.org/");
                setBlocked({});
                setBoxRemoved({});
                setReports([]);
                setCareConcerns([]);
                setSupportNotes([]);
                setDismissedSupportNotes([]);
                setReadSupportNotes([]);
                setRestricted([]);
                setMembership("none");
                setMemberActive(true);
                setOfficialAllowed(false);
                setFriends(["maria", "daniel"]);
                setPrivacyByViewer({ elena: "private", maria: "public" });
                setCountryByViewer({ maria: { country: "us", show: true } });
                setAssociationByViewer({ maria: true });
                setHeldStories([]);
                setReminders(true);
                setAutomatic({ mine: false, maria: false, grace: false });
                setAutomaticMessages({});
                setResetVersion((version) => version + 1);
                setScenario("normal");
                notify(
                  "Fictional requests, memberships, reports and safety choices reset.",
                );
              }}
            >
              Reset shared demo data
            </button>
            <button className="button" onClick={() => setDialog(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {dialog === "notifications" && (
        <Modal title="A quiet little update" onClose={() => setDialog(null)}>
          <p className="quiet-copy">
            In-app fictional notices. No sensitive prayer text, identity, or
            media appears in a preview.
          </p>
          <PrivateSupportNotifications
            notes={privateSupportNotes}
            onOpen={() => setDialog("support")}
            onDismiss={(id) =>
              setDismissedSupportNotes((previous) => [...previous, id])
            }
          />
          <button
            className="notification-item"
            onClick={() => {
              setNotificationRead(true);
              setDialog(null);
              navigate("requests");
            }}
          >
            <span className="side-icon">
              <Icon name="note" />
            </span>
            <span>
              <strong>You have a new Prayer Box update.</strong>
              <small>
                Open My Requests to see only deliveries your account can access.
              </small>
            </span>
            <Icon name="arrow" />
          </button>
          <p className="quiet-copy">
            Contact is optional. Email prayer, SMS prayer, email marketing, and
            SMS marketing consent are separate. No external notifications are
            connected.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setNotificationRead(true);
              setDialog(null);
            }}
          >
            Mark example as read
          </button>
        </Modal>
      )}
      {dialog === "support" && (
        <Modal
          title="Support is here for you"
          onClose={() => setDialog(null)}
          wide
        >
          <CareResources />
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setDialog(null);
                navigate("help");
              }}
            >
              More ways to Get Help
            </button>
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Close resources
            </button>
          </div>
        </Modal>
      )}
      {dialog === "share" && (
        <Modal
          title="Share this little box"
          onClose={() => setDialog(null)}
          wide
        >
          <SharePrayerBoxQr key={box} box={box} boxName={boxNames[box]} />
        </Modal>
      )}
      {dialog === "blocked" && (
        <Modal
          title="Blocked in this demo session"
          onClose={() => setDialog(null)}
        >
          <p>
            Blocks follow the real actor even if a reply uses the church’s name.
            Anonymous account labels stay anonymous.
          </p>
          {blockedActors.length ? (
            blockedActors.map((id, index) => (
              <div className="blocked-row" key={id}>
                <span>
                  Blocked account {index + 1}
                  <small>Identity stays hidden in this management view.</small>
                </span>
                <button
                  className="button secondary compact"
                  onClick={() => {
                    setBlocked((previous) => ({
                      ...previous,
                      [viewer]: (previous[viewer] ?? []).filter(
                        (actor) => actor !== id,
                      ),
                    }));
                    notify(
                      "Personal block removed. Content removed from an owned box is not automatically republished.",
                    );
                  }}
                >
                  Unblock
                </button>
              </div>
            ))
          ) : (
            <p className="notice sage">
              No accounts are blocked by this viewer in the current session.
            </p>
          )}
          <p className="quiet-copy">
            A personal unblock does not dismiss a report or reverse a separate
            validated restriction. Group-access and retention policy remains a
            launch decision.
          </p>
        </Modal>
      )}
      {updateStory && (
        <Modal
          title="There’s room for your unfolding story"
          onClose={() => setUpdateStory(null)}
          wide
        >
          <p>
            An update can share a little hope, a difficult day, or something
            that is still unresolved. Choose exactly which existing deliveries
            should receive it.
          </p>
          <label className="field">
            Kind of story
            <select
              value={updateKind}
              onChange={(event) =>
                setUpdateKind(event.target.value as "testimony" | "update")
              }
            >
              <option value="update">Update · still unfolding</option>
              <option value="testimony">Testimony · gratitude and hope</option>
            </select>
          </label>
          <label className="field">
            Fictional update
            <textarea
              rows={5}
              value={updateText}
              maxLength={5000}
              onChange={(event) => setUpdateText(event.target.value)}
            />
          </label>
          <fieldset className="destination-fieldset">
            <legend>Update these deliveries</legend>
            {requests
              .filter(
                (r) =>
                  r.sourceId === updateStory &&
                  r.authorId === viewer &&
                  r.moderation === "approved",
              )
              .map((row) => (
                <label className="check-row" key={row.id}>
                  <input
                    type="checkbox"
                    checked={updateDestinations.includes(row.id)}
                    onChange={(event) =>
                      setUpdateDestinations((previous) =>
                        event.target.checked
                          ? [...previous, row.id]
                          : previous.filter((id) => id !== row.id),
                      )
                    }
                  />
                  <span>
                    <strong>{boxNames[row.recipient]}</strong>
                    <small>
                      {row.anonymous ? "Anonymous" : "Name shown"} · inherits{" "}
                      {getAudienceLabel(row.audience, row.recipient)} and any
                      stricter account limit
                    </small>
                  </span>
                </label>
              ))}
          </fieldset>
          <p className="quiet-copy">
            No other destination, reply or conversation is copied. The linked
            story inherits this delivery’s audience and anonymous identity.
            Media would have its own review.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setUpdateStory(null)}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={
                restricted.includes(viewer) ||
                !updateDestinations.length ||
                !updateText.trim()
              }
              onClick={() => {
                const plan = storyPublicationPlan(
                  requests,
                  viewer,
                  updateDestinations,
                  restricted.includes(viewer),
                );
                if (!plan.ready.length || plan.held.length) {
                  setUpdateDestinations(plan.ready);
                  notify(
                    "The selected delivery or posting permissions have changed. Your draft is still here; review the available destinations before sharing.",
                  );
                  return;
                }
                const check = screenText(updateText);
                if (check.state === "approved") {
                  setRequests((previous) =>
                    publishStoryPost(
                      previous,
                      viewer,
                      updateDestinations,
                      {
                        text: updateText,
                        kind: updateKind,
                        createdAt: new Date().toISOString(),
                      },
                      () => `story-${crypto.randomUUID()}`,
                    ),
                  );
                  notify(
                    "Fictional linked story added only to the selected deliveries after the demo check.",
                  );
                } else {
                  setHeldStories((previous) => [
                    ...previous,
                    {
                      id: crypto.randomUUID(),
                      authorId: viewer,
                      sourceId: updateStory,
                      destinations: [...updateDestinations],
                      text: updateText,
                      kind: updateKind,
                      state: check.state === "changes" ? "changes" : "pending",
                      reason: check.reason,
                    },
                  ]);
                  notify(
                    "Story held for review in My Requests. It has not been shared with recipients.",
                  );
                }
                setUpdateStory(null);
              }}
            >
              Add example story
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
