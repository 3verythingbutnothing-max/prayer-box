import { useEffect, useRef, useState } from "react";
import type { Audience, PrayerRequest, Viewer } from "../domain";
import { authorLabel, getAudienceLabel, screenText } from "../domain";
import { Icon, Modal } from "../ui";
import { normalizeOrganizationWebsite } from "../organization";
import { useActionFeedback } from "../action-feedback";
import {
  resolveUiLanguage,
  supportedLanguages,
  uiText,
} from "../localization";
import type { UiLanguage } from "../localization";
import "../community.css";
import { findPrayerRecipients } from "../recipients";

type MembershipStatus = "none" | "pending" | "invited" | "approved";
type CommunityPage = "church" | "members" | "signup" | "review";

interface CommunityPagesProps {
  directorySearch?: string;
  compactChurch?: boolean;
  page: CommunityPage;
  viewer: Viewer;
  requests: PrayerRequest[];
  onNavigate: (route: string) => void;
  onNotice: (message: string) => void;
  onViewerChange: (viewer: Viewer) => void;
  onUpdateRequests: (
    update: (rows: PrayerRequest[]) => PrayerRequest[],
  ) => void;
  onCareConcern: (requestId: string) => void;
  membershipStatus: MembershipStatus;
  onMembershipChange: (status: MembershipStatus) => void;
  friends: string[];
  outgoingFriendRequests: string[];
  onOutgoingFriendRequestsChange: (ids: string[]) => void;
  friendInvitationStatus: "pending" | "accepted" | "declined";
  onFriendInvitationChange: (status: "pending" | "accepted" | "declined") => void;
  discoverableMaria?: boolean;
  blockedActors?: readonly string[];
  onFriendsChange: (ids: string[]) => void;
  memberActive: boolean;
  onMemberActiveChange: (active: boolean) => void;
  officialReplyAllowed: boolean;
  onOfficialReplyChange: (allowed: boolean) => void;
  onCreateOrganization?: (website: string) => void;
  usernames?: Readonly<Record<string, string>>;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => void;
}

const people = [
  {
    id: "maria",
    name: "Maria",
    initial: "M",
    color: "lavender",
    note: "A friend to pray with, in the ordinary and difficult days.",
  },
  {
    id: "daniel",
    name: "Daniel",
    initial: "D",
    color: "sage",
    note: "A little encouragement, a listening ear, and room to be honest.",
  },
  {
    id: "jordan",
    name: "Jordan",
    initial: "J",
    color: "peach",
    note: "Your accepted fictional invitation. Friendship stays private.",
  },
];

function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="community-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      {children && <p className="page-intro">{children}</p>}
    </header>
  );
}

function AccessNotice({
  title,
  text,
  onSwitch,
  switchLabel,
}: {
  title: string;
  text: string;
  onSwitch: () => void;
  switchLabel: string;
}) {
  return (
    <section className="panel community-access">
      <span className="community-soft-icon">
        <Icon name="lock" size={24} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="button secondary" onClick={onSwitch}>
        {switchLabel}
        <Icon name="arrow-right" size={17} />
      </button>
    </section>
  );
}

export function FriendInvitation(props: Pick<CommunityPagesProps, 'viewer' | 'friends' | 'blockedActors' | 'friendInvitationStatus' | 'onFriendInvitationChange' | 'onFriendsChange' | 'onNotice'>) {
  const feedback = useActionFeedback();
  if (props.viewer !== 'elena' || props.friendInvitationStatus !== 'pending' || props.friends.includes('jordan') || props.blockedActors?.includes('jordan')) return null;
  return (
            <section
              className="panel community-invitation"
              aria-labelledby="friend-invitation-heading"
            >
              <div className="community-section-heading">
                <span className="community-small">Friend request</span>
                <span className="chip">Awaiting your choice</span>
              </div>
              <div className="community-person-row">
                <span
                  className="community-avatar community-peach"
                  aria-hidden="true"
                >
                  J
                </span>
                <div>
                  <h2 id="friend-invitation-heading">
                    Jordan would like to join your circle.
                  </h2>
                  <p>
                    Accepting makes this a mutual friendship. It does not grant
                    membership in Grace Church.
                  </p>
                </div>
              </div>
              <div className="community-actions">
                <button
                  className="button"
                  onClick={() => {
                    feedback.prepare();
                    props.onFriendsChange([
                      ...new Set([...props.friends, "jordan"]),
                    ]);
                    props.onFriendInvitationChange("accepted");
                    props.onNotice(
                      "Jordan’s fictional friendship invitation was accepted. No invitation was sent.",
                    );
                    feedback.respond({
                      tone: "success",
                      title: "There’s room for prayer together.",
                      message:
                        "Jordan’s fictional invitation is accepted. No real invitation was sent.",
                    });
                  }}
                >
                  Accept friend request
                  <Icon name="check" size={16} />
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    feedback.prepare();
                    props.onFriendInvitationChange("declined");
                    props.onNotice(
                      "The fictional friendship invitation was declined.",
                    );
                    feedback.respond({
                      tone: "info",
                      title: "Your invitation choice is updated.",
                      message:
                        "The fictional friendship invitation was declined.",
                    });
                  }}
                >
                  Decline
                </button>
              </div>
            </section>
  );
}

function ChurchPage(props: CommunityPagesProps) {
  const feedback = useActionFeedback();
  const [localSearch, setSearch] = useState("");
  const search = props.directorySearch ?? localSearch;
  const invitation = props.friendInvitationStatus;
  const [removeId, setRemoveId] = useState<string | null>(null);
  // Local walkthrough state only. Sending a request never grants friendship access.
  // Durable delivery, recipient acceptance and cross-account sync need the future API.
  const outgoingRequests = props.outgoingFriendRequests;
  useEffect(() => {
    if (props.viewer !== 'elena') return;
    const next = outgoingRequests.filter(id => !props.friends.includes(id) && !props.blockedActors?.includes(id));
    if (next.length !== outgoingRequests.length) props.onOutgoingFriendRequestsChange(next);
  }, [outgoingRequests, props.viewer, props.friends, props.blockedActors, props.onOutgoingFriendRequestsChange]);
  function toggleFriendRequest(id: string, name: string) {
    if (props.viewer !== "elena" || id === props.viewer || props.friends.includes(id)
      || props.blockedActors?.includes(id) || id === "jordan" && invitation === "pending"
      || id === "maria" && props.discoverableMaria === false || !people.some(person => person.id === id)) return;
    feedback.prepare();
    const cancelling = outgoingRequests.includes(id);
    props.onOutgoingFriendRequestsChange(cancelling ? outgoingRequests.filter(value => value !== id) : [...new Set([...outgoingRequests, id])]);
    feedback.respond({
      tone: cancelling ? "info" : "success",
      title: cancelling ? "Your friend request was cancelled." : "Your friend request is pending.",
      message: cancelling ? "No friendship access was added."
        : `${name} will need to accept before you become friends. This preview saves the request until the browser is refreshed; nothing is delivered to a real account.`,
    });
  }
  function friendRequestButton(id: string, name: string) {
    const pending = outgoingRequests.includes(id);
    return <button className="button secondary compact" aria-label={`${pending ? "Cancel" : "Send"} friend request to ${name}`}
      onClick={() => toggleFriendRequest(id, name)}>{pending ? "Cancel request" : "Send friend request"}<Icon name={pending ? "close" : "people"} size={17} /></button>;
  }
  if (props.compactChurch && props.viewer !== "elena") return null;
  if (props.viewer !== "elena")
    return (
      <div className="community-page">
        <Heading eyebrow="My Church" title="Friendship, kept personal.">
          An accepted friendship is separate from membership in a prayer
          community.
        </Heading>
        <AccessNotice
          title="Elena’s private friends view"
          text="This sample belongs to Elena. Other demo roles do not see her friends or invitations."
          onSwitch={() => props.onViewerChange("elena")}
          switchLabel="Explore as Elena"
        />
      </div>
    );
  const accepted = people.filter((person) => props.friends.includes(person.id) && !props.blockedActors?.includes(person.id) && (!search.trim() || `${person.name} @${props.usernames?.[person.id] ?? person.id}`.toLowerCase().includes(search.trim().toLowerCase())));
  const discoveries = findPrayerRecipients(search, props.viewer, props.friends, { mariaVisible: props.discoverableMaria, blocked: props.blockedActors, usernames: props.usernames }).filter(person => search.trim() || person.kind === "platform");
  const removed = people.filter(
    (person) => !props.friends.includes(person.id) && !props.blockedActors?.includes(person.id)
      && !(person.id === "jordan" && invitation === "pending")
      && !(person.id === "maria" && props.discoverableMaria === false),
  );
  const removePerson = people.find((person) => person.id === removeId);
  return (
    <div className="community-page">
      {!props.compactChurch && <>
      <Heading
        eyebrow="My Church · only you"
        title="Life is better with prayer."
      >
      </Heading>
      <label className="request-search-field church-search"><Icon name="search" size={23} /><span className="sr-only">Find people by @username</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find someone by @username" autoComplete="off" /></label>
      <div className="church-search-results" aria-label="Available prayer boxes">
        {discoveries.map(person => <article className="church-directory-card" key={person.id} style={{ flexWrap: "wrap" }}>
          <Icon name={person.kind === "platform" ? "box" : "people"} size={29} />
          <div><h3>{person.name}</h3><p>@{person.username}{person.kind === "platform" ? " · Always here for prayer" : " · Sample prayer box"}</p></div>
          <div className="community-actions" style={{ flexBasis: "100%", marginTop: 0 }}>
            <button className="text-link" onClick={() => props.onNavigate(`box/${person.id}`)}>Open box <Icon name="arrow" size={18} /></button>
            {person.kind === "personal" && person.actorId !== props.viewer && !props.friends.includes(person.actorId) && !props.blockedActors?.includes(person.actorId)
              && (person.actorId === "jordan" && invitation === "pending"
                ? <span className="community-small">Friend request awaiting your choice above</span>
                : friendRequestButton(person.actorId, person.name))}
          </div>
        </article>)}
        {search.trim() && !discoveries.length && <p className="quiet-copy" role="status">No available matching box in this demo. Try @maria, @daniel, @jordan or @prayerbox.</p>}
      </div>
      </>}
      <div className="community-layout">
        <div className="community-main">
          <section aria-labelledby="accepted-friends-heading">
            <div className="community-section-heading">
              <h2 id="accepted-friends-heading">People you know</h2>
              <span className="community-small">Mutually accepted friends</span>
            </div>
            <div className="community-friends">
              {accepted.length ? (
                accepted.map((person) => (
                  <article className="panel community-friend" key={person.id}>
                    <span
                      className={`community-avatar community-${person.color}`}
                      aria-hidden="true"
                    >
                      {person.initial}
                    </span>
                    <div className="community-friend-copy">
                      <h3>{person.name}</h3>
                      <span className="community-small">Accepted friend</span>
                      <p>{person.note}</p>
                      <button className="button secondary compact friend-box-link" onClick={() => props.onNavigate(`box/${person.id}`)} aria-label={`View ${person.name}’s prayer box`}>View prayer box <Icon name="arrow" size={17}/></button>
                    </div>
                    <button
                      className="text-link community-quiet-action"
                      onClick={() => setRemoveId(person.id)}
                      aria-label={`Remove ${person.name} from My Church`}
                    >
                      Remove
                    </button>
                  </article>
                ))
              ) : (
                <div className="panel community-empty">
                  <Icon name="heart" size={28} />
                  <h3>{search.trim() ? "No matching friends" : "A little room to begin"}</h3>
                  <p>
                    {search.trim() ? 'Try another name or username.' : 'Your accepted friends will appear here. No one is added by church membership alone.'}
                  </p>
                </div>
              )}
            </div>
          </section>
          {invitation === "declined" && !props.blockedActors?.includes("jordan") && (
            <p className="quiet-copy">Jordan’s invitation was declined. A future friendship still needs mutual acceptance.</p>
          )}
          {!props.compactChurch && removed.length > 0 && (
            <section className="panel community-invitation" aria-label="People outside your accepted circle">
              <h2>A little room to reconnect</h2>
              <p>Sending a friend request invites someone to reconnect. Access changes only after they accept.</p>
              {removed.map(person => <div className="community-person-row" key={person.id} style={{ flexWrap: "wrap" }}>
                <span className={`community-avatar community-${person.color}`} aria-hidden="true">{person.initial}</span>
                <div><h3>{person.name}</h3><p className="community-small">{outgoingRequests.includes(person.id) ? "Your request is pending" : "Not in your accepted circle"}</p></div>
                {friendRequestButton(person.id, person.name)}
              </div>)}
              <p className="community-small">Requests in this preview last until the browser is refreshed. Real delivery and acceptance will be connected before launch.</p>
            </section>
          )}
        </div>
        <aside className="community-aside">
          <section className="community-care-note">
            <span className="community-soft-icon">
              <Icon name="heart" size={22} />
            </span>
            <h2>A little encouragement to pray together</h2>
            <p>
              When it is possible and welcomed, make room to listen and pray in
              person.
            </p>
            <p>
              Ask before laying a hand on someone’s shoulder. Meeting and touch
              are always optional, and a friend’s boundaries matter.
            </p>
            <button
              className="text-link"
              onClick={() => props.onNavigate("about")}
            >
              Prayer beyond the screen
              <Icon name="arrow-right" size={16} />
            </button>
          </section>
          <div className="community-distinction">
            <Icon name="lock" size={17} />
            <p>
              Your friends stay private. My Church is your personal circle; My
              associations contains church-approved memberships.
            </p>
          </div>
        </aside>
      </div>
      {removePerson && (
        <Modal
          title={`Remove ${removePerson.name}?`}
          onClose={() => setRemoveId(null)}
        >
          <p>
            Remove this fictional friendship from Elena’s private My Church
            circle. Friendship-derived access and eligible in-person reminders
            should end with it.
          </p>
          <p className="community-small">
            This does not report the person, remove their church membership, or
            erase a separate request addressed to you.
          </p>
          <div className="community-actions">
            <button
              className="button"
              onClick={() => {
                feedback.prepare();
                props.onFriendsChange(
                  props.friends.filter((id) => id !== removePerson.id),
                );
                setRemoveId(null);
                props.onNotice(
                  `${removePerson.name} was removed from the fictional friend circle.`,
                );
                feedback.respond({
                  tone: "info",
                  title: "Your fictional circle is updated.",
                  message:
                    "The demo friendship was removed. Separate prayer deliveries remain.",
                });
              }}
            >
              Remove friendship
            </button>
            <button
              className="button secondary"
              onClick={() => setRemoveId(null)}
            >
              Keep friendship
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MembersPage(props: CommunityPagesProps) {
  const feedback = useActionFeedback();
  const [confirm, setConfirm] = useState<"elena" | "member" | null>(null);
  if (props.viewer !== "owner")
    return (
      <div className="community-page">
        <Heading
          eyebrow="Grace Church"
          title="Membership is handled with care."
        >
          Church-approved membership and personal friendships are different.
        </Heading>
        <AccessNotice
          title="Owner access is required"
          text="Only the organization’s authorized owner can see applications, invitations, membership controls, or official-reply permissions. No private roster is shown here."
          onSwitch={() => props.onViewerChange("owner")}
          switchLabel="Explore the fictional owner view"
        />
      </div>
    );
  return (
    <div className="community-page">
      <Heading
        eyebrow="Grace Church · owner view"
        title="A community that prays together."
      >
        Review applications with care. Each person uses their own account, and
        access begins only after church approval or an accepted owner
        invitation.
      </Heading>
      <div className="community-layout">
        <div className="community-main">
          <section className="panel community-members-panel">
            <div className="community-section-heading">
              <h2>Applications & invitations</h2>
              <Icon name="mail" size={21} />
            </div>
            {props.membershipStatus === "pending" ? (
              <div className="community-application">
                <div className="community-person-row">
                  <span
                    className="community-avatar community-peach"
                    aria-hidden="true"
                  >
                    E
                  </span>
                  <div>
                    <h3>Elena</h3>
                    <span className="chip">Awaiting church approval</span>
                  </div>
                </div>
                <p>
                  Fictional application to join Grace Church’s prayer community.
                  No identification documents or contact details have been
                  collected.
                </p>
                <div className="community-actions">
                  <button
                    className="button"
                    onClick={() => {
                      feedback.prepare();
                      props.onMembershipChange("approved");
                      props.onNotice(
                        "Elena is now Approved by Grace Church in this fictional demo. This is not verified identity.",
                      );
                      feedback.respond({
                        tone: "success",
                        title: "The demo application is approved.",
                        message:
                          "Elena has fictional Grace Church membership in this session. This is not verified identity.",
                      });
                    }}
                  >
                    Approve application
                    <Icon name="check" size={16} />
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      feedback.prepare();
                      props.onMembershipChange("none");
                      props.onNotice(
                        "Elena’s fictional membership application was declined.",
                      );
                      feedback.respond({
                        tone: "info",
                        title: "Your demo membership decision is recorded.",
                        message:
                          "The fictional application was declined; no membership access was granted.",
                      });
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ) : props.membershipStatus === "invited" ? (
              <div className="community-application">
                <div className="community-person-row">
                  <span
                    className="community-avatar community-peach"
                    aria-hidden="true"
                  >
                    E
                  </span>
                  <div>
                    <h3>Elena</h3>
                    <span className="chip">Invitation awaiting acceptance</span>
                  </div>
                </div>
                <p>
                  An owner invitation alone grants no private inbox access.
                  Elena must explicitly accept it from her own account.
                </p>
                <div className="community-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      props.onViewerChange("elena");
                      props.onNavigate("box/grace");
                    }}
                  >
                    View invitation as Elena
                    <Icon name="arrow-right" size={16} />
                  </button>
                  <button
                    className="text-link"
                    onClick={() => {
                      feedback.prepare();
                      props.onMembershipChange("none");
                      props.onNotice(
                        "The fictional organization invitation was withdrawn.",
                      );
                      feedback.respond({
                        tone: "info",
                        title: "Your example invitation is withdrawn.",
                        message:
                          "No real invitation or membership was changed.",
                      });
                    }}
                  >
                    Withdraw invitation
                  </button>
                </div>
              </div>
            ) : (
              <div className="community-application">
                <p>
                  {props.membershipStatus === "approved"
                    ? "Elena’s application is approved. There are no other applications waiting in this fictional example."
                    : "There are no applications awaiting review in this fictional example."}
                </p>
                {props.membershipStatus === "none" && (
                  <div className="community-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        feedback.prepare();
                        props.onMembershipChange("invited");
                        props.onNotice(
                          "A fictional in-app invitation is ready for Elena to accept. Nothing was sent externally.",
                        );
                        feedback.respond({
                          tone: "pending",
                          title:
                            "Your example invitation is ready for acceptance.",
                          message:
                            "No real invitation was sent. Private inbox access stays off until demo acceptance.",
                        });
                      }}
                    >
                      Invite Elena
                      <Icon name="mail" size={16} />
                    </button>
                    <button
                      className="text-link"
                      onClick={() => {
                        feedback.prepare();
                        props.onMembershipChange("pending");
                        props.onNotice(
                          "A fictional application has been added for the owner-review walkthrough.",
                        );
                        feedback.respond({
                          tone: "pending",
                          title: "A sample application is waiting for review.",
                          message:
                            "This fictional example grants no membership access yet.",
                        });
                      }}
                    >
                      Try a sample application
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          <section className="panel community-members-panel">
            <div className="community-section-heading">
              <h2>People in this prayer community</h2>
              <span className="community-small">Private owner controls</span>
            </div>
            <div className="community-member-row">
              <span
                className="community-avatar community-lavender"
                aria-hidden="true"
              >
                C
              </span>
              <div>
                <h3>Church owner</h3>
                <span className="community-small">
                  Owner · your fictional role
                </span>
              </div>
              <span className="chip">Owner</span>
            </div>
            <div className="community-member-row">
              <span
                className="community-avatar community-sage"
                aria-hidden="true"
              >
                S
              </span>
              <div>
                <h3>Samuel</h3>
                <span className="community-small">
                  {props.memberActive
                    ? "Approved by Grace Church"
                    : "Membership removed in this demo"}
                </span>
              </div>
              <button
                className="text-link community-quiet-action"
                onClick={() => {
                  if (props.memberActive) setConfirm("member");
                  else {
                    feedback.prepare();
                    props.onMemberActiveChange(true);
                    props.onNotice(
                      "Samuel’s fictional approved membership was restored.",
                    );
                    feedback.respond({
                      tone: "info",
                      title: "Your fictional membership example is restored.",
                      message:
                        "Samuel’s approved role is active again in this demo session.",
                    });
                  }
                }}
              >
                {props.memberActive ? "Remove" : "Restore demo"}
              </button>
            </div>
            {props.memberActive && (
              <label className="community-check community-official">
                <input
                  type="checkbox"
                  checked={props.officialReplyAllowed}
                  onChange={(event) => {
                    feedback.prepare();
                    props.onOfficialReplyChange(event.target.checked);
                    props.onNotice(
                      event.target.checked
                        ? "Samuel may use the official Grace Church reply identity in this demo."
                        : "Samuel may reply personally with affiliation; official church replies are disabled for him.",
                    );
                    feedback.respond({
                      tone: "success",
                      title: "The demo reply permission is updated.",
                      message: event.target.checked
                        ? "Samuel may use Grace Church’s identity in this fictional example. Replies still need review."
                        : "Samuel keeps personal replies with affiliation; official church replies are off.",
                    });
                  }}
                />
                <span>
                  Allow Samuel to reply as Grace Church
                  <small>
                    Reading the inbox does not automatically include this
                    permission. All replies still need screening.
                  </small>
                </span>
              </label>
            )}
            <div className="community-member-row">
              <span
                className="community-avatar community-peach"
                aria-hidden="true"
              >
                M
              </span>
              <div>
                <h3>Maria</h3>
                <span className="community-small">
                  Approved by Grace Church · established example
                </span>
              </div>
              <span className="chip">Member</span>
            </div>
            {props.membershipStatus === "approved" && (
              <div className="community-member-row">
                <span
                  className="community-avatar community-peach"
                  aria-hidden="true"
                >
                  E
                </span>
                <div>
                  <h3>Elena</h3>
                  <span className="community-small">
                    Approved by Grace Church
                  </span>
                </div>
                <button
                  className="text-link community-quiet-action"
                  onClick={() => setConfirm("elena")}
                >
                  Remove
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="community-aside">
          <section className="community-care-note">
            <span className="community-soft-icon">
              <Icon name="users" size={23} />
            </span>
            <h2>One inbox, shared care.</h2>
            <p>
              All active approved members can read organization-addressed
              requests after review, including organization-only requests.
            </p>
            <p>
              Taking a request changes responsibility, never the audience.
              Personal requests remain in their own separate boxes.
            </p>
            <button
              className="text-link"
              onClick={() => props.onNavigate("inbox")}
            >
              Open the prayer inbox
              <Icon name="arrow-right" size={16} />
            </button>
          </section>
          <div className="community-distinction">
            <Icon name="shield" size={17} />
            <p>
              “Approved by Grace Church” describes church approval. It is not
              platform identity verification, a pastoral title, or a safety
              guarantee.
            </p>
          </div>
          <details className="community-details">
            <summary>History and removed access</summary>
            <p>
              Future-member access to retained requests is a prototype proposal
              that needs production approval. Existing narrower promises must
              stay narrow.
            </p>
            <p>
              Removal must revoke membership-based access to requests,
              attachments, replies, and queued alerts. This frontend only
              illustrates the change.
            </p>
          </details>
        </aside>
      </div>
      {confirm && (
        <Modal
          title={`Remove ${confirm === "elena" ? "Elena" : "Samuel"}’s membership?`}
          onClose={() => setConfirm(null)}
        >
          <p>
            This fictional person will lose membership-derived access to the
            organization inbox and its private conversations.
          </p>
          <p className="community-small">
            Personal deliveries and public material follow their own
            permissions. Removal does not delete the person’s account or expose
            an anonymous author.
          </p>
          <div className="community-actions">
            <button
              className="button"
              onClick={() => {
                feedback.prepare();
                if (confirm === "elena") props.onMembershipChange("none");
                else {
                  props.onMemberActiveChange(false);
                  props.onOfficialReplyChange(false);
                }
                props.onNotice(
                  "Fictional membership removed. No real access-control system is connected.",
                );
                setConfirm(null);
                feedback.respond({
                  tone: "info",
                  title: "The demo membership is removed.",
                  message:
                    "Membership access is removed in this example. No real account or access-control system was changed.",
                });
              }}
            >
              Remove membership
            </button>
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              Keep member
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SignupPage(props: CommunityPagesProps) {
  const feedback = useActionFeedback();
  const [kind, setKind] = useState<"individual" | "ministry">("individual");
  const [contacts, setContacts] = useState<"none" | "email" | "phone" | "both">(
    "none",
  );
  const [privacy, setPrivacy] = useState<Audience>("private");
  const [step, setStep] = useState<"details" | "review">("details");
  const [website, setWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const detailsForm = useRef<HTMLFormElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    if (step === "review") reviewHeading.current?.focus();
    else
      detailsForm.current
        ?.querySelector<HTMLInputElement>('input[name="account-type"]:checked')
        ?.focus();
  }, [step]);
  const complete = () => {
    feedback.prepare();
    if (kind === "ministry") props.onCreateOrganization?.(website);
    props.onViewerChange(kind === "individual" ? "elena" : "owner");
    props.onNotice(
      kind === "individual"
        ? "Your personal Prayer Box preview is ready."
        : "Your organization’s Prayer Box preview is ready.",
    );
    props.onNavigate(kind === "individual" ? "box/mine" : "inbox");
    feedback.respond({
      tone: "success",
      title: "Welcome to your Prayer Box preview!",
      message:
        "Your Prayer Box preview is ready to explore.",
    });
  };
  return (
    <div className="community-page community-signup-page">
      <Heading
        eyebrow="Make a little space for prayer"
        title={
          step === "details"
            ? "Your prayer box starts here."
            : "A thoughtful little beginning."
        }
      >
        {step === "details"
          ? "Asking for prayer is always free. You can begin without an email address or phone number."
          : "Review your choices and make a little space for prayer."}
      </Heading>
      <div className="community-signup-layout">
        <section className="panel community-signup-form">
          {step === "details" ? (
            <form
              ref={detailsForm}
              onSubmit={(event) => {
                event.preventDefault();
                feedback.prepare();
                if (kind === "ministry") {
                  const result = normalizeOrganizationWebsite(website);
                  if (!result.valid) {
                    setWebsiteError(result.error);
                    feedback.respond({
                      tone: "error",
                      title:
                        "Please check your organization’s website address.",
                      message: result.error,
                    });
                    return;
                  }
                  setWebsite(result.url);
                }
                setStep("review");
                feedback.respond({
                  tone: "info",
                  title: "Your Prayer Box is ready to review.",
                  message:
                    "Check your choices before continuing to your Prayer Box preview.",
                });
              }}
            >
              <fieldset className="community-kind-field">
                <legend>What would you like to create?</legend>
                <div className="community-kind-options">
                  <label className={kind === "individual" ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="account-type"
                      value="individual"
                      checked={kind === "individual"}
                      onChange={() => setKind("individual")}
                    />
                    <span>
                      <Icon name="heart" size={23} />
                      <strong>Individual</strong>
                      <small>
                        A personal box for prayer and encouragement.
                      </small>
                    </span>
                  </label>
                  <label className={kind === "ministry" ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="account-type"
                      value="ministry"
                      checked={kind === "ministry"}
                      onChange={() => setKind("ministry")}
                    />
                    <span>
                      <Icon name="users" size={23} />
                      <strong>Ministry or organization</strong>
                      <small>
                        A separate community box, managed with your own login.
                      </small>
                    </span>
                  </label>
                </div>
              </fieldset>
              <div className="community-field-grid">
                <label className="field">
                  Username
                  <input
                    readOnly
                    value={kind === "individual" ? "elena" : "church-owner"}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>Display name <span className="community-optional">optional</span></span>
                  <input
                    readOnly
                    value={kind === "individual" ? "Elena" : "Church owner"}
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="field">
                Password
                <input
                  readOnly
                  value="prayer-box-preview"
                  type="password"
                  autoComplete="off"
                />
              </label>
              <div className="community-signup-language">
                <label className="field">
                  {uiText("languageLabel", props.language)}
                  <select
                    value={props.language}
                    onChange={(event) =>
                      props.onLanguageChange(
                        resolveUiLanguage(event.target.value),
                      )
                    }
                    aria-describedby="signup-language-help"
                  >
                    {supportedLanguages.map((language) => (
                      <option value={language.code} key={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="community-field-help" id="signup-language-help">
                {uiText("languageHelp", props.language)}
              </p>
              {kind === "ministry" && (
                <div className="community-ministry-fields">
                  <h2>Your separate organization box</h2>
                  <label className="field">
                    Organization name
                    <input readOnly value="Grace Church" />
                  </label>
                  <label className="field">
                    Organization link
                    <input readOnly value="/ministry/grace-church" />
                  </label>
                  <label className="field">
                    Organization website{" "}
                    <span className="community-optional">optional</span>
                    <input
                      type="text"
                      inputMode="url"
                      value={website}
                      placeholder="https://example.org"
                      maxLength={2048}
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!websiteError}
                      aria-describedby="organization-signup-website-help"
                      onChange={(event) => {
                        setWebsite(event.target.value);
                        setWebsiteError("");
                      }}
                    />
                  </label>
                  <p
                    className="community-field-help"
                    id="organization-signup-website-help"
                  >
                    Your website link will appear on your organization’s public
                    prayer box. Leave it blank if you do not have one.
                  </p>
                  {websiteError && (
                    <p className="organization-website-error" role="alert">
                      {websiteError}
                    </p>
                  )}
                  <p className="community-field-help">
                    You can start with the owner alone and invite prayer
                    warriors when you’re ready.
                  </p>
                </div>
              )}
              <label className="field">
                Account visibility
                <select
                  value={privacy}
                  onChange={(event) =>
                    setPrivacy(event.target.value as Audience)
                  }
                >
                  <option value="private">Private · suggested default</option>
                  <option value="friends">My Church · accepted friends</option>
                  <option value="public">Everyone</option>
                </select>
              </label>
              <p className="community-field-help">
                Private hides profile content and requests from outsiders.
                Explicitly chosen recipients can still receive your request.
              </p>
              <details className="community-details community-contact-details">
                <summary>Optional contact & recovery</summary>
                <div className="community-details-body">
                  <label className="field">
                    Contact preference
                    <select
                      value={contacts}
                      onChange={(event) =>
                        setContacts(event.target.value as typeof contacts)
                      }
                    >
                      <option value="none">No email or phone</option>
                      <option value="email">Email only</option>
                      <option value="phone">Phone only</option>
                      <option value="both">Email and phone</option>
                    </select>
                  </label>
                  {(contacts === "email" || contacts === "both") && (
                    <label className="field">
                      Email · unverified
                      <input readOnly value="elena@example.invalid" />
                    </label>
                  )}
                  {(contacts === "phone" || contacts === "both") && (
                    <label className="field">
                      Phone · unverified
                      <input readOnly value="+1 (202) 555-0104" />
                    </label>
                  )}
                  <p>
                    Contact details stay private. Verification and permission
                    to send alerts are separate choices. Marketing is optional
                    and off by default.
                  </p>
                  <p>
                    Without a verified contact method, recovery codes are
                    essential. Losing both your password and codes can prevent
                    recovery.
                  </p>
                </div>
              </details>
              <div className="community-signup-policy">
                <Icon name="shield" size={20} />
                <div>
                  <h2>A place for prayer, not fundraising.</h2>
                  <p>
                    Please do not ask for money or post payment handles, QR
                    codes, or fundraising links. For financial support, contact
                    your local church or use a fundraising platform. Prayer
                    about financial hardship is welcome.
                  </p>
                </div>
              </div>
              <div className="community-challenge community-signup-bot-check">
                <Icon name="shield" size={22} />
                <div>
                  <strong>Bot check</strong>
                  <p>A little care to keep this space welcoming.</p>
                </div>
              </div>
              <button className="button community-full-button" type="submit">
                Review your Prayer Box
                <Icon name="arrow-right" size={18} />
              </button>
            </form>
          ) : (
            <div className="community-signup-review">
              <span className="community-soft-icon">
                <Icon name="heart" size={25} />
              </span>
              <h2 ref={reviewHeading} tabIndex={-1}>
                {kind === "individual"
                  ? "A personal box for Elena"
                  : "A community box with its owner"}
              </h2>
              <dl>
                {kind === "ministry" && (
                  <div>
                    <dt>Organization website</dt>
                    <dd className="organization-website-review">
                      {website || "Not added"}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Setup</dt>
                  <dd>
                    {kind === "individual"
                      ? "Individual"
                      : "Ministry or organization"}
                  </dd>
                </div>
                <div>
                  <dt>Visibility</dt>
                  <dd>
                    {privacy === "private"
                      ? "Private"
                      : privacy === "friends"
                        ? "Accepted friends"
                        : "Everyone"}
                  </dd>
                </div>
                <div>
                  <dt>Contact preference</dt>
                  <dd>
                    {contacts === "none"
                      ? "None required"
                      : `${contacts === "both" ? "Email and phone" : contacts === "email" ? "Email" : "Phone"} · unverified`}
                  </dd>
                </div>
                <div>
                  <dt>External alerts</dt>
                  <dd>Off</dd>
                </div>
                <div>
                  <dt>Interface language</dt>
                  <dd>English</dd>
                </div>
              </dl>
              <section className="community-recovery">
                <h3>Keep a way back.</h3>
                <p>
                  Without a verified email or phone number, keep your recovery
                  codes somewhere safe. Losing both your password and codes can
                  prevent account recovery.
                </p>
              </section>
              {kind === "ministry" && (
                <p className="community-field-help">
                  Your organization can begin with its owner. Prayer warriors
                  join through an invitation or an approved application.
                </p>
              )}
              <div className="community-actions">
                <button className="button" onClick={complete}>
                  Open your Prayer Box preview
                  <Icon name="arrow-right" size={17} />
                </button>
                <button
                  className="button secondary"
                  onClick={() => setStep("details")}
                >
                  Back to choices
                </button>
              </div>
            </div>
          )}
        </section>
        <aside className="community-aside">
          <section className="community-care-note">
            <span className="community-soft-icon">
              <Icon name="heart" size={23} />
            </span>
            <h2>You do not need the perfect words.</h2>
            <p>
              There is room for gratitude, grief, questions, and an unfinished
              story. You are welcome to ask for prayer.
            </p>
            <p>
              We come to the Father through Jesus Christ, with the help of the
              Holy Spirit.
            </p>
            <button
              className="text-link"
              onClick={() => props.onNavigate("about")}
            >
              About Prayer Box
              <Icon name="arrow-right" size={16} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function reviewReason(request: PrayerRequest) {
  if (request.reviewReason) return request.reviewReason;
  const result = screenText(request.text);
  if (result.state !== "approved") return result.reason;
  if (request.media?.status === "pending")
    return `The ${request.media.kind} attachment is quarantined in this example. Actual file validation, OCR, visual/audio analysis, transcripts, and human coverage are not connected.`;
  if (request.moderation === "appeal")
    return "An author asked for a human to review this fictional decision. A report or screening flag is not proof of abuse.";
  return "Selected for contextual human review in this fictional example. Sincere hardship and theological questions must be distinguished from harmful conduct or promotion.";
}

function ReviewPage(props: CommunityPagesProps) {
  const feedback = useActionFeedback();
  const [decision, setDecision] = useState<{
    id: string;
    action: "reject" | "revision";
  } | null>(null);
  const [reason, setReason] = useState(
    "Remove payment instructions or fundraising details.",
  );
  const [completed, setCompleted] = useState<string[]>([]);
  if (props.viewer !== "operator")
    return (
      <div className="community-page">
        <Heading
          eyebrow="Platform safety"
          title="Careful review, with clear boundaries."
        >
          Safety review is separate from church membership, ownership, and
          assignment.
        </Heading>
        <AccessNotice
          title="Restricted safety access"
          text="Church owners and approved members are not platform moderators. No queue, private report, or reviewer note is exposed in this view."
          onSwitch={() => props.onViewerChange("operator")}
          switchLabel="Explore the fictional operator role"
        />
      </div>
    );
  const queue = props.requests.filter(
    (request) =>
      (request.moderation !== "approved" ||
        request.media?.status === "pending") &&
      !completed.includes(request.id),
  );
  const selected = props.requests.find(
    (request) => request.id === decision?.id,
  );
  const approve = (id: string) => {
    feedback.prepare();
    props.onUpdateRequests((rows) =>
      rows.map((request) =>
        request.id === id
          ? {
              ...request,
              moderation: "approved",
              reviewReason: undefined,
              ...(request.media
                ? { media: { ...request.media, status: "approved" } }
                : {}),
            }
          : request,
      ),
    );
    setCompleted((rows) => [...rows, id]);
    props.onNotice(
      "A manual approval was simulated. This changes fictional browser state only; no live text or media screening was performed.",
    );
    feedback.respond({
      tone: "success",
      title: "Your demo review is complete.",
      message:
        "Approval was simulated in this browser only. No live text or media screening happened.",
    });
  };
  const finishDecision = () => {
    if (!decision) return;
    feedback.prepare();
    props.onUpdateRequests((rows) =>
      rows.map((request) =>
        request.id === decision.id
          ? { ...request, moderation: "changes", reviewReason: reason }
          : request,
      ),
    );
    setCompleted((rows) => [...rows, decision.id]);
    props.onNotice(
      `Simulated ${decision.action === "reject" ? "rejection" : "revision request"}: ${reason} The author can revise or appeal; no account was automatically banned.`,
    );
    setDecision(null);
    feedback.respond({
      tone: "info",
      title: "Your demo review decision is recorded.",
      message:
        "The example remains unpublished. The author can revise or appeal; no account was automatically banned.",
    });
  };
  return (
    <div className="community-page">
      <Heading
        eyebrow="Restricted operator view · simulated"
        title="A first line of care, then a human."
      >
        Understand the context, explain decisions, and leave a route to appeal.
        This local queue demonstrates a workflow; it does not provide working
        screening or security.
      </Heading>
      <div className="community-review-notice">
        <Icon name="shield" size={22} />
        <p>
          Fictional review material only. Platform-safety access does not make
          this operator a church member. Anonymous bylines stay anonymous, and
          donor records stay outside moderation.
        </p>
      </div>
      <div className="community-review-layout">
        <section
          className="community-review-queue"
          aria-label="Fictional manual review queue"
        >
          {queue.length ? (
            queue.map((request) => (
              <article className="panel community-review-card" key={request.id}>
                <div className="community-section-heading">
                  <span className="community-small">
                    {request.moderation === "appeal"
                      ? "Human appeal"
                      : request.media?.status === "pending"
                        ? `${request.media.kind.charAt(0).toUpperCase() + request.media.kind.slice(1)} under review`
                        : request.moderation === "changes"
                          ? "Needs changes"
                          : "Contextual review"}
                  </span>
                  <span className="chip">Not released by this review</span>
                </div>
                <h2>{request.topic}</h2>
                <p className="community-review-byline">
                  {authorLabel(request)} ·{" "}
                  {request.recipient === "grace"
                    ? "Grace Church"
                    : request.recipient === "maria"
                      ? "Maria’s box"
                      : "Elena’s box"}
                  <span>
                    {getAudienceLabel(request.audience, request.recipient)}
                  </span>
                </p>
                <blockquote>{request.text}</blockquote>
                {request.media && (
                  <div className="community-attachment">
                    <Icon
                      name={
                        request.media.kind === "audio"
                          ? "mic"
                          : request.media.kind === "video"
                            ? "video"
                            : "image"
                      }
                      size={19}
                    />
                    <span>
                      {request.media.kind.charAt(0).toUpperCase() +
                        request.media.kind.slice(1)}{" "}
                      fixture ·{" "}
                      {request.media.status === "pending"
                        ? "under review, no file attached"
                        : "approved example, no file attached"}
                    </span>
                  </div>
                )}
                <div className="community-review-reason">
                  <strong>Why it is here</strong>
                  <p>{reviewReason(request)}</p>
                </div>
                <div className="community-actions">
                  <button
                    className="button"
                    onClick={() => approve(request.id)}
                  >
                    Simulate approval
                    <Icon name="check" size={16} />
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setReason(
                        "Please clarify the context without active payment instructions or identifying details.",
                      );
                      setDecision({ id: request.id, action: "revision" });
                    }}
                  >
                    Request revision
                  </button>
                  <button
                    className="text-link community-quiet-action"
                    onClick={() => {
                      setReason(
                        "Remove payment instructions or fundraising details.",
                      );
                      setDecision({ id: request.id, action: "reject" });
                    }}
                  >
                    Reject
                  </button>
                  <button
                    className="text-link"
                    onClick={() => {
                      feedback.prepare();
                      props.onCareConcern(request.id);
                    }}
                  >
                    This person may need help
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="panel community-empty">
              <Icon name="check" size={28} />
              <h2>Nothing waiting in this example.</h2>
              <p>
                Completed actions changed only local fictional state. There is
                no active moderation service or staffed queue.
              </p>
            </div>
          )}
        </section>
        <aside className="community-aside">
          <section className="community-care-note">
            <h2>Review the content, respect the person.</h2>
            <ul>
              <li>
                Financial hardship is welcome. Asking for money is outside the
                content policy.
              </li>
              <li>
                Honest grief, illness, abuse, and sincere questions need
                context.
              </li>
              <li>
                A raw report is an allegation, not a training label or an
                automatic ban.
              </li>
              <li>
                Successful appeals belong in validated feedback, alongside
                confirmed missed abuse.
              </li>
            </ul>
          </section>
          <details className="community-details">
            <summary>From a report to a safer rule</summary>
            <p>
              A human validates the report or appeal, minimizes sensitive
              information, and records a reason. An approved, versioned update
              must pass held-out evaluation and support rollback.
            </p>
            <p>
              No model is trained and no production rule changes in this
              frontend.
            </p>
          </details>
          <details className="community-details">
            <summary>Restriction boundaries</summary>
            <p>
              Blocking or reporting removes an actor’s material from the
              affected box or member view. A personal filter does not erase the
              shared church inbox for everyone.
            </p>
            <p>
              Production account restrictions require evidence, reasons, an
              appeal route, and server enforcement. Donation access and monthly
              cancellation must remain safely available.
            </p>
          </details>
        </aside>
      </div>
      {decision && selected && (
        <Modal
          title={
            decision.action === "reject"
              ? "Explain the simulated rejection"
              : "Request a clearer revision"
          }
          onClose={() => setDecision(null)}
        >
          <p>
            Choose an understandable reason for the author. Reporter identity,
            hidden account links, and internal detection thresholds must stay
            private.
          </p>
          <label className="field">
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {[
                reason,
                "Remove payment instructions or fundraising details.",
                "Please clarify the context without active payment instructions or identifying details.",
                "Please remove language that targets or threatens another person.",
                "A human needs to review this theological context before publication.",
              ]
                .filter((value, index, all) => all.indexOf(value) === index)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </label>
          <p className="community-small">
            This changes the fictional version to Needs changes. The author
            keeps a route to edit and appeal. No permanent account decision
            follows automatically.
          </p>
          <div className="community-actions">
            <button className="button" onClick={finishDecision}>
              {decision.action === "reject"
                ? "Simulate rejection"
                : "Request revision"}
            </button>
            <button
              className="button secondary"
              onClick={() => setDecision(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function CommunityPages(props: CommunityPagesProps) {
  if (props.page === "church") return <ChurchPage {...props} />;
  if (props.page === "members") return <MembersPage {...props} />;
  if (props.page === "signup") return <SignupPage {...props} />;
  return <ReviewPage {...props} />;
}
