import { useEffect, useState } from "react";
import { authorLabel, getAudienceLabel, screenText } from "../domain";
import type { Audience, PrayerRequest, Viewer } from "../domain";
import { Icon, Modal } from "../ui";
import { PlatformAcknowledgment } from "./CareFlow";
import { formatStoryDate, getStoryPosts, storyRevision } from "../story";
import "../story-detail.css";

type Props = {
  request: PrayerRequest;
  viewer: Viewer;
  groupMember: boolean;
  officialAllowed: boolean;
  postingRestricted: boolean;
  outsideAudience: Audience;
  isFriend: boolean;
  reminders: boolean;
  testimonyOnly?: boolean;
  blockedActors: string[];
  onRemindersChange: (enabled: boolean) => void;
  onUpdate: (update: (row: PrayerRequest) => PrayerRequest) => void;
  onNavigate: (route: string) => void;
  onReport: (reason: string, actorId: string) => void;
  onBlock: (actorId: string) => void;
  onCareConcern: () => void;
  onSupport: () => void;
  onReuse: () => void;
  onNotice: (message: string) => void;
  onDelete?: () => void;
};

export default function PrayerDetail({
  request,
  viewer,
  groupMember,
  officialAllowed,
  postingRestricted,
  outsideAudience,
  isFriend,
  reminders,
  blockedActors,
  onRemindersChange,
  onUpdate,
  onNavigate,
  onReport,
  onBlock,
  onCareConcern,
  onSupport,
  onReuse,
  onNotice,
  onDelete,
}: Props) {
  const [safety, setSafety] = useState<
    "options" | "report" | "block" | "care" | null
  >(null);
  const [reportReason, setReportReason] = useState("Scam or request for money");
  const [target, setTarget] = useState(request.authorId);
  const [friendDismissed, setFriendDismissed] = useState(false);
  const [reply, setReply] = useState(
    "Father, please give peace for today and wisdom for the next step. Help us trust you, through Jesus Christ, with the help of the Holy Spirit. Amen.",
  );
  const [replyAs, setReplyAs] = useState("personal");
  const [replyKind, setReplyKind] = useState<"text" | "audio">("text");
  const [recording, setRecording] = useState<"idle" | "recording" | "preview">(
    "idle",
  );
  const [replyReview, setReplyReview] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [replyPostId, setReplyPostId] = useState("original");
  useEffect(() => {
    if (recording !== "recording") return;
    const timer = setInterval(
      () => setRecordingSeconds((seconds) => Math.min(seconds + 1, 120)),
      1000,
    );
    return () => clearInterval(timer);
  }, [recording]);
  const author = viewer !== "guest" && request.authorId === viewer;
  const organization = request.recipient === "grace";
  const held = request.moderation !== "approved";
  const posts = held ? [] : getStoryPosts(request);
  const selectedPost = posts.find((post) => post.id === replyPostId);
  const selectedScope = selectedPost?.id ?? "original";
  const originalDate = request.postedAt ?? request.createdAt;
  const selectedLabel = selectedPost
    ? `${selectedPost.kind === "testimony" ? "Testimony" : "Update"} · ${formatStoryDate(selectedPost.createdAt)}`
    : `Original request · ${formatStoryDate(originalDate)}`;
  useEffect(() => {
    setReplyPostId("original");
    setFriendDismissed(false);
    setTarget(request.authorId);
    setReplyReview("");
    setRecording("idle");
    setPreviewPlaying(false);
  }, [request.id, request.authorId]);
  const memberName =
    viewer === "owner"
      ? "Church owner"
      : viewer === "member"
        ? "Samuel"
        : viewer === "maria"
          ? "Maria"
          : viewer === "operator"
            ? "Safety reviewer"
            : "Elena";
  const personalByline =
    groupMember && organization
      ? `${memberName} · Grace Church prayer community`
      : memberName;
  const canReplyOfficially =
    organization && groupMember && (viewer === "owner" || officialAllowed);

  const postAnchor = (id: string) => `story-post-${encodeURIComponent(id)}`;
  const storyHref = `#request/${request.id}`;
  function jumpToSection(id: string, scope?: string) {
    if (scope) setReplyPostId(scope);
    const section = document.getElementById(id);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function machineDate(value: string) {
    return Number.isNaN(Date.parse(value)) ? undefined : value;
  }

  function sendReply() {
    if (postingRestricted) {
      setReplyReview(
        "Posting is restricted after a simulated validated review. A human must review the account appeal before posting resumes.",
      );
      return;
    }
    const result = screenText(reply);
    if (result.state !== "approved" || replyKind === "audio") {
      setReplyReview(
        replyKind === "audio"
          ? "The simulated audio prayer is held for transcription and media review. No recording or transcript is visible to recipients yet. You can return to its draft or try text."
          : `${result.reason} Your reply is not published. You can revise it or request human review.`,
      );
      return;
    }
    onUpdate((row) => ({
      ...row,
      replies: [
        ...row.replies,
        {
          id: `reply-${crypto.randomUUID()}`,
          testimonyId: selectedPost?.id,
          actorId: viewer,
          postedAt: new Date().toISOString(),
          storyRevision: storyRevision(row),
          name:
            replyAs === "official" && canReplyOfficially
              ? "Grace Church"
              : personalByline,
          official: replyAs === "official" && canReplyOfficially,
          text: reply,
        },
      ],
    }));
    setReplyReview(
      "Your example reply was added to this conversation after the demo check. No message was sent outside this browser.",
    );
    onNotice(
      author
        ? "Your example encouragement was added to this story."
        : "Your prayer or encouragement was added. This request is now in My Prayers until the author shares an update or testimony.",
    );
  }

  return (
    <div className="detail-page">
      <button
        className="text-link back-link"
        onClick={() =>
          onNavigate(
            author
              ? "requests"
              : organization
                ? "box/grace"
                : `box/${request.recipient}`,
          )
        }
      >
        <Icon name="back" size={17} /> Back to{" "}
        {author ? "My Requests" : "the prayer box"}
      </button>
      <div className="detail-layout">
        <div>
          <nav
            className="story-trail"
            aria-label="Follow this prayer story by date"
          >
            <span className="story-trail-label">A story, still unfolding</span>
            <ol>
              <li>
                <a
                  href={storyHref}
                  onClick={(event) => {
                    event.preventDefault();
                    jumpToSection("story-original", "original");
                  }}
                >
                  <span>Original prayer</span>
                  <time dateTime={machineDate(originalDate)}>
                    {formatStoryDate(originalDate)}
                  </time>
                </a>
              </li>
              {posts.map((post) => (
                <li key={post.id}>
                  <a
                    href={storyHref}
                    onClick={(event) => {
                      event.preventDefault();
                      jumpToSection(postAnchor(post.id), post.id);
                    }}
                  >
                    <span>
                      {post.kind === "testimony" ? "Testimony" : "Update"}
                    </span>
                    <time dateTime={machineDate(post.createdAt)}>
                      {formatStoryDate(post.createdAt)}
                    </time>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article
            className="prayer-sheet panel story-original"
            id="story-original"
            tabIndex={-1}
            aria-labelledby="original-prayer-title"
          >
            <div className="detail-topline">
              <span className="eyebrow">Original prayer request</span>
              {!author && (
                <button
                  className="icon-button"
                  aria-label="Request safety and care options"
                  onClick={() => {
                    setTarget(request.authorId);
                    setSafety("options");
                  }}
                >
                  <Icon name="more" />
                </button>
              )}
            </div>
            <h1 className="page-title" id="original-prayer-title">
              {request.topic}
            </h1>
            <div className="request-byline">
              <span
                className={`avatar avatar-small ${request.anonymous ? "anonymous" : ""}`}
              >
                {request.anonymous ? (
                  <Icon name="heart" size={16} />
                ) : (
                  authorLabel(request).slice(0, 1)
                )}
              </span>
              <span>{authorLabel(request)}</span>
              <span aria-hidden="true">·</span>
              <a
                className="story-date-link"
                href={storyHref}
                onClick={(event) => {
                  event.preventDefault();
                  jumpToSection("story-original", "original");
                }}
                aria-label={`Original request from ${formatStoryDate(originalDate)}`}
              >
                <time dateTime={machineDate(originalDate)}>
                  {formatStoryDate(originalDate)}
                </time>
              </a>
            </div>
            <div className="audience-line">
              <Icon
                name={outsideAudience === "public" ? "globe" : "lock"}
                size={15}
              />
              {getAudienceLabel(outsideAudience, request.recipient)}
              {request.authorCeiling === "private" &&
              request.audience !== "private"
                ? " · account limit hides this from outsiders"
                : ""}
            </div>
            <p className="prayer-text">{request.text}</p>
            {held && (
              <div className="notice butter">
                <Icon name="shield" />
                <div>
                  <strong>
                    {request.moderation === "appeal"
                      ? "Appeal awaiting a person"
                      : request.moderation === "changes"
                        ? "Changes requested · not delivered"
                        : "Review pending · not delivered"}
                  </strong>
                  <p>
                    {request.reviewReason ?? screenText(request.text).reason}
                  </p>
                  <p>
                    Only the author can see this status here. Ministry
                    membership does not unlock held content.
                  </p>
                  {request.moderation !== "appeal" && (
                    <div className="inline-actions">
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          onUpdate((row) => ({
                            ...row,
                            moderation: "appeal",
                            reviewReason: `${row.reviewReason ?? screenText(row.text).reason} The author requested a manual review of the decision and its context.`,
                          }));
                          onNotice(
                            "Simulated appeal added to the separate human-review queue.",
                          );
                        }}
                      >
                        Appeal for human review
                      </button>
                      <button className="text-link" onClick={onReuse}>
                        Revise a separate draft
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!held && request.media && (
              <div
                className={`media-state ${request.media.status === "pending" ? "pending" : ""}`}
              >
                <span className="media-swatch">
                  <Icon name={request.media.kind} size={26} />
                </span>
                <div>
                  <strong>
                    {request.media.kind === "photo"
                      ? "Photo"
                      : request.media.kind === "audio"
                        ? "Audio"
                        : "Video"}{" "}
                    ·{" "}
                    {request.media.status === "pending"
                      ? "review pending"
                      : "approved fixture"}
                  </strong>
                  <p>
                    {request.media.status === "pending"
                      ? "Attachment and any transcript are unavailable while review is pending. Approved text is visible separately."
                      : "Fictional media state. No file is loaded and no voice recording is played."}
                  </p>
                  {request.media.status === "approved" && (
                    <details>
                      <summary>Read the fictional text alternative</summary>
                      <p>
                        Please pray for grace in ordinary days, and for courage
                        to keep returning honestly to God.
                      </p>
                    </details>
                  )}
                </div>
              </div>
            )}
            {author && (
              <p className="private-thread-note">
                <Icon name="lock" size={16} /> This delivery has its own
                conversation. Other destinations and replies are not shown to
                this recipient.
              </p>
            )}
            {author && onDelete && (
              <div className="story-author-actions">
                <button className="text-link story-delete" onClick={onDelete}>
                  <Icon name="close" size={15} />
                  Delete request
                </button>
                <span>
                  Choose the delivery scope before anything is removed.
                </span>
              </div>
            )}
          </article>
          {posts.length > 0 && (
            <div
              className="story-posts"
              aria-label="Published updates and testimonies in this delivery"
            >
              {posts.map((post) => (
                <article
                  key={post.id}
                  className={`panel story-post story-post-${post.kind}`}
                  id={postAnchor(post.id)}
                  tabIndex={-1}
                  aria-labelledby={`${postAnchor(post.id)}-title`}
                >
                  <div className="story-post-heading">
                    <span className="eyebrow">
                      <Icon
                        name={post.kind === "testimony" ? "sun" : "note"}
                        size={16}
                      />
                      {post.kind === "testimony" ? "A testimony" : "An update"}
                    </span>
                    <a
                      className="story-date-link"
                      href={storyHref}
                      onClick={(event) => {
                        event.preventDefault();
                        jumpToSection(postAnchor(post.id), post.id);
                      }}
                    >
                      <time dateTime={machineDate(post.createdAt)}>
                        {formatStoryDate(post.createdAt)}
                      </time>
                    </a>
                  </div>
                  <h2 id={`${postAnchor(post.id)}-title`}>
                    {post.kind === "testimony"
                      ? "A little testimony"
                      : "The story continues"}
                  </h2>
                  <p className="story-post-byline">
                    From {authorLabel(request)} · Same delivery and audience
                  </p>
                  <p className="prayer-text">{post.text}</p>
                  <div className="story-post-footer">
                    <a
                      className="text-link"
                      href={storyHref}
                      onClick={(event) => {
                        event.preventDefault();
                        jumpToSection("story-original", "original");
                      }}
                    >
                      <Icon name="link" size={16} />
                      Original prayer · {formatStoryDate(originalDate)}
                    </a>
                    <button
                      className="button secondary compact"
                      onClick={() =>
                        jumpToSection("story-encouragement", post.id)
                      }
                    >
                      Pray for this {post.kind}
                      <Icon name="heart" size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!held && (
            <>
              {isFriend &&
                !request.anonymous &&
                !author &&
                reminders &&
                !friendDismissed && (
                  <aside className="friend-reminder">
                    <button
                      className="icon-button"
                      aria-label="Dismiss the prayer-together reminder"
                      onClick={() => setFriendDismissed(true)}
                    >
                      <Icon name="close" size={17} />
                    </button>
                    <span className="eyebrow">
                      <Icon name="people" size={15} /> A little encouragement
                    </span>
                    <h2>There’s room for prayer beyond the screen.</h2>
                    <p>
                      When it’s possible and welcomed, consider praying with
                      your friend in person. Ask before laying a hand on their
                      shoulder. Pray in Jesus’ name with gentleness, respect,
                      and trust in God’s will.
                    </p>
                    <button
                      className="text-link"
                      onClick={() => {
                        onRemindersChange(false);
                        onNotice(
                          "Prayer-together reminders are off for this demo session.",
                        );
                      }}
                    >
                      Turn these reminders off
                    </button>
                  </aside>
                )}
              <section
                className="conversation panel story-conversation"
                id="story-encouragement"
                tabIndex={-1}
                aria-labelledby="conversation-heading"
              >
                <div className="section-heading">
                  <h2 id="conversation-heading">A little encouragement</h2>
                  <Icon name="heart" size={20} />
                </div>
                <p className="quiet-copy">
                  Prayers and kind words stay with the part of the story you
                  choose, in this delivery’s conversation. A reply is never a
                  promise of an outcome.
                </p>
                <label className="field story-scope-field">
                  Pray for
                  <select
                    value={selectedScope}
                    onChange={(event) => {
                      setReplyPostId(event.target.value);
                      setReplyReview("");
                    }}
                  >
                    <option value="original">
                      Original request · {formatStoryDate(originalDate)}
                    </option>
                    {posts.map((post) => (
                      <option value={post.id} key={post.id}>
                        {post.kind === "testimony" ? "Testimony" : "Update"} ·{" "}
                        {formatStoryDate(post.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="story-selected-scope">
                  <Icon name="link" size={14} />
                  {selectedLabel}
                </p>
                <div className="replies">
                  {selectedScope === "original" && (
                    <PlatformAcknowledgment request={request} viewer={viewer} />
                  )}
                  {request.replies
                    .filter((r) =>
                      selectedPost
                        ? r.testimonyId === selectedPost.id
                        : !r.testimonyId,
                    )
                    .filter(
                      (r) => !r.actorId || !blockedActors.includes(r.actorId),
                    )
                    .filter(
                      (r) =>
                        !r.automatic ||
                        author ||
                        (request.recipient === "mine" && viewer === "elena") ||
                        (request.recipient === "maria" && viewer === "maria") ||
                        (organization && groupMember),
                    )
                    .map((r) => (
                      <div
                        className={`reply-note ${r.automatic ? "automatic" : ""}`}
                        key={r.id}
                      >
                        <div className="reply-heading">
                          <strong>{r.name}</strong>
                          {r.automatic ? (
                            <span className="chip">Automatic box welcome</span>
                          ) : r.official ? (
                            <span className="chip">Organization reply</span>
                          ) : null}
                          {!r.automatic && (
                            <span className="story-reply-date">
                              {r.postedAt ? (
                                <time dateTime={machineDate(r.postedAt)}>
                                  {formatStoryDate(r.postedAt)}
                                </time>
                              ) : (
                                "Earlier encouragement"
                              )}
                            </span>
                          )}
                          {!r.automatic &&
                            r.actorId &&
                            r.actorId !== viewer && (
                              <button
                                className="icon-button"
                                aria-label={`Report or block reply from ${r.name}`}
                                onClick={() => {
                                  setTarget(r.actorId!);
                                  setSafety("report");
                                }}
                              >
                                <Icon name="more" size={16} />
                              </button>
                            )}
                        </div>
                        <p>{r.text}</p>
                        {r.automatic && (
                          <small>
                            An automatic welcome. This does not mean someone has
                            read, prayed, or taken this request.
                          </small>
                        )}
                      </div>
                    ))}
                </div>
                {viewer === "guest" ? (
                  <div className="guest-reply">
                    <Icon name="lock" />
                    <p>
                      Try a fictional account to leave encouragement. Your visit
                      does not make a church membership.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => onNavigate("signup")}
                    >
                      Try the signup flow
                    </button>
                  </div>
                ) : (
                  <div className="reply-composer">
                    <label className="field">
                      Reply as
                      <select
                        value={replyAs}
                        onChange={(event) => setReplyAs(event.target.value)}
                      >
                        <option value="personal">{personalByline}</option>
                        {canReplyOfficially && (
                          <option value="official">
                            Grace Church · authorized organization identity
                          </option>
                        )}
                      </select>
                    </label>
                    {organization && (
                      <p className="quiet-copy">
                        A personal byline stays in this organization thread.
                        Every active approved member can read it.
                      </p>
                    )}
                    <div
                      className="reply-kind"
                      aria-label="Encouragement format"
                    >
                      <button
                        className={`tab ${replyKind === "text" ? "active" : ""}`}
                        onClick={() => {
                          setReplyKind("text");
                          setReplyReview("");
                        }}
                      >
                        Text
                      </button>
                      <button
                        className={`tab ${replyKind === "audio" ? "active" : ""}`}
                        onClick={() => {
                          setReplyKind("audio");
                          setReplyReview("");
                        }}
                      >
                        <Icon name="audio" size={16} /> Recorded prayer
                      </button>
                    </div>
                    {replyKind === "text" ? (
                      <label className="field">
                        <span className="sr-only">Fictional encouragement</span>
                        <textarea
                          rows={4}
                          value={reply}
                          maxLength={5000}
                          onChange={(event) => setReply(event.target.value)}
                          aria-describedby="reply-fictional-note"
                        />
                        <small id="reply-fictional-note">
                          Use invented words only. No real request or message is
                          sent.
                        </small>
                      </label>
                    ) : (
                      <div className="recording-demo">
                        <Icon name="audio" size={27} />
                        <strong>
                          {recording === "recording"
                            ? "Recording state · simulated"
                            : recording === "preview"
                              ? "A prayer ready for review"
                              : "Try a recorded prayer"}
                        </strong>
                        <p>
                          No microphone is opened. This demonstrates start,
                          stop, preview, retry, and review states.
                        </p>
                        <p className="recording-duration">
                          {Math.floor(recordingSeconds / 60)}:
                          {String(recordingSeconds % 60).padStart(2, "0")} ·
                          demo duration
                        </p>
                        <p className="quiet-copy">
                          A voice can identify its speaker even with an
                          organization byline. Review what you share.
                        </p>
                        {recording === "idle" ? (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setRecordingSeconds(0);
                              setPreviewPlaying(false);
                              setRecording("recording");
                            }}
                          >
                            Start demo recording
                          </button>
                        ) : recording === "recording" ? (
                          <button
                            className="button secondary"
                            onClick={() => setRecording("preview")}
                          >
                            Stop demo recording
                          </button>
                        ) : (
                          <>
                            <button
                              className="button secondary"
                              aria-pressed={previewPlaying}
                              onClick={() =>
                                setPreviewPlaying((value) => !value)
                              }
                            >
                              {previewPlaying
                                ? "Pause playback example"
                                : "Preview playback example"}
                            </button>
                            <p>
                              {previewPlaying
                                ? "Playing state · simulated. No audio file or voice is played."
                                : "Playback is a UI example. Read the fictional transcript below."}
                            </p>
                            <details>
                              <summary>
                                Preview the fictional transcript
                              </summary>
                              <p>{reply}</p>
                            </details>
                            <button
                              className="text-link"
                              onClick={() => {
                                setRecording("idle");
                                setReplyReview("");
                              }}
                            >
                              Discard and try again
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <button
                      className="button"
                      disabled={
                        replyKind === "text"
                          ? !reply.trim()
                          : recording !== "preview"
                      }
                      onClick={sendReply}
                    >
                      {replyKind === "audio"
                        ? "Submit example for review"
                        : "Leave encouragement"}{" "}
                      <Icon name="arrow" size={17} />
                    </button>
                    {replyReview && (
                      <div className="notice butter" role="status">
                        <Icon name="info" />
                        <div>
                          <p>{replyReview}</p>
                          {!replyReview.startsWith("Your example reply") && (
                            <button
                              className="text-link"
                              onClick={() =>
                                setReplyReview(
                                  "Your simulated appeal is awaiting manual review. This example remains unpublished. No automated restriction has been removed. Return to the draft to revise it.",
                                )
                              }
                            >
                              Request human review
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
        <aside className="detail-sidebar">
          <div className="side-note sage-wash">
            <Icon name="lock" size={23} />
            <h2>
              {organization
                ? "A shared prayer community"
                : "One conversation at a time"}
            </h2>
            <p>
              {organization
                ? "All active approved Grace Church members can read this organization delivery. Assignment does not narrow that audience."
                : `This request belongs to ${request.recipient === "mine" ? "Elena" : "Maria"}’s personal box. A church association does not give anyone access to it.`}
            </p>
            {organization && (
              <p className="quiet-copy">
                Proposed: later approved members may read retained group
                requests. For confidentiality from a member, choose a trusted
                individual instead.
              </p>
            )}
          </div>
          <div className="side-note">
            <Icon name="sun" size={23} />
            <h2>You can bring your own heart to God.</h2>
            <p>
              You do not need impressive words, or a large audience. The prayers
              of others can accompany your own prayer life.
            </p>
            <button
              className="text-link"
              onClick={() => onNavigate("prayer-guide")}
            >
              A guide to personal prayer <Icon name="arrow" size={15} />
            </button>
          </div>
          <div className="side-note support-resource-note">
            <Icon name="heart" size={23} />
            <h2>Support when things feel heavy.</h2>
            <p>
              You can ask for prayer and reach out for practical, professional
              support. Help is available for you or someone you care about.
            </p>
            <button className="text-link" onClick={onSupport}>
              Ways to get support <Icon name="arrow" size={15} />
            </button>
          </div>
        </aside>
      </div>
      {safety && (
        <Modal
          key={safety}
          title={
            safety === "options"
              ? "Care and safety"
              : safety === "care"
                ? "Ask for a compassionate check-in"
                : safety === "report"
                  ? "Help keep this space caring"
                  : "Block this account"
          }
          onClose={() => setSafety(null)}
        >
          {safety === "options" ? (
            <>
              <p>
                If someone may need support, ask for a compassionate check-in.
                Reporting harmful conduct and blocking are separate choices.
              </p>
              <div className="care-action-choices">
                <button
                  className="button secondary"
                  onClick={() => setSafety("care")}
                >
                  <Icon name="heart" size={18} /> This person may need help
                </button>
                <button
                  className="text-link"
                  onClick={() => setSafety("report")}
                >
                  Report harmful content
                </button>
                <button
                  className="text-link"
                  onClick={() => setSafety("block")}
                >
                  Block this account
                </button>
              </div>
            </>
          ) : safety === "care" ? (
            <>
              <p>
                This asks a limited care reviewer to look at the text of this
                request and consider a private support note. It does not report
                the requester for misconduct, remove their prayer, block them,
                or restrict their account.
              </p>
              <p className="quiet-copy">
                Only the reported request is included in the care case. An
                anonymous requester stays anonymous in this demo. No team or
                emergency service is alerted outside the prototype.
              </p>
              <p>
                If someone may be in immediate danger, contact local emergency
                or crisis services now. Do not wait for Prayer Box to respond.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  setSafety(null);
                  onSupport();
                }}
              >
                Open crisis and support resources{" "}
                <Icon name="arrow" size={16} />
              </button>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setSafety(null)}
                >
                  Cancel
                </button>
                <button
                  className="button"
                  onClick={() => {
                    onCareConcern();
                    setSafety(null);
                  }}
                >
                  Request compassionate review
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {target === request.authorId && request.anonymous
                  ? "This reports or blocks the account behind this anonymous request without revealing their identity."
                  : "This applies to the real account behind the content, including replies made with an organization byline."}
              </p>
              <p>
                All of this account’s requests and linked material will be
                removed from your affected box or personal view. An ordinary
                church member’s action does not delete the shared inbox for
                everyone.
              </p>
              {safety === "report" && (
                <label className="field">
                  Why are you reporting this?
                  <select
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                  >
                    <option>Scam or request for money</option>
                    <option>Spam or repeated content</option>
                    <option>Hate or harassment</option>
                    <option>Unsafe media or threat</option>
                    <option>Another safety concern</option>
                  </select>
                </label>
              )}
              <p className="quiet-copy">
                A report is a review signal. Restrictions follow evidence and
                review; mass reports do not decide guilt. Blocking cannot
                promise that a person will lose access to a group delivery they
                otherwise belong to.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setSafety(null)}
                >
                  Cancel
                </button>
                <button
                  className="button"
                  onClick={() => {
                    if (safety === "report") onReport(reportReason, target);
                    else onBlock(target);
                    setSafety(null);
                  }}
                >
                  {safety === "report"
                    ? "Report & remove from my view"
                    : "Block & remove from my view"}
                </button>
              </div>
              {safety === "report" && (
                <button
                  className="text-link"
                  onClick={() => setSafety("block")}
                >
                  Block without a report
                </button>
              )}
              {safety === "report" && target === request.authorId && (
                <div className="care-request-action">
                  <strong>Does this person need support?</strong>
                  <p className="quiet-copy">
                    A care concern keeps their request in place and asks for a
                    compassionate check-in.
                  </p>
                  <button
                    className="button secondary compact"
                    onClick={() => setSafety("care")}
                  >
                    This person may need help
                  </button>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
