import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { authorLabel, getAudienceLabel, screenText } from "../domain";
import type { Audience, PrayerRequest, Reply, Viewer } from "../domain";
import { Icon, Modal } from "../ui";
import { PlatformAcknowledgment } from "./CareFlow";
import { formatStoryDate, getStoryPosts, storyRevision } from "../story";
import { useActionFeedback } from "../action-feedback";
import { scopedStoryReplies } from "../story-replies";
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
  focusedPostId?: string;
  blockedActors: string[];
  onRemindersChange: (enabled: boolean) => void;
  onUpdate: (update: (row: PrayerRequest) => PrayerRequest) => void;
  onNavigate: (route: string) => void;
  onReport: (reason: string, actorId: string, replyId?: string, postId?: string) => void;
  onBlock: (actorId: string) => void;
  onCareConcern: (postId?: string) => void;
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
  focusedPostId,
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
  const feedback = useActionFeedback();
  const [safety, setSafety] = useState<
    "options" | "report" | "block" | "care" | null
  >(null);
  const [reportReason, setReportReason] = useState("Scam or request for money");
  const [target, setTarget] = useState(request.authorId);
  const [targetReplyId, setTargetReplyId] = useState<string | undefined>();
  const [targetPostId, setTargetPostId] = useState<string | undefined>();
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
  const [replyPostId, setReplyPostId] = useState(() =>
    focusedPostId === "original" ||
    getStoryPosts(request).some((post) => post.id === focusedPostId)
      ? focusedPostId!
      : (getStoryPosts(request).at(-1)?.id ?? "original"),
  );
  const [showPrayers, setShowPrayers] = useState(false);
  const [parentReplyId, setParentReplyId] = useState<string | null>(null);
  const replyField = useRef<HTMLTextAreaElement>(null);
  const appealStatus = useRef<HTMLElement>(null);
  const appealFocusFor = useRef<string | null>(null);
  useEffect(() => {
    // The successful appeal removes its own button. Focus the updated status,
    // and only for the author's action on this delivery, rather than on load.
    if (appealFocusFor.current !== request.id) {
      appealFocusFor.current = null;
      return;
    }
    if (request.moderation === "appeal") {
      appealFocusFor.current = null;
      appealStatus.current?.focus();
    }
  }, [request.id, request.moderation]);
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
  const targetPost = posts.find((post) => post.id === targetPostId);
  const selectedScope = selectedPost?.id ?? "original";
  const originalDate = request.postedAt ?? request.createdAt;
  const selectedLabel = selectedPost
    ? `${selectedPost.kind === "testimony" ? "Testimony" : "Update"} · ${formatStoryDate(selectedPost.createdAt)}`
    : `Original request · ${formatStoryDate(originalDate)}`;
  useEffect(() => {
    const currentPosts =
      request.moderation === "approved" ? getStoryPosts(request) : [];
    setReplyPostId(
      focusedPostId === "original" ||
      currentPosts.some((post) => post.id === focusedPostId)
        ? focusedPostId!
        : (currentPosts.at(-1)?.id ?? "original"),
    );
    setShowPrayers(false);
    setParentReplyId(null);
    setFriendDismissed(false);
    setTarget(request.authorId);
    setTargetReplyId(undefined);
    setTargetPostId(undefined);
    setReplyReview("");
    setRecording("idle");
    setPreviewPlaying(false);
  }, [request.id, request.authorId, focusedPostId, request.moderation]);
  useEffect(() => {
    if (!focusedPostId || held) return;
    const validPost =
      focusedPostId === "original" ||
      getStoryPosts(request).some((post) => post.id === focusedPostId);
    if (!validPost) return;
    const section = document.getElementById(
      focusedPostId === "original"
        ? "story-original"
        : `story-post-${encodeURIComponent(focusedPostId)}`,
    );
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [request.id, focusedPostId, held]);
  useEffect(() => {
    if (parentReplyId && replyKind === "text") replyField.current?.focus();
  }, [parentReplyId, replyKind]);
  const memberName =
    viewer === "owner"
      ? "Church owner"
      : viewer === "member"
        ? "Samuel"
        : viewer === "maria"
          ? "Maria"
          : viewer === "operator"
            ? "Safety reviewer"
            : viewer === "team"
              ? "Prayer Box team"
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
    if (scope) {
      setReplyPostId(scope);
      setParentReplyId(null);
      setReplyReview("");
    }
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

  const scopedReplies = scopedStoryReplies(
    request.replies,
    selectedPost?.id,
    blockedActors,
    author ||
      (request.recipient === "mine" && viewer === "elena") ||
      (request.recipient === "maria" && viewer === "maria") ||
      (request.recipient === "prayerbox" && viewer === "team") ||
      (organization && groupMember),
  );
  const parentReply = scopedReplies.find(
    (row) => row.id === parentReplyId && !row.automatic,
  );
  const conversationRoots = scopedReplies.filter((row) => !row.parentReplyId);

  function showConversation(scope: string) {
    setReplyPostId(scope);
    setParentReplyId(null);
    setReplyReview("");
    setShowPrayers(true);
  }

  function beginResponse(scope: string, parentId: string | null = null) {
    setShowPrayers(false);
    setReplyPostId(scope);
    setParentReplyId(parentId);
    setReplyKind("text");
    setReplyReview("");
    // Wait for the feed dialog to close before moving focus to the form.
    requestAnimationFrame(() => {
      jumpToSection("story-encouragement");
      replyField.current?.focus({ preventScroll: true });
    });
  }

  function openPostSafety(postId?: string) {
    setTarget(request.authorId);
    setTargetReplyId(undefined);
    setTargetPostId(postId);
    setSafety("options");
  }

  function renderCardHeading(date: string, postId?: string) {
    return (
      <div className="story-card-heading">
        <div className="request-byline story-card-author">
          <span className={`avatar avatar-small ${request.anonymous ? "anonymous" : ""}`}>
            {request.anonymous ? <Icon name="heart" size={16} /> : authorLabel(request).slice(0, 1)}
          </span>
          <span>{authorLabel(request)}</span>
        </div>
        <div className="story-card-utilities">
          <a
            className="story-date-link"
            href={storyHref}
            onClick={(event) => {
              event.preventDefault();
              jumpToSection(postId ? postAnchor(postId) : "story-original", postId ?? "original");
            }}
            aria-label={`${postId ? "Story post" : "Original request"} from ${formatStoryDate(date)}`}
          >
            <time dateTime={machineDate(date)}>{formatStoryDate(date)}</time>
          </a>
          <button
            className="icon-button"
            aria-label={`${postId ? "Update or testimony" : "Original request"} ${author ? "options" : "safety and care options"}`}
            onClick={() => openPostSafety(postId)}
          >
            <Icon name="more" />
          </button>
        </div>
      </div>
    );
  }

  function agreeWithReply(row: Reply) {
    feedback.prepare();
    if (viewer === "guest" || postingRestricted || held || row.automatic) return;
    const alreadyAgreed = row.agreedBy?.includes(viewer) ?? false;
    onUpdate((current) => ({
      ...current,
      replies: current.replies.map((item) =>
        item.id === row.id && item.testimonyId === selectedPost?.id
          ? {
              ...item,
              agreedBy: alreadyAgreed
                ? item.agreedBy?.filter((actor) => actor !== viewer)
                : [...new Set([...(item.agreedBy ?? []), viewer])],
            }
          : item,
      ),
    }));
    feedback.respond({
      tone: "success",
      title: alreadyAgreed
        ? "Your agreement was removed."
        : "Amen. Your agreement is saved.",
      message:
        "Only your own selection is shown, with no public count.",
    });
  }

  function renderReply(row: Reply, nested = false) {
    return (
      <article
        className={`reply-note ${row.automatic ? "automatic" : ""} ${nested ? "story-nested-reply" : ""}`}
        key={row.id}
      >
        <div className="reply-heading">
          <strong>{row.name}</strong>
          {row.automatic ? (
            <span className="chip">Automatic box welcome</span>
          ) : row.official ? (
            <span className="chip">Organization reply</span>
          ) : null}
          {!row.automatic && (
            <span className="story-reply-date">
              {row.postedAt ? (
                <time dateTime={machineDate(row.postedAt)}>
                  {formatStoryDate(row.postedAt)}
                </time>
              ) : (
                "Earlier encouragement"
              )}
            </span>
          )}
          {!row.automatic && row.actorId && row.actorId !== viewer && (
            <button
              className="icon-button"
              aria-label={`Report or block reply from ${row.name}`}
              onClick={() => {
                setTarget(row.actorId!);
                setTargetReplyId(row.id);
                setTargetPostId(row.testimonyId);
                setSafety("report");
              }}
            >
              <Icon name="more" size={18} />
            </button>
          )}
        </div>
        <p>{row.text}</p>
        {row.automatic ? (
          <small>
            An automatic welcome. This does not mean someone has read, prayed,
            or taken this request.
          </small>
        ) : viewer !== "guest" ? (
          <div className="story-reply-actions">
            <button
              className="text-link"
              aria-pressed={row.agreedBy?.includes(viewer) ?? false}
              disabled={postingRestricted}
              onClick={() => agreeWithReply(row)}
            >
              <Icon name="heart" size={17} />
              {row.agreedBy?.includes(viewer) ? "Amen · agreed" : "Amen / I agree"}
            </button>
            <button
              className="text-link"
              disabled={postingRestricted}
              onClick={() => {
                beginResponse(selectedScope, row.id);
              }}
            >
              Reply to {row.name}<Icon name="arrow" size={16} />
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  function renderReplyThread(row: Reply, nested = false): ReactNode {
    return (
      <div className="story-reply-thread" key={row.id}>
        {renderReply(row, nested)}
        {scopedReplies
          .filter((child) => child.parentReplyId === row.id)
          .map((child) => renderReplyThread(child, true))}
      </div>
    );
  }

  function sendReply() {
    feedback.prepare();
    if (viewer === "guest" || held || !reply.trim()) return;
    if (parentReplyId && !parentReply) {
      setParentReplyId(null);
      setReplyReview(
        "That encouragement is no longer available in this conversation. Your draft is still here; choose another reply or respond to the story post.",
      );
      feedback.respond({
        tone: "pending",
        title: "Please choose where your reply belongs.",
        message:
          "The previous reply is no longer available. Your draft has not been sent.",
      });
      return;
    }
    if (postingRestricted) {
      setReplyReview(
        "Posting is restricted after a simulated validated review. A human must review the account appeal before posting resumes.",
      );
      feedback.respond({
        tone: "pending",
        title: "A person needs to review this account first.",
        message:
          "Your draft is still here. This example has not been published.",
      });
      return;
    }
    const result = screenText(reply);
    if (result.state !== "approved" || replyKind === "audio") {
      setReplyReview(
        replyKind === "audio"
          ? "The simulated audio prayer is held for transcription and media review. No recording or transcript is visible to recipients yet. You can return to its draft or try text."
          : `${result.reason} Your reply is not published. You can revise it or request human review.`,
      );
      feedback.respond({
        tone: "pending",
        title:
          replyKind === "audio"
            ? "Your audio example is awaiting review."
            : "Your encouragement needs a little review.",
        message:
          "This example remains unpublished. Please read the guidance below; your draft is still here.",
      });
      return;
    }
    onUpdate((row) => ({
      ...row,
      replies: [
        ...row.replies,
        {
          id: `reply-${crypto.randomUUID()}`,
          testimonyId: selectedPost?.id,
          parentReplyId: parentReply?.id,
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
    setShowPrayers(true);
    setParentReplyId(null);
    setReplyReview(
      "Your encouragement was added to this part of the story.",
    );
    onNotice(
      author
        ? "Your encouragement was added to this story."
        : "Your prayer or encouragement was added. This request is now in My Prayers until the author shares an update or testimony.",
    );
    feedback.respond({
      tone: "success",
      title: author
        ? "Your encouragement has been added."
        : "Thank you for praying for someone in need and serving God’s Kingdom.",
      message:
        "Your prayer or encouragement stays in this prayer box and this part of the story.",
    });
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
            {renderCardHeading(originalDate)}
            <span className="eyebrow story-card-kind">Original prayer request</span>
            <h1 className="page-title" id="original-prayer-title">
              {request.topic}
            </h1>
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
                  <strong ref={appealStatus} tabIndex={-1}>
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
                          feedback.prepare();
                          appealFocusFor.current = request.id;
                          onUpdate((row) => ({
                            ...row,
                            moderation: "appeal",
                            reviewReason: `${row.reviewReason ?? screenText(row.text).reason} The author requested a manual review of the decision and its context.`,
                          }));
                          onNotice(
                            "Simulated appeal added to the separate human-review queue.",
                          );
                          feedback.respond({
                            tone: "pending",
                            title: "Your demo appeal is awaiting a person.",
                            message:
                              "The example remains unpublished. A human review has not happened yet.",
                          });
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
            {!held && (
              <button
                className="button secondary story-read-prayers"
                onClick={() => showConversation("original")}
              >
                <Icon name="people" size={18} /> Read prayers &amp; encouragement
              </button>
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
                  {renderCardHeading(post.createdAt, post.id)}
                  <span className="eyebrow story-card-kind">
                    <Icon name={post.kind === "testimony" ? "sun" : "note"} size={16} />
                    {post.kind === "testimony" ? "Testimony" : "Update"}
                  </span>
                  <h2 id={`${postAnchor(post.id)}-title`}>{request.topic}</h2>
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
                      onClick={() => beginResponse(post.id)}
                    >
                      Respond to this {post.kind}
                      <Icon name="heart" size={17} />
                    </button>
                    <button
                      className="text-link story-read-prayers"
                      onClick={() => showConversation(post.id)}
                    >
                      <Icon name="people" size={18} /> Read prayers &amp; encouragement
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!held && (
            <>
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
                      setParentReplyId(null);
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
                {viewer === "guest" ? (
                  <div className="guest-reply">
                    <Icon name="lock" />
                    <p>
                      Sign in to leave encouragement. Your visit
                      does not make a church membership.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => onNavigate("signup")}
                    >
                      Create an account
                    </button>
                  </div>
                ) : (
                  <div className="reply-composer">
                    {parentReply && (
                      <div className="story-replying-to" role="status">
                        <span>
                          Replying to {parentReply.name} on this {selectedPost?.kind ?? "request"}
                        </span>
                        <button className="text-link" onClick={() => setParentReplyId(null)}>
                          Cancel reply
                        </button>
                      </div>
                    )}
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
                        <span className="sr-only">Your encouragement</span>
                        <textarea
                          ref={replyField}
                          rows={4}
                          value={reply}
                          maxLength={5000}
                          onChange={(event) => setReply(event.target.value)}
                        />
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
                        ? "Submit for review"
                        : parentReply ? "Send reply" : "Leave encouragement"}{" "}
                      <Icon name="arrow" size={17} />
                    </button>
                    {replyReview && (
                      <div className="notice butter" role="status">
                        <Icon name="info" />
                        <div>
                          <p>{replyReview}</p>
                          {!replyReview.startsWith("Your encouragement was added") && (
                            <button
                              className="text-link"
                              onClick={() => {
                                feedback.prepare();
                                setReplyReview(
                                  "Your simulated appeal is awaiting manual review. This example remains unpublished. No automated restriction has been removed. Return to the draft to revise it.",
                                );
                                feedback.respond({
                                  tone: "pending",
                                  title:
                                    "Your demo appeal is awaiting a person.",
                                  message:
                                    "This example remains unpublished. You can still return to your draft.",
                                });
                              }}
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
                        feedback.prepare();
                        onRemindersChange(false);
                        onNotice(
                          "Prayer-together reminders are off for this demo session.",
                        );
                        feedback.respond({
                          tone: "success",
                          title: "Your reminder preference is updated.",
                          message:
                            "Prayer-together reminders are off for this demo session.",
                        });
                      }}
                    >
                      Turn these reminders off
                    </button>
                  </aside>
                )}
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
                : request.recipient === "prayerbox"
                  ? "This delivery goes to the Prayer Box team. It stays separate from any copies you send to individuals or your church."
                  : `This request belongs to ${request.recipient === "mine" ? "Elena" : request.recipient === "daniel" ? "Daniel" : request.recipient === "jordan" ? "Jordan" : "Maria"}’s personal box. A church association does not give anyone access to it.`}
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
              Let the prayers of others accompany your own relationship with God.
              We encourage you to pursue a personal relationship with Him through
              prayer and reading your Bible to hear God’s word.
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
      {showPrayers && !held && (
        <Modal title="Prayers & encouragement" onClose={() => setShowPrayers(false)}>
          <div className="story-prayers-feed">
            <span className="eyebrow">{selectedLabel}</span>
            <h3>{request.topic}</h3>
            <p className="story-feed-post">{selectedPost?.text ?? request.text}</p>
            {selectedPost && (
              <details className="story-feed-original">
                <summary>Original prayer request · {formatStoryDate(originalDate)}</summary>
                <p>{request.text}</p>
              </details>
            )}
            <p className="quiet-copy">
              These prayers and replies belong to this {selectedPost?.kind ?? "original request"}
              {" "}in this prayer box. Replies to other parts of the story stay with their own card.
            </p>
                  <div className="replies" id="story-prayer-replies">
                    {selectedScope === "original" && (
                      <PlatformAcknowledgment request={request} viewer={viewer} />
                    )}
                    {conversationRoots.length === 0 && (
                      <p className="story-empty-prayers">
                        There is room for a first prayer or word of encouragement
                        for this {selectedPost?.kind ?? "request"}.
                      </p>
                    )}
                    {conversationRoots.map((row) => renderReplyThread(row))}
                    <p className="quiet-copy story-private-agreement">
                      Your Amen selection has no public count. Replies stay in
                      this delivery and this part of the story.
                    </p>
                  </div>

            <div className="story-feed-actions">
              <button className="button secondary" onClick={() => setShowPrayers(false)}>Back to the story</button>
              <button className="button" onClick={() => {
                if (viewer === "guest") {
                  setShowPrayers(false);
                  onNavigate("signup");
                } else beginResponse(selectedScope);
              }}>
                {viewer === "guest" ? "Sign in to encourage" : "Leave encouragement"}
                <Icon name="heart" size={18} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {safety && (
        <Modal
          key={safety}
          title={
            safety === "options"
              ? author ? "Your story post" : "Care and safety"
              : safety === "care"
                ? "Ask for a compassionate check-in"
                : safety === "report"
                  ? "Help keep this space caring"
                  : "Block this account"
          }
          onClose={() => setSafety(null)}
        >
          <p className="story-safety-context">
            <strong>{targetReplyId ? "Encouragement" : targetPost ? targetPost.kind === "testimony" ? "Testimony" : "Update" : "Original prayer request"}</strong>
            {" · "}{formatStoryDate(targetPost?.createdAt ?? originalDate)}
            <span>{request.topic}</span>
          </p>
          {safety === "options" && author ? (
            <>
              <p>This is your {targetPostId ? "update or testimony" : "original prayer request"}. You can manage the request and its deliveries.</p>
              <div className="care-action-choices">
                <button className="button secondary" onClick={() => { setSafety(null); onReuse(); }}>
                  Add to another prayer box
                </button>
                {onDelete && (
                  <button className="text-link story-delete" onClick={() => { setSafety(null); onDelete(); }}>
                    Delete request
                  </button>
                )}
                <button className="text-link" onClick={() => { setSafety(null); onSupport(); }}>
                  Find support resources
                </button>
              </div>
            </>
          ) : safety === "options" ? (
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
                This asks a limited care reviewer to look at this
                {targetPostId ? " update or testimony" : " request"} and consider a private support note. It does not report
                the requester for misconduct, remove their prayer, block them,
                or restrict their account.
              </p>
              <p className="quiet-copy">
                Only this request and the selected post are included in the care
                case. An anonymous requester stays anonymous. No team or
                emergency service is alerted by this preview.
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
                    feedback.prepare();
                    onCareConcern(targetPostId);
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
                    feedback.prepare();
                    if (safety === "report") onReport(reportReason, target, targetReplyId, targetPostId);
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
