import { useEffect, useState } from "react";
import { authorLabel, getAudienceLabel, screenText } from "../domain";
import type { Audience, PrayerRequest, Viewer } from "../domain";
import { Icon, Modal } from "../ui";

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
  onReuse: () => void;
  onNotice: (message: string) => void;
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
  testimonyOnly,
  blockedActors,
  onRemindersChange,
  onUpdate,
  onNavigate,
  onReport,
  onBlock,
  onReuse,
  onNotice,
}: Props) {
  const [safety, setSafety] = useState<"report" | "block" | null>(null);
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
  useEffect(() => {
    if (recording !== "recording") return;
    const timer = setInterval(
      () => setRecordingSeconds((seconds) => Math.min(seconds + 1, 120)),
      1000,
    );
    return () => clearInterval(timer);
  }, [recording]);
  const author = request.authorId === viewer;
  const organization = request.recipient === "grace";
  const held = request.moderation !== "approved";
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
          testimonyId: testimonyOnly ? row.testimony?.id : undefined,
          actorId: viewer,
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
    onNotice("Example encouragement added to this thread.");
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
          <article className="prayer-sheet panel">
            <div className="detail-topline">
              <span className="eyebrow">
                {testimonyOnly
                  ? request.testimony?.kind === "update"
                    ? "A linked update"
                    : "A linked testimony"
                  : "A prayer request"}
              </span>
              {!author && (
                <button
                  className="icon-button"
                  aria-label="Report or block this requester"
                  onClick={() => {
                    setTarget(request.authorId);
                    setSafety("report");
                  }}
                >
                  <Icon name="more" />
                </button>
              )}
            </div>
            <h1 className="page-title">{request.topic}</h1>
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
              <span>{request.createdAt}</span>
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
            {testimonyOnly && request.testimony ? (
              <>
                <p className="prayer-text">{request.testimony.text}</p>
                <button
                  className="text-link"
                  onClick={() => onNavigate(`request/${request.id}`)}
                >
                  <Icon name="link" size={17} /> Read the original request
                </button>
              </>
            ) : (
              <p className="prayer-text">{request.text}</p>
            )}
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
            {!held && !testimonyOnly && request.media && (
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
            {!testimonyOnly && request.testimony && (
              <button
                className="testimony-link"
                onClick={() => onNavigate(`testimony/${request.id}`)}
              >
                <span className="testimony-mark">
                  <Icon name="sun" size={20} />
                </span>
                <span>
                  <strong>
                    {request.testimony.kind === "testimony"
                      ? "A little testimony"
                      : "The story is still unfolding"}
                  </strong>
                  <small>
                    Read the author’s linked {request.testimony.kind}
                  </small>
                </span>
                <Icon name="arrow" size={18} />
              </button>
            )}
            {author && (
              <p className="private-thread-note">
                <Icon name="lock" size={16} /> This delivery has its own
                conversation. Other destinations and replies are not shown to
                this recipient.
              </p>
            )}
          </article>
          {!held && (
            <>
              {!testimonyOnly &&
                isFriend &&
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
                className="conversation panel"
                aria-labelledby="conversation-heading"
              >
                <div className="section-heading">
                  <h2 id="conversation-heading">A little encouragement</h2>
                  <Icon name="heart" size={20} />
                </div>
                <p className="quiet-copy">
                  Prayers and kind words stay in this conversation. A reply is
                  never a promise of an outcome.
                </p>
                <div className="replies">
                  {request.replies
                    .filter((r) =>
                      testimonyOnly
                        ? !!request.testimony &&
                          r.testimonyId === request.testimony.id
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
                            <span className="chip">
                              Automatic acknowledgment
                            </span>
                          ) : r.official ? (
                            <span className="chip">Organization reply</span>
                          ) : null}
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
        </aside>
      </div>
      {safety && (
        <Modal
          title={
            safety === "report"
              ? "Help keep this space caring"
              : "Block this account"
          }
          onClose={() => setSafety(null)}
        >
          <p>
            {target === request.authorId && request.anonymous
              ? "This reports or blocks the account behind this anonymous request without revealing their identity."
              : "This applies to the real account behind the content, including replies made with an organization byline."}
          </p>
          <p>
            All of this account’s requests and linked material will be removed
            from your affected box or personal view. An ordinary church member’s
            action does not delete the shared inbox for everyone.
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
            review; mass reports do not decide guilt. Blocking cannot promise
            that a person will lose access to a group delivery they otherwise
            belong to.
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
            <button className="text-link" onClick={() => setSafety("block")}>
              Block without a report
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}
