import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  authorLabel,
  canViewRequest,
  getAudienceLabel,
  getEffectiveAudience,
  isOwnPrayerBox,
  screenText,
  seedRequests,
} from "./domain";
import type { Audience, BoxId, PrayerRequest, Viewer } from "./domain";
import { BoxArt, CountryFlag, Icon, Modal, PrayerBoxMark } from "./ui";
import PrayerComposer from "./components/PrayerComposer";
import PrayerDetail from "./components/PrayerDetail";
import AccountPages from "./components/AccountPages";
import ProfilePictureSettings from "./components/ProfilePictureSettings";
import AboutPage from "./components/AboutPage";
import CommunityPages, { FriendInvitation } from "./components/CommunityPages";
import { BoxConnectionButton } from "./components/BoxConnectionButton";
import { UsernameSettings } from "./components/UsernameSettings";
import { PrayerGroups } from "./components/PrayerGroups";
import { groupPeople, initialPrayerGroups, isGroupAdmin, canModerateGroup, visibleGroupNotices } from "./prayer-groups";
import type { GroupState, GroupNotice } from "./prayer-groups";
import { groupRemovalReasons, removeGroupContent } from "./group-moderation";
import { NotificationPreferences, defaultNotificationChoices } from "./components/NotificationPreferences";
import type { NotificationChoices } from "./components/NotificationPreferences";
import { AccountRecovery } from "./components/AccountRecovery";
import { PrayerEvents, ConnectionsPanel } from "./components/PrayerEvents";
import { initialPrayerConnections, requestPrayerConnection, invitationsForViewer, visibleConnectionRequests } from "./prayer-events";
import type { EventContext, EventHost, PrayerConnection, PrayerEventState } from "./prayer-events";

import CareResources from "./components/CareResources";
import GetHelpPage from "./components/GetHelpPage";
import DeleteRequests from "./components/DeleteRequests";
import { OrganizationWebsiteLink } from "./components/OrganizationWebsite";
import SharePrayerBoxQr from "./components/SharePrayerBoxQr";
import { useAppInstall } from "./app-install";
import { useActionFeedback } from "./action-feedback";
import type { FeedbackTone } from "./feedback-cues";
import { defaultWidgetPreferences } from "./widgets";
import type { WidgetPreferences } from "./widgets";
import type { UiLanguage } from "./localization";
import {
  formatStoryDate,
  getStoryPosts,
  hasPrayedForLatest,
  publishStoryPost,
  storyPublicationPlan,
  storyReportEvidence,
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
import { recipientNames, prayerRecipients, recipientActor } from "./recipients";

const initialEventPeople = [...groupPeople, { id: 'team', name: 'Prayer Box', username: 'prayerbox', active: true }];
const initialConnections = () => initialEventPeople.flatMap(person => initialPrayerConnections(person.id));
function initialEvents(): PrayerEventState {
  const now = Date.now();
  return { shares: [], dismissals: [], events: [{ id: 'sample-morning-prayer', host: { kind: 'person', id: 'team' }, title: 'Morning prayer together', description: 'A sample invitation to make a little space for prayer and gratitude. This preview has no live meeting.', format: 'virtual', meetingUrl: 'https://example.org/prayer-preview', startsAt: new Date(now + 2 * 86400000).toISOString(), endsAt: new Date(now + 2 * 86400000 + 1800000).toISOString(), timeZone: 'America/New_York', audience: 'connections', shareable: true, createdAt: now, updatedAt: now, version: 1 }] };
}

const initialUpdateText = "The story is still unfolding. I am thankful for a little more peace today, and I am still asking for wisdom for the next step.";

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
const MobileAppPage = lazy(() =>
  import("./components/MobileAppPage").catch(() => ({
    default: () => (
      <section className="empty-state">
        <h1>Prayer Box on your home screen</h1>
        <p>
          The app guide couldn’t load. Please reload the page and try again.
        </p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </section>
    ),
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
  team: "Prayer Box team",
};
const boxNames = recipientNames;
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
    <article className={`prayer-card panel ${posts.some(post => post.kind === "testimony") ? "testimony-card" : ""}`}>
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
        <button onClick={() => onNavigate(latest ? `request/${row.id}/post/${encodeURIComponent(latest.id)}` : `request/${row.id}`)}>
          {row.topic}
        </button>
      </h3>
      <p className="card-prayer-text">{latest?.text ?? row.text}</p>
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
          onClick={() => onNavigate(latest ? `request/${row.id}/post/${encodeURIComponent(latest.id)}` : `request/${row.id}`)}
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
  receivingOwnBox = false,
}: {
  kind: Scenario;
  onAction: () => void;
  receivingOwnBox?: boolean;
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
              : receivingOwnBox
                ? "Your box is ready to receive requests from others. To ask for prayer, visit someone else’s box."
                : "There aren’t any requests in this view yet. You’re welcome to begin with a few honest words."}
      </p>
      <button className="button secondary" onClick={onAction}>
        {kind === "error"
          ? "Try again"
          : kind === "loading"
            ? "Finish loading demo"
            : kind === "denied"
              ? "Return to a public box"
              : receivingOwnBox
                ? "Visit another prayer box"
                : "Leave a prayer request"}
      </button>
    </div>
  );
}

export default function App() {
  const appInstall = useAppInstall();
  const feedback = useActionFeedback();
  const [route, setRoute] = useState(
    () => window.location.hash.slice(1) || "box/maria",
  );
  const [viewer, setViewer] = useState<Viewer>("elena");
  const [language, setLanguage] = useState<UiLanguage>("en");
  const [widgetPreferences, setWidgetPreferences] = useState<WidgetPreferences>(
    defaultWidgetPreferences,
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const [requests, setRequests] = useState<PrayerRequest[]>(cloneFixtures);
  const [prayerGroups, setPrayerGroups] = useState<GroupState>(initialPrayerGroups);
  const [profileUsernames, setProfileUsernames] = useState<Partial<Record<Viewer, string>>>({});
  const eventPeople = initialEventPeople.map(person => ({ ...person, username: profileUsernames[person.id as Viewer] ?? person.username }));
  const groupDirectoryPeople = eventPeople.filter(person => person.id !== "team");
  const [connections, setConnections] = useState<PrayerConnection[]>(initialConnections);
  const [prayerEvents, setPrayerEvents] = useState<PrayerEventState>(initialEvents);
  const [connectionSuggestions, setConnectionSuggestions] = useState<EventHost[]>([]);
  const [notificationChoices, setNotificationChoices] = useState<Partial<Record<Viewer, NotificationChoices>>>({});

  const graceGroup = prayerGroups.find(group => group.id === "grace")!;
  const organizationWebsite = graceGroup.website;
  const boxNames = { ...recipientNames, grace: graceGroup.name };
  const graceMembers = graceGroup.archivedAt ? [] : graceGroup.members.filter(member => member.status === "approved" && member.active);
  const graceElena = graceGroup.members.find(member => member.id === "elena");
  const membership: Membership = !graceGroup.archivedAt && graceElena && ["pending", "invited", "approved"].includes(graceElena.status) ? graceElena.status as Membership : "none";
  const memberActive = graceMembers.some(member => member.id === "member");
  const groupAdmin = isGroupAdmin(graceGroup, viewer);
  const isOwnBox = (actor: string, target: BoxId) => isOwnPrayerBox(actor, target, graceGroup.ownerId);
  const [groupNotices, setGroupNotices] = useState<GroupNotice[]>([]);
  function addGroupNotices(notices: GroupNotice[]) {
    setGroupNotices(previous => [...previous, ...notices.filter(notice => !previous.some(old => old.id === notice.id))]);
  }
  function updatePrayerGroups(next: GroupState, notices: GroupNotice[] = []) {
    addGroupNotices(notices);
    setPrayerGroups(next);
    const nextGrace = next.find(group => group.id === "grace");
    const groupBlocked = nextGrace?.members.filter(member => member.status === "blocked").map(member => member.id) ?? [];
    if (groupBlocked.length) setBoxRemoved(previous => ({ ...previous, grace: [...new Set([...(previous.grace ?? []), ...groupBlocked])] }));
  }
  const [friends, setFriends] = useState(["maria", "daniel"]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<string[]>([]);
  const [friendInvitationStatus, setFriendInvitationStatus] = useState<"pending" | "accepted" | "declined">("pending");
  const [privacyByViewer, setPrivacyByViewer] = useState<
    Partial<Record<Viewer, Audience>>
  >({ elena: "private", maria: "public" });
  const [profilePicturesByViewer, setProfilePicturesByViewer] = useState<Partial<Record<Viewer, string>>>({});
  const [countryByViewer, setCountryByViewer] = useState<
    Partial<Record<Viewer, { country: string; show: boolean }>>
  >({ maria: { country: "us", show: true } });
  const [associationByViewer, setAssociationByViewer] = useState<
    Partial<Record<Viewer, boolean>>
  >({ maria: true });
  const [inPersonReminders, setInPersonReminders] = useState<Partial<Record<Viewer, boolean>>>({});
  const reminders = inPersonReminders[viewer] ?? true;
  const setReminders = (value: boolean) => setInPersonReminders(previous => ({ ...previous, [viewer]: value }));
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
  const eventContext: EventContext = { people: eventPeople, groups: prayerGroups, connections,
    blocks: Object.entries(blocked).flatMap(([blockerId, ids]) => (ids ?? []).map(blockedId => ({blockerId, blockedId}))) };
  const currentInvitations = invitationsForViewer(prayerEvents, viewer, eventContext);
  const incomingConnections = visibleConnectionRequests(connections, viewer, eventContext).filter(row => row.direction === 'incoming');
  function offerConnection(hosts: EventHost[], showStatus = false) {
    if (viewer === 'guest') return;
    const choices = hosts.filter((host, index) => hosts.findIndex(other => other.id === host.id && other.kind === host.kind) === index).filter(host => {
      try { return requestPrayerConnection(connections, viewer, host, eventContext).some(row => row.status === 'pending' && !connections.some(old => old.id === row.id && old.status === 'pending')); } catch { return false; }
    });
    setConnectionSuggestions(choices);
    if (showStatus && !choices.length) acknowledge('info', 'Review this connection in My Church.', 'It may already be connected, awaiting a reply, or unavailable.');
  }
  const [reports, setReports] = useState<Report[]>([]);
  const [careConcerns, setCareConcerns] = useState<CareConcern[]>([]);
  const [supportNotes, setSupportNotes] = useState<SupportNote[]>([]);
  const [dismissedSupportNotes, setDismissedSupportNotes] = useState<string[]>(
    [],
  );
  const [readSupportNotes, setReadSupportNotes] = useState<string[]>([]);
  const [heldStories, setHeldStories] = useState<HeldStory[]>([]);
  const storyAppealFocusFor = useRef<string | null>(null);
  const [restricted, setRestricted] = useState<string[]>([]);
  const [composer, setComposer] = useState<{
    recipient: BoxId;
    initial?: PrayerRequest;
  } | null>(null);
  const [dialog, setDialog] = useState<
    "demo" | "notifications" | "blocked" | "share" | "support" | null
  >(null);
  const [requestSearch, setRequestSearch] = useState("");
  const [deleteStory, setDeleteStory] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const [updateStory, setUpdateStory] = useState<string | null>(null);
  const [updateKind, setUpdateKind] = useState<"testimony" | "update">(
    "update",
  );
  const [updateText, setUpdateText] = useState(initialUpdateText);
  const [updateDestinations, setUpdateDestinations] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [storyReadByViewer, setStoryReadByViewer] = useState<Partial<Record<Viewer, string[]>>>({});
  const readStoryNoticeIds = storyReadByViewer[viewer] ?? [];
  function setReadStoryNoticeIds(update: string[] | ((previous: string[]) => string[])) {
    setStoryReadByViewer(previous => ({ ...previous, [viewer]: typeof update === "function" ? update(previous[viewer] ?? []) : update }));
  }
  const mainRef = useRef<HTMLElement>(null);
  const cleanRoute = route.split("?")[0];
  const [page, resource, postSegment, postResource] = cleanRoute.split("/");
  const focusedPostId = (() => {
    if (postSegment !== "post" || !postResource) return undefined;
    try { return decodeURIComponent(postResource); } catch { return undefined; }
  })();
  const isAbout = aboutAnchors.includes(page);
  const box: BoxId =
    prayerRecipients.some(person => person.id === resource) ? resource as BoxId : "maria";
  const roleActive = viewer === "member" ? memberActive : true;
  const groupMember = graceMembers.some(member => member.id === viewer);
  const officialAllowed = groupMember && !!graceGroup.members.find(member => member.id === viewer)?.officialReply;
  const privacy = privacyByViewer[viewer] ?? "private";
  const myGroupNotices = visibleGroupNotices(groupNotices, viewer);
  const unreadGroupNotice = myGroupNotices.some(notice => !notice.readAt);
  const privateSupportNotes = visibleSupportNotes(supportNotes, viewer).filter(
    (note) => !dismissedSupportNotes.includes(note.id),
  );
  const unreadSupport = privateSupportNotes.some(
    (note) => !readSupportNotes.includes(note.id),
  );
  const blockedActors = blocked[viewer] ?? [];
  const accessContext = {
    graceApprovedMemberIds: graceMembers.map(member => member.id),
    elenaApprovedMember: membership === "approved",
    memberActive,
    acceptedElenaFriends: friends,
    boxCeilings: {
      maria: privacyByViewer.maria ?? "public",
      mine: "private",
      grace: "public",
      daniel: "public", jordan: "public", prayerbox: "private",
    } as Record<BoxId, Audience>,
  };
  const canRead = (row: PrayerRequest) =>
    canViewRequest(row, viewer, accessContext) &&
    (row.recipient !== "grace" || !graceGroup.archivedAt && !graceGroup.members.some(member => member.id === viewer && member.status === "blocked")) &&
    !blockedActors.includes(row.authorId) &&
    !(boxRemoved[row.recipient] ?? []).includes(row.authorId);
  const outsideAudience = (row: PrayerRequest) =>
    getEffectiveAudience(
      row.audience,
      row.authorCeiling,
      accessContext.boxCeilings[row.recipient],
    );
  const storyNotices = requests.filter(row => row.moderation === "approved" && canRead(row)).flatMap(row => getStoryPosts(row).map(post => ({ row, post, key: `${row.id}/${post.id}` }))).sort((a,b) => Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt));
  const notificationRead = storyNotices.every(notice => readStoryNoticeIds.includes(notice.key));
  const ownBox: BoxId =
    viewer === "team" ? "prayerbox" : viewer === "maria" ? "maria" : viewer === "elena" ? "mine" : viewer === graceGroup.ownerId && groupMember ? "grace" : "mine";
  const canSeeMariaProfile =
    viewer === "maria" ||
    (privacyByViewer.maria ?? "public") === "public" ||
    (privacyByViewer.maria === "friends" &&
      viewer === "elena" &&
      friends.includes("maria"));
  const offerGrace = !!associationByViewer.maria && canSeeMariaProfile && graceMembers.some(member => member.id === "maria");

  function setPrivacy(next: Audience) {
    setPrivacyByViewer((previous) => ({ ...previous, [viewer]: next }));
    setRequests((previous) =>
      previous.map((row) =>
        row.authorId === viewer ? { ...row, authorCeiling: next } : row,
      ),
    );
  }

  function notify(message: string) {
    feedback.showNotice(message);
  }
  function acknowledge(tone: FeedbackTone, title: string, message?: string) {
    feedback.prepare();
    feedback.respond({ tone, title, message });
  }
  function changeViewer(next: Viewer) {
    feedback.clear();
    setRequestSearch("");
    if (next !== viewer) {
      setConnectionSuggestions([]);
      setUpdateStory(null);
      setUpdateText(initialUpdateText);
      setUpdateKind("update");
      setUpdateDestinations([]);
    }
    if (next !== viewer && viewer !== "guest") setComposer(null);
    setViewer(next);
  }
  function navigate(destination: string) {
    const target =
      destination === "box"
        ? `box/${ownBox}`
        : destination.replace(/^testimony\//, "request/");
    setMenuOpen(false);
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
    };
  }, []);
  useEffect(() => {
    const storyTarget = requests.find(row => row.id === resource);
    const detailOwnsFocus = (page === "request" || page === "testimony") && focusedPostId && storyTarget && canRead(storyTarget) && (focusedPostId === "original" || getStoryPosts(storyTarget).some(post => post.id === focusedPostId));
    if (detailOwnsFocus) {
      // The detail view focuses and scrolls the exact notified post.
    } else if (aboutAnchors.includes(page) && page !== "about") {
      requestAnimationFrame(() => {
        const element = document.getElementById(page);
        if (element instanceof HTMLDetailsElement) element.open = true;
        element?.scrollIntoView({ block: "start" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
      mainRef.current?.focus({ preventScroll: true });
    }

  }, [route]);
  useEffect(() => {
    const titles: Record<string, string> = { requests: 'My Requests', prayers: 'My Prayers', help: 'Get Help', feedback: 'Report a bug', app: 'Mobile app', church: 'My Church', 'donation-history': 'My Donations', donations: 'Donations', settings: 'Settings', signup: 'Create your prayer box', groups: 'Your prayer groups', events: 'Prayer events', invitations: 'Invitations', connections: 'Connections', recovery: 'Account recovery', signin: 'Sign in', 'notification-preferences': 'Notification choices' };
    const title = isAbout ? 'About' : page === 'box' ? `${boxNames[box]}’s Prayer Box` : page === 'inbox' ? `${graceGroup.name} inbox` : page === 'members' ? graceGroup.name : page === 'group' ? prayerGroups.find(group => group.username === resource && !group.archivedAt)?.name ?? 'Prayer group' : titles[page];
    document.title = title ? `${title} · Prayer Box` : 'Prayer Box';
  }, [page, resource, box, isAbout, graceGroup.name, prayerGroups]);
  useEffect(() => {
    setMenuOpen(false);
    setDeleteStory(null);
    setUpdateStory(null);
  }, [viewer]);
  useEffect(() => {
    const id = storyAppealFocusFor.current;
    if (!id) return;
    storyAppealFocusFor.current = null;
    const story = heldStories.find((item) => item.id === id);
    if (
      page === "requests" &&
      story?.authorId === viewer &&
      story.state === "appeal"
    )
      document.getElementById(`held-story-status-${id}`)?.focus();
  }, [heldStories, page, viewer]);

  function openComposer(recipient: BoxId, initial?: PrayerRequest) {
    if (recipient === "grace" && (graceGroup.archivedAt || graceGroup.members.some(member => member.id === viewer && member.status === "blocked"))) {
      acknowledge("info", "This prayer group is unavailable.", "Please choose another prayer box.");
      return;
    }
    if (isOwnBox(viewer, recipient)) {
      acknowledge(
        "info",
        "Your box is for receiving prayer requests.",
        "To ask for prayer, choose someone else’s personal or community box.",
      );
      return;
    }
    if (restricted.includes(viewer)) {
      notify(
        "This fictional account is temporarily restricted after a validated review. An appeal requires a human decision.",
      );
      return;
    }
    setComposer({ recipient, initial });
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
      (recipient === "grace" && groupAdmin);
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
    acknowledge(
      "success",
      reportReason
        ? "Thank you for helping keep Prayer Box safe."
        : "Your box has been updated.",
      reportReason
        ? "Report recorded in the demo. This account’s content has been removed from your affected box or view."
        : "Account blocked in the demo. Its requests and linked material are removed from your affected box or view.",
    );
    navigate(
      recipient === "grace" && groupMember ? "inbox" : `box/${recipient}`,
    );
  }

  function raiseCareConcern(requestId: string, postId?: string) {
    const row = requests.find((request) => request.id === requestId);
    const isReviewEvidence =
      viewer === "operator" &&
      row &&
      (row.moderation !== "approved" || row.media?.status === "pending");
    if (!row || viewer === "guest" || (!canRead(row) && !isReviewEvidence)) {
      acknowledge(
        "error",
        "This request couldn’t be flagged.",
        "Only an accessible request or assigned review example can be flagged for care.",
      );
      return;
    }
    const evidence = storyReportEvidence(row, row.authorId, undefined, postId);
    if (evidence === null) {
      acknowledge("error", "This update is no longer available.", "Reopen the story before requesting care.");
      return;
    }
    if (careConcerns.some((concern) => concern.requestId === row.id && concern.postId === postId && concern.status !== "closed")) {
      acknowledge(
        "info",
        "Someone has already asked for care.",
        "A care concern is already recorded for this part of the story. No duplicate case was added.",
      );
      return;
    }
    setCareConcerns((previous) =>
      addCareConcern(previous, {
        id: crypto.randomUUID(),
        requestId: row.id,
        postId,
        authorId: row.authorId,
        title: row.topic,
        evidence,
        anonymous: row.anonymous,
        reportedBy: viewer,
        status: "new",
      }),
    );
    acknowledge(
      "pending",
      "Thank you for looking out for someone.",
      "A compassionate review was requested in this demo. The request stays in place; no account was blocked, restricted or contacted.",
    );
  }

  function sendSupportNote(concernId: string) {
    const concern = careConcerns.find((item) => item.id === concernId);
    if (viewer !== "operator" || !concern || concern.status !== "new") {
      acknowledge(
        "error",
        "This support note couldn’t be added.",
        "The review state has changed. Check the current case before trying again.",
      );
      return;
    }
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
    acknowledge(
      existed ? "info" : "success",
      existed
        ? "Support has already been offered."
        : "A little care, offered privately.",
      existed
        ? "Support has already been offered privately for this request. No duplicate reminder was added or reopened."
        : "A private support note was added to the requester's demo notifications. No external message or emergency alert was sent.",
    );
  }

  function commitRequests(rows: PrayerRequest[]): boolean {
    if (
      viewer === "guest" ||
      rows.some(
        (row) =>
          row.authorId !== viewer ||
          (row.recipient === "grace" && (graceGroup.archivedAt || graceGroup.members.some(member => member.id === viewer && member.status === "blocked"))) ||
          blockedActors.includes(recipientActor(row.recipient, graceGroup.ownerId)) ||
          isOwnBox(row.authorId, row.recipient),
      )
    )
      return false;
    setRequests((previous) => [
      ...previous,
      ...rows.map((row) =>
        withPlatformAcknowledgment({
          ...row,
          postedAt: row.postedAt ?? new Date().toISOString(),
        }),
      ),
    ]);
    offerConnection(rows.filter(row => row.moderation === 'approved').map(row => row.recipient === 'grace' ? {kind:'group' as const,id:'grace'} : {kind:'person' as const,id:recipientActor(row.recipient,graceGroup.ownerId)}));
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
    return true;
  }

  function deleteDeliveries(ids: string[]) {
    const removed = requests.filter(
      (row) => row.authorId === viewer && ids.includes(row.id),
    );
    if (viewer === "guest" || !removed.length) {
      acknowledge(
        "error",
        "Nothing was deleted.",
        "Only your own selected requests can be removed. Review the current selection and try again.",
      );
      return;
    }
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
    acknowledge(
      "success",
      "Selected prayer requests deleted.",
      "Selected deliveries and their linked stories were deleted from this fictional session. Unselected prayer boxes keep their separate copies.",
    );
  }

  function renderBox() {
    const receivingOwnBox = isOwnBox(viewer, box);
    const emptyBoxAction = () =>
      receivingOwnBox
        ? navigate(viewer === "maria" ? "box/grace" : "box/maria")
        : openComposer(box);
    const mine =
      box === ownBox &&
      ((viewer === "elena" && box === "mine") || viewer === "maria");
    const inaccessible = box === "mine" && viewer !== "elena";
    const rows = requests.filter(
      (r) =>
        r.recipient === box &&
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
                  graceGroup.image ? <img src={graceGroup.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <Icon name={graceGroup.icon} size={27} />
                ) : (
                  mine && profilePicturesByViewer[viewer]
                    ? <img className="account-avatar-image" src={profilePicturesByViewer[viewer]} alt="" />
                    : boxNames[box].slice(0, 1)
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
              {box === "prayerbox" ? "Prayer Box is here for you" : `${boxNames[box]}’s Prayer Box`}<span className="hero-dot">.</span>
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
            {box === "grace" && groupAdmin && (
              <button
                className="text-link organization-website-edit"
                onClick={() => navigate("group/grace-church")}
              >
                Manage prayer group
              </button>
            )}
            {box === "maria" && offerGrace && (
              <button
                className="association-chip"
                onClick={() => navigate("box/grace")}
              >
                <Icon name="people" size={14} />
                Member of {graceGroup.name}
                <Icon name="arrow" size={13} />
              </button>
            )}
            <div className="hero-actions">
              <button
                className="button"
                onClick={() =>
                  receivingOwnBox ? navigate("requests") : openComposer(box)
                }
              >
                <Icon name="note" size={18} />
                {receivingOwnBox ? "My requests" : "Leave a prayer request"}
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  document.getElementById("list-heading")?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  })
                }
              >
                Pray with others
              </button>
              {viewer !== 'guest' && !receivingOwnBox && <BoxConnectionButton key={`${viewer}/${box}`} viewer={viewer} target={box === 'grace' ? {kind:'group',id:'grace'} : {kind:'person',id:recipientActor(box,graceGroup.ownerId)}} name={boxNames[box]} context={eventContext} onChange={setConnections} onNavigate={navigate} />}
            </div>
            {receivingOwnBox && (
              <p className="own-box-guidance">
                This box receives requests from others. Ask for prayer in
                someone else’s box.
              </p>
            )}
          </div>
          <div className="hero-art">
            <BoxArt />
          </div>
        </section>
        {box === "grace" && (
          <section className="membership-strip">
            <div>
              <Icon name="shield" size={20} />
              <p>
                {groupMember
                  ? "You are an approved member. The shared inbox is separate from every personal delivery."
                  : membership === "pending"
                    ? "Your membership request is waiting for an admin. Private access begins after approval."
                    : membership === "invited" && viewer === "elena"
                      ? "Grace Church has invited you. Membership begins only when you accept."
                      : "Church approval is required to open organization-only requests. A public visit does not create membership."}
              </p>
            </div>
            <button className="button secondary compact" onClick={() => navigate(groupMember ? "inbox" : "group/grace-church")}>
              {groupMember ? "Open shared inbox" : "View membership options"}<Icon name="arrow" size={16} />
            </button>
          </section>
        )}
        {box === ownBox && viewer !== 'guest' && <nav className="box-section-links" aria-label="My prayer box sections"><a className="button secondary" href={`#box/${ownBox}`} aria-current="page">Prayers & testimonies</a><a className="button secondary" href="#invitations">Invitations</a></nav>}

        <div className="box-layout">
          <section
            id="box-requests"
            className="box-list"
            aria-labelledby="list-heading"
          >
            {!inaccessible && viewer !== "guest" && (
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
                  A new author update or testimony returns them to the community prayers below.
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
            <div id="request-list" className="request-list">
              {inaccessible ? (
                <EmptyState
                  kind="denied"
                  onAction={() => navigate("box/maria")}
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
                <EmptyState
                  kind="empty"
                  receivingOwnBox={receivingOwnBox}
                  onAction={emptyBoxAction}
                />
              )}
            </div>
            <p className="list-end">
              <Icon name="heart" size={14} />
              Small words, shared with care.
            </p>
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
    const own = requests.filter((r) => r.authorId === viewer && (!requestSearch.trim() || [r.topic, r.text, ...getStoryPosts(r).map(post => post.text)].join(" ").toLowerCase().includes(requestSearch.trim().toLowerCase())));
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
          <button
            className="button new-request-button"
            onClick={() => openComposer(viewer === "team" ? "maria" : "prayerbox")}
          >
            <Icon name="note" size={22} />Add a new prayer request
          </button>
          <label className="request-search-field"><Icon name="search" size={22} /><span className="sr-only">Search my prayer requests</span><input type="search" value={requestSearch} onChange={event => setRequestSearch(event.target.value)} placeholder="Search your prayer requests" /></label>
          <span className="quiet-copy">
            An update can be hopeful, difficult, or still unfinished.
          </span>
        </div>
        {sourceIds.length ? (
          <div className="own-request-list">
            {sourceIds.map((source) => {
              const copies = own.filter((r) => r.sourceId === source);
              const first = copies[0];
              const copyTarget =
                first.recipient === "maria" ? "grace" : "maria";
              return (
                <article className="own-request panel" key={source}>
                  <div className="section-heading">
                    <h2>{first.topic}</h2>
                    <span className="chip">Your authored request</span>
                  </div>
                  <time className="own-request-date" dateTime={first.postedAt}>Requested {formatStoryDate(first.postedAt ?? "")}</time>
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
                            {copy.groupRemoval ? 'Removed from this group' : copy.recipient === 'grace' && graceGroup.archivedAt ? 'Group closed' : copy.moderation === "approved"
                              ? copy.media?.status === "pending"
                                ? "Text delivered · media held"
                                : "Delivered"
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
                    {!isOwnBox(viewer, copyTarget) && (
                      <button
                        className="text-link"
                        onClick={() => openComposer(copyTarget, first)}
                      >
                        Add to another prayer box <Icon name="arrow" size={15} />
                      </button>
                    )}
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
        ) : requestSearch.trim() ? (
          <div className="panel empty-state">
            <h2>No requests match your search</h2>
            <p>Try another word from your request or its updates.</p>
            <button className="button secondary" onClick={() => setRequestSearch("")}>Clear search</button>
          </div>
        ) : (
          <EmptyState
            kind="empty"
            onAction={() =>
              openComposer(viewer === "team" ? "maria" : "prayerbox")
            }
          />
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
            <p className="eyebrow">{graceGroup.name}</p>
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
        acknowledge(
          "info",
          "This request already has a teammate.",
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
      acknowledge(
        "success",
        "Thank you for sharing the care.",
        "Request assigned to you in the demo. Every active approved member can still read it.",
      );
    };
    return (
      <>
        <header className="page-heading">
          <p className="eyebrow">
            <Icon name="people" size={16} />
            {graceGroup.name} · approved community
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
          {groupAdmin && (
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
            This is {graceGroup.name}’s shared inbox. Maria’s private personal
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
                      onChange={(event) => {
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
                        );
                        acknowledge(
                          "info",
                          "Work state updated.",
                          "This demo workflow change keeps the same church-wide audience. It is not a claim that someone has prayed.",
                        );
                      }}
                    >
                      <option value="new">New</option>
                      <option value="assigned">Assigned</option>
                      <option value="follow-up">Follow-up</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  {groupAdmin && (
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
                          acknowledge(
                            "success",
                            "Assignment updated.",
                            "Owner reassignment updated in this demo. Every approved member keeps the same access.",
                          );
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
            <EmptyState
              kind="empty"
              receivingOwnBox={viewer === graceGroup.ownerId}
              onAction={() =>
                viewer === graceGroup.ownerId
                  ? navigate("box/maria")
                  : openComposer("grace")
              }
            />
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
    if (row?.authorId === viewer && (row.groupRemoval || row.recipient === 'grace' && graceGroup.archivedAt)) return <section className="panel empty-state">
      <Icon name="shield" size={34} /><h1>{row.groupRemoval ? 'This group copy was removed.' : 'This prayer group has closed.'}</h1>
      <p>{row.groupRemoval ? `A group ${row.groupRemoval.actorRole} removed this delivery. Reason: ${groupRemovalReasons[row.groupRemoval.reason]}.` : 'Its prayer inbox is no longer available.'}</p>
      {row.groupRemoval && <p><time dateTime={row.groupRemoval.removedAt}>{formatStoryDate(row.groupRemoval.removedAt)}</time></p>}
      <p>Your other prayer boxes and deliveries are unchanged. Your authored words remain in My Requests.</p>
      <button className="button secondary" onClick={() => navigate('requests')}>Back to My Requests</button>
    </section>;
    if (!row || !canRead(row))
      return (
        <EmptyState kind="denied" onAction={() => navigate("box/maria")} />
      );
    return (
      <PrayerDetail
        key={`${row.id}-${viewer}-${focusedPostId ?? "latest"}`}
        focusedPostId={focusedPostId}
        request={row}
        viewer={viewer}
        groupMember={groupMember}
        officialAllowed={officialAllowed}
        organizationName={graceGroup.name}
        groupModerationRole={row.recipient === 'grace' && canModerateGroup(graceGroup, viewer) ? groupAdmin ? 'admin' : 'moderator' : undefined}
        onGroupRemove={input => {
          try {
            const current = requests.find(item => item.id === row.id);
            if (!current || !canRead(current)) throw new Error('This conversation is no longer available.');
            const result = removeGroupContent(current, graceGroup, viewer, input);
            setRequests(previous => previous.map(item => item.id === row.id ? result.request : item));
            if (result.notice) addGroupNotices([result.notice]);
            acknowledge('success', 'Content removed from this group.', 'A private notice explains the reason to its author. Other deliveries stay separate.');
            if (!input.replyId && (!input.postId || input.postId === 'original')) navigate('box/grace');
            return true;
          } catch (error) { acknowledge('error', error instanceof Error ? error.message : 'The content could not be removed.'); return false; }
        }}
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
        onUpdate={(update) => {
          const next = update(row);
          setRequests(previous => previous.map(r => r.id === row.id ? next : r));
          if (!row.anonymous && next.replies.some(reply => reply.actorId === viewer && !reply.automatic && !row.replies.some(old => old.id === reply.id))) offerConnection([{kind:'person',id:row.authorId}]);
        }}
        onNavigate={navigate}
        onReport={(reason, actor, replyId, postId) => {
          const evidence = storyReportEvidence(row, actor, replyId, postId);
          if (evidence === null) {
            notify("That post or reply is no longer available. Please reopen the story.");
            return;
          }
          removeActor(actor, reason, evidence);
        }}
        onBlock={(actor) => removeActor(actor)}
        onCareConcern={(postId) => raiseCareConcern(row.id, postId)}
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

  const friendRequest = viewer === 'elena' && friendInvitationStatus === 'pending' && !friends.includes('jordan') && !blockedActors.includes('jordan') ? <FriendInvitation viewer={viewer} friends={friends} blockedActors={blockedActors} friendInvitationStatus={friendInvitationStatus} onFriendInvitationChange={setFriendInvitationStatus} onFriendsChange={setFriends} onNotice={notify} /> : null;
  function renderPage() {
    if (page === 'notification-preferences') return <><NotificationPreferences key={`${viewer}/${resetVersion}`} viewer={viewer} value={notificationChoices[viewer] ?? defaultNotificationChoices} onChange={value => setNotificationChoices(previous => ({...previous,[viewer]:value}))} /><button className="button secondary" onClick={() => navigate(`box/${ownBox}`)}>Continue to My Box <Icon name="arrow" /></button></>;
    if (page === 'recovery') return <AccountRecovery onNavigate={navigate} />;
    if (page === 'signin') return <section className="panel empty-state"><h1>Sign-in is being prepared.</h1><p>Real accounts are not open in this preview. Password recovery needs a verified contact and a configured delivery service.</p><button className="button secondary" onClick={() => navigate('recovery')}>Forgot password?</button><button className="text-link" onClick={() => navigate('signup')}>View account setup</button></section>;
    if (page === 'events' || page === 'invitations') return <><nav className="box-section-links" aria-label="My prayer box sections"><a className="button secondary" href={`#box/${ownBox}`}>Prayers & testimonies</a><a className="button secondary" href="#invitations" aria-current={page === 'invitations' ? 'page' : undefined}>Invitations</a></nav><PrayerEvents key={`${viewer}/${resetVersion}/${page}`} viewer={viewer} state={prayerEvents} context={eventContext} onChange={setPrayerEvents} onNavigate={navigate} mode={page === 'events' ? 'events' : 'invitations'} /></>;
    if (page === 'connections') return <ConnectionsPanel key={`${viewer}/${resetVersion}`} viewer={viewer} connections={connections} context={eventContext} additionalRequests={friendRequest} onChange={setConnections} onNavigate={navigate} />;
    if (page === "group" || page === "groups" || page === "members") return <PrayerGroups standalone key={`${resetVersion}/${viewer}/${page}/${resource ?? ""}`} viewer={viewer} people={groupDirectoryPeople} state={prayerGroups} onChange={updatePrayerGroups} selectedHandle={page === "members" ? "grace-church" : resource} onNavigate={navigate} />;
    if (page === "box" || page === "") return renderBox();
    if (page === "requests") return renderMyRequests();
    if (page === "prayers") return renderMyPrayers();
    if (page === "app")
      return (
        <Suspense fallback={null}>
          <MobileAppPage
            app={appInstall}
            widgetPreferences={widgetPreferences}
            onWidgetSave={setWidgetPreferences}
            language={language}
            onNavigate={navigate}
          />
        </Suspense>
      );
    if (page === "feedback")
      return (
        <Suspense fallback={null}>
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
          {page === "church" && <><PrayerGroups key={`${resetVersion}/${viewer}`} viewer={viewer} people={groupDirectoryPeople} state={prayerGroups} onChange={updatePrayerGroups} onNavigate={navigate} /><ConnectionsPanel key={`connections/${resetVersion}/${viewer}`} viewer={viewer} connections={connections} context={eventContext} additionalRequests={friendRequest} onChange={setConnections} onNavigate={navigate} /><div className="box-section-links"><button className="button secondary" onClick={() => navigate('events')}>Create or manage prayer events <Icon name="arrow" size={18} /></button><button className="button secondary" onClick={() => navigate('invitations')}>Your invitations</button></div></>}
          <CommunityPages
            language={language}
            onLanguageChange={setLanguage}
            key={resetVersion}
            page={page}
            viewer={viewer}
            requests={requests}
            onNavigate={destination => navigate(page === 'signup' && ['box/mine','inbox'].includes(destination) ? 'notification-preferences' : destination)}
            onNotice={notify}
            onViewerChange={changeViewer}
            onUpdateRequests={(update) =>
              setRequests((previous) =>
                update(previous).map(withPlatformAcknowledgment),
              )
            }
            onCareConcern={raiseCareConcern}
            membershipStatus={membership}
            onMembershipChange={() => navigate("group/grace-church")}
            usernames={profileUsernames}
            friends={friends}
            outgoingFriendRequests={outgoingFriendRequests}
            onOutgoingFriendRequestsChange={setOutgoingFriendRequests}
            friendInvitationStatus={friendInvitationStatus}
            onFriendInvitationChange={setFriendInvitationStatus}
            discoverableMaria={canSeeMariaProfile}
            blockedActors={blockedActors}
            onFriendsChange={setFriends}
            memberActive={memberActive}
            onMemberActiveChange={() => navigate("group/grace-church")}
            officialReplyAllowed={officialAllowed}
            onOfficialReplyChange={() => navigate('group/grace-church')}
          />
          {page === "review" && viewer === "operator" && (
            <CareReviewQueue
              concerns={careConcerns}
              onSend={sendSupportNote}
              onClose={(id) => {
                setCareConcerns((previous) =>
                  previous.map((item) =>
                    item.id === id ? { ...item, status: "closed" } : item,
                  ),
                );
                acknowledge(
                  "info",
                  "Care review closed.",
                  "This fictional review was closed without contacting anyone.",
                );
              }}
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
                            acknowledge(
                              "success",
                              "Review decision recorded.",
                              "Human-review decision simulated. Account posting is restricted in this local demo.",
                            );
                          }}
                        >
                          Confirm violation & restrict demo account
                        </button>
                        <button
                          className="text-link"
                          onClick={() => {
                            setReports((previous) =>
                              previous.map((r) =>
                                r.id === report.id
                                  ? { ...r, state: "dismissed" }
                                  : r,
                              ),
                            );
                            acknowledge(
                              "success",
                              "Report dismissed in this demo.",
                              "The review decision was recorded for this example.",
                            );
                          }}
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
                            acknowledge(
                              "success",
                              "Evaluation example marked.",
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
      <div className="demo-banner demo-preview-bar">
        <a href="#signup">Create your prayer box <Icon name="arrow" size={17} /></a>
        <button onClick={() => setDialog("demo")}>Preview options <Icon name="settings" size={18} /></button>
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
                <Icon name={item.icon} size={24} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="header-utilities">
            <button
              className="icon-button notification-button"
              aria-label="Open notifications"
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
              <span className="notification-bell"><Icon name="bell" size={27} />
              {(!notificationRead || unreadSupport || unreadGroupNotice || incomingConnections.length > 0) && <span className="notification-dot" />}</span>
            </button>
            <div className="account-menu-wrap">
              <button
                className="account-trigger"
                aria-label={`${viewerNames[viewer]} account menu`}
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="avatar header-avatar">
                  {profilePicturesByViewer[viewer] ? <img className="account-avatar-image" src={profilePicturesByViewer[viewer]} alt="" /> : viewerNames[viewer].slice(0, 1)}
                </span>
                <span className="header-name">{viewerNames[viewer]}</span>
                <Icon name="chevron" size={18} />
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
                    <a href="#invitations" onClick={() => setMenuOpen(false)}>Invitations</a>
                    <a href="#events" onClick={() => setMenuOpen(false)}>Create a prayer event</a>
                    <a href="#connections" onClick={() => setMenuOpen(false)}>Connections</a>
                    <a href="#prayers" onClick={() => setMenuOpen(false)}>
                      My Prayers
                    </a>
                    {groupMember && (
                      <a href="#inbox" onClick={() => setMenuOpen(false)}>
                        Shared church inbox
                      </a>
                    )}
                    {groupAdmin && (
                      <a href="#members" onClick={() => setMenuOpen(false)}>
                        Manage members
                      </a>
                    )}
                    <a href="#notification-preferences" onClick={() => setMenuOpen(false)}>Notification choices</a>
                    <a href="#recovery" onClick={() => setMenuOpen(false)}>Account recovery</a>
                    <a href="#settings" onClick={() => setMenuOpen(false)}>
                      Profile & settings
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
                    <a href="#app" onClick={() => setMenuOpen(false)}>
                      Get the mobile app
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
                      Create a prayer box · signup
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
                acknowledge(
                  "pending",
                  "Your account appeal is ready for review.",
                  "Simulation only. Nothing was sent; the restriction remains until a person reviews it.",
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
            usernameControl={page === "settings" && viewer !== "guest" ? <UsernameSettings key={viewer} username={eventPeople.find(person => person.id === viewer)?.username ?? viewer} occupied={[...eventPeople.map(person => person.username), ...prayerGroups.map(group => group.username), "gracechurch"]} editable={eventPeople.some(person => person.id === viewer) && viewer !== "team"} onSave={username => { setProfileUsernames(previous => ({...previous,[viewer]:username})); setPrayerGroups(previous => previous.map(group => ({...group,members:group.members.map(member => member.id === viewer ? {...member,username} : member)}))); }} /> : null}
            profilePictureControl={page === "settings" && viewer !== "guest" ? <ProfilePictureSettings
              key={viewer}
              name={viewerNames[viewer]}
              picture={profilePicturesByViewer[viewer]}
              onChange={picture => setProfilePicturesByViewer(previous => ({ ...previous, [viewer]: picture }))}
            /> : null}
            approvedMember={groupMember}
            organizationMemberships={prayerGroups.filter(group => !group.archivedAt && group.members.some(member => member.id === viewer && member.status === 'approved' && member.active)).map(group => ({ name: group.name, username: group.username, admin: isGroupAdmin(group, viewer) }))}
            organizationName={graceGroup.name}
            groupAdmin={groupAdmin}
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
            onManageBlocked={() => setDialog("blocked")}
            onNotice={notify}
            onPrivacyChange={setPrivacy}
            onRemindersChange={setReminders}
            onAutomaticChange={(enabled, scope, message) => {
              if (scope === "grace" && !groupAdmin) {
                acknowledge("error", "Admin access is required.", "Your group access changed. Open the group to review your membership.");
                return;
              }
              if (scope !== "grace" && viewer !== "elena" && viewer !== "maria") {
                if (enabled)
                  notify(
                    "This viewer’s personal box is not part of the sample deliveries. No other person’s box has been changed.",
                  );
                return;
              }
              const target: BoxId =
                scope === "grace" && groupAdmin
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
                    <span
                      className="chip"
                      id={`held-story-status-${story.id}`}
                      tabIndex={-1}
                    >
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
                        onClick={() => {
                          storyAppealFocusFor.current = story.id;
                          setHeldStories((previous) =>
                            previous.map((item) =>
                              item.id === story.id
                                ? { ...item, state: "appeal" }
                                : item,
                            ),
                          );
                          acknowledge(
                            "pending",
                            "Your story appeal is awaiting review.",
                            "Demo queue only. Your story remains unpublished while a person reviews it.",
                          );
                        }}
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
                          requests.filter(row => row.recipient !== 'grace' || !graceGroup.archivedAt),
                          story.authorId,
                          story.destinations,
                          restricted.includes(story.authorId),
                        );
                        if (!plan.ready.length) {
                          acknowledge(
                            "pending",
                            "This story is still waiting.",
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
                        acknowledge(
                          plan.held.length ? "pending" : "success",
                          plan.held.length
                            ? "Some story deliveries still need review."
                            : "Story review completed.",
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
                        acknowledge(
                          "pending",
                          "Changes requested.",
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
          <a href="#app">Mobile app</a>
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
      {composer && (
        <PrayerComposer
          organizationOwnerId={graceGroup.ownerId}
          key={`${composer.recipient}-${composer.initial?.id ?? "new"}`}
          {...composer}
          viewer={viewer}
          privacy={privacy}
          automatic={automatic}
          automaticMessages={automaticMessages}
          offerGrace={offerGrace}
          usernames={profileUsernames}
          friends={viewer === "elena" ? friends : viewer === "maria" && friends.includes("maria") ? ["elena"] : []}
          mariaVisible={canSeeMariaProfile}
          blockedActors={blockedActors}
          boxCeilings={accessContext.boxCeilings}
          onClose={() => setComposer(null)}
          onCommit={commitRequests}
          onNavigate={navigate}
          onSignIn={() => changeViewer("elena")}
        />
      )}
      {!composer && connectionSuggestions.length > 0 && <Modal title="Would you like to connect?" onClose={() => setConnectionSuggestions([])}><p className="form-intro">Keep in touch through prayer invitations. Connecting shares your profile; your prayer keeps its chosen privacy and is not attached to the connection request.</p>{connectionSuggestions.map(host => { const name = host.kind === 'group' ? prayerGroups.find(group => group.id === host.id)?.name : eventPeople.find(person => person.id === host.id)?.name; return <div className="connection-suggestion panel" key={`${host.kind}/${host.id}`}><span className="avatar">{host.kind === 'group' ? <Icon name="people" /> : name?.slice(0,1)}</span><strong>{name ?? 'Prayer community'}</strong><button className="button" onClick={() => {try { setConnections(requestPrayerConnection(connections,viewer,host,eventContext)); setConnectionSuggestions(previous => previous.filter(item => item.id !== host.id || item.kind !== host.kind)); acknowledge('success','Connection request sent.','They can accept or decline it in My Church.');}catch(error){acknowledge('info',error instanceof Error ? error.message : 'This connection is unavailable.');} }}>Connect <Icon name="people" size={20} /></button></div>;})}<button className="button secondary" onClick={() => setConnectionSuggestions([])}>Not now</button></Modal>}
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
            explore the pages and sample accounts.
          </p>
          <label className="field">
            View as
            <select
              value={viewer}
              onChange={(event) => changeViewer(event.target.value as Viewer)}
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
              <option value="team">Prayer Box prayer team · its own inbox only</option>
              <option value="operator">
                Platform reviewer · no general private inbox access
              </option>
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
            <button className="button secondary compact" onClick={() => { navigate("signup"); setDialog(null); }}>Open signup</button>
            <button className="button secondary compact" onClick={() => { changeViewer("team"); navigate("box/prayerbox"); setDialog(null); }}>Prayer Box team inbox</button>
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
                changeViewer("member");
                navigate("inbox");
                setDialog(null);
              }}
            >
              Member inbox
            </button>
            <button
              className="button secondary compact"
              onClick={() => {
                changeViewer("operator");
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
            foundation. English and NIV reading links are confirmed. Still
            unresolved: exact editorial wording, NIV quotation rights, native
            widget packaging, future-member history, retention, block/group
            semantics, moderation operations, providers and donation surplus
            policy.
          </p>
          <div className="modal-actions">
            <button
              className="text-link"
              onClick={() => {
                setRequests(cloneFixtures());
                setBlocked({});
                setBoxRemoved({});
                setReports([]);
                setCareConcerns([]);
                setSupportNotes([]);
                setDismissedSupportNotes([]);
                setReadSupportNotes([]);
                setStoryReadByViewer({});
                setRestricted([]);
                setPrayerGroups(initialPrayerGroups());
                setNotificationChoices({});
                setProfileUsernames({});
                setConnections(initialConnections());
                setPrayerEvents(initialEvents());
                setConnectionSuggestions([]);
                setGroupNotices([]);
                setFriends(["maria", "daniel"]);
                setOutgoingFriendRequests([]);
                setFriendInvitationStatus("pending");
                setPrivacyByViewer({ elena: "private", maria: "public" });
                setProfilePicturesByViewer({});
                setCountryByViewer({ maria: { country: "us", show: true } });
                setAssociationByViewer({ maria: true });
                setHeldStories([]);
                setInPersonReminders({});
                setAutomatic({ mine: false, maria: false, grace: false });
                setAutomaticMessages({});
                setLanguage("en");
                setWidgetPreferences(defaultWidgetPreferences);
                setResetVersion((version) => version + 1);
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
        <Modal title="Your updates" onClose={() => setDialog(null)} wide>
          <p className="quiet-copy">Prayer updates follow the original delivery’s access. Group decisions are private to your account and stay available after membership ends. No external notification has been sent.</p>
          <PrivateSupportNotifications notes={privateSupportNotes} onOpen={() => setDialog("support")} onDismiss={id => setDismissedSupportNotes(previous => [...previous,id])} />
          <div className="story-notifications">
            {incomingConnections.length > 0 && <article className="story-notification"><h3>New requests to connect</h3><p>Review who would like to share prayer invitations with you.</p><button className="button secondary" onClick={() => {setDialog(null);navigate('church');}}>Review in My Church</button></article>}
            {currentInvitations.length > 0 && <article className="story-notification"><h3>You’re invited</h3><p>Prayer gatherings have their own place in your box.</p><button className="button secondary" onClick={() => {setDialog(null);navigate('invitations');}}>Open invitations</button></article>}
            {myGroupNotices.map(notice => <article className="story-notification group-decision-notice" key={notice.id}>
              <p className="eyebrow">{notice.groupName} · <time dateTime={new Date(notice.createdAt).toISOString()}>{formatStoryDate(new Date(notice.createdAt).toISOString())}</time></p>
              <h3>{notice.title}</h3><p>{notice.message}</p>
              <div className="inline-actions">
                {prayerGroups.some(group => group.id === notice.groupId && !group.archivedAt && group.members.some(member => member.id === viewer && ['approved', 'pending', 'invited'].includes(member.status))) && <button className="text-link" onClick={() => { setDialog(null); navigate(`group/${prayerGroups.find(group => group.id === notice.groupId)!.username}`); }}>View prayer group<Icon name="arrow" size={17} /></button>}
                {!notice.readAt && <button className="text-link" onClick={() => setGroupNotices(previous => previous.map(item => item.id === notice.id && item.recipientId === viewer ? { ...item, readAt: Date.now() } : item))}>Mark as read</button>}
              </div>
            </article>)}
            {storyNotices.map(({row,post,key}) => <article className="story-notification" key={key}>
              <p className="eyebrow">{post.kind === "testimony" ? "Testimony shared" : "Update shared"} · <time dateTime={post.createdAt}>{formatStoryDate(post.createdAt)}</time></p>
              <h3>{row.topic}</h3>
              <p className="story-notification-author">{authorLabel(row)} · {boxNames[row.recipient]}</p>
              <p>{post.text}</p>
              <button className="text-link" onClick={() => { setReadStoryNoticeIds(previous => [...new Set([...previous,key])]); setDialog(null); navigate(`request/${row.id}/post/${encodeURIComponent(post.id)}`); }}>Read & respond to this {post.kind} <Icon name="arrow" size={19} /></button>
            </article>)}
            {!storyNotices.length && !myGroupNotices.length && <p className="notice sage">You’re all caught up. Updates to prayer stories you can read will appear here.</p>}
          </div>
          <button className="button secondary" onClick={() => { setReadStoryNoticeIds(storyNotices.map(notice => notice.key)); setGroupNotices(previous => previous.map(item => item.recipientId === viewer ? { ...item, readAt: item.readAt ?? Date.now() } : item)); setDialog(null); }}>Mark updates as read</button>
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
                    acknowledge(
                      "success",
                      "Personal block removed.",
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
                  !r.groupRemoval && !(r.recipient === "grace" && graceGroup.archivedAt) &&
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
                feedback.prepare();
                const plan = storyPublicationPlan(
                  requests.filter(row => row.recipient !== 'grace' || !graceGroup.archivedAt),
                  viewer,
                  updateDestinations,
                  restricted.includes(viewer),
                );
                if (!plan.ready.length || plan.held.length) {
                  setUpdateDestinations(plan.ready);
                  acknowledge(
                    "error",
                    "Check the selected prayer boxes.",
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
                  acknowledge(
                    "success",
                    updateKind === "testimony"
                      ? "Thank you for sharing your testimony!"
                      : "Your prayer update has been added!",
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
                  acknowledge(
                    "pending",
                    "Your story is waiting for review.",
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
