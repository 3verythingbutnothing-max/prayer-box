import { useEffect, useRef, useState } from "react";
import { getAudienceLabel, getEffectiveAudience, screenText } from "../domain";
import type { Audience, BoxId, PrayerRequest, Viewer } from "../domain";
import { Icon, Modal } from "../ui";
import { buildPlatformAcknowledgment, hasSupportLanguage } from "../care";
import CareResources from "./CareResources";
import { PlatformAcknowledgment } from "./CareFlow";

type Props = {
  recipient: BoxId;
  viewer: Viewer;
  privacy: Audience;
  automatic: Partial<Record<BoxId, boolean>>;
  automaticMessages?: Partial<Record<BoxId, string>>;
  offerGrace?: boolean;
  boxCeilings?: Partial<Record<BoxId, Audience>>;
  initial?: PrayerRequest;
  onClose: () => void;
  onCommit: (rows: PrayerRequest[]) => void;
  onNavigate: (route: string) => void;
  onSignIn: () => void;
};
type Outcome = {
  recipient: BoxId;
  status: "sent" | "pending" | "changes" | "failed";
  id?: string;
  reason: string;
};
const names: Record<BoxId, string> = {
  maria: "Maria",
  grace: "Grace Church",
  mine: "Elena",
};
const examples = [
  {
    label: "A little wisdom",
    text: "I am beginning a new chapter and finding it hard to make a decision. Please pray for wisdom, patience, and a heart that is willing to follow God’s lead.",
  },
  {
    label: "Financial hardship · welcome",
    text: "I am worried about paying rent while I look for work. Please pray for a suitable opportunity, peace, and wisdom as I ask my local church for practical guidance.",
  },
  {
    label: "Payment request · held",
    text: "Please send me money. My Cash App is $FictionalExample. This is an invented screening example.",
  },
  {
    label: "A sincere question · review example",
    text: "I heard someone say the Trinity is false and I feel confused. Please pray for understanding as I talk with a trusted pastor. This is a fictional context-review example.",
  },
  {
    label: "Support and safety · fictional example",
    text: "This is a fictional example. I have been having suicidal thoughts and need help staying safe. Please pray for support and strength to reach someone I trust.",
  },
];

export default function PrayerComposer({
  recipient,
  viewer,
  privacy,
  automatic,
  automaticMessages,
  offerGrace = true,
  boxCeilings,
  initial,
  onClose,
  onCommit,
  onNavigate,
  onSignIn,
}: Props) {
  const [step, setStep] = useState<
    "write" | "support" | "preview" | "checking" | "result"
  >("write");
  const [text, setText] = useState(initial?.text ?? examples[0].text);
  const [topic, setTopic] = useState(initial?.topic ?? examples[0].label);
  const [personal, setPersonal] = useState(recipient !== "grace");
  const [church, setChurch] = useState(recipient === "grace");
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [churchAnonymous, setChurchAnonymous] = useState(true);
  const [audience, setAudience] = useState<Audience>("private");
  const [churchAudience, setChurchAudience] = useState<Audience>("private");
  const [media, setMedia] = useState<"photo" | "video" | "audio" | undefined>(
    initial?.media?.status === "approved" ? initial.media.kind : undefined,
  );
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<PrayerRequest[]>([]);
  const [supportShownFor, setSupportShownFor] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const personRecipient = recipient === "grace" ? "maria" : recipient;
  const destinations: BoxId[] = [
    ...(personal ? [personRecipient] : []),
    ...(church ? ["grace" as const] : []),
  ];
  const signedIn = viewer !== "guest";

  function submit(retryOnly = false) {
    setStep("checking");
    const targets = retryOnly
      ? outcomes.filter((o) => o.status === "failed").map((o) => o.recipient)
      : destinations;
    timer.current = setTimeout(() => {
      const check = screenText(text);
      const records: PrayerRequest[] = [];
      const results = targets.map((target): Outcome => {
        if (simulateFailure && !retryOnly && target === "grace")
          return {
            recipient: target,
            status: "failed",
            reason:
              "Simulated connection interruption. This destination has no delivery. Your draft is retained.",
          };
        const id = `demo-${crypto.randomUUID()}`;
        const isChurch = target === "grace";
        const record: PrayerRequest = {
          id,
          sourceId: initial?.sourceId ?? `draft-${draftId.current}`,
          authorId: viewer === "guest" ? "elena" : viewer,
          authorName:
            viewer === "maria"
              ? "Maria"
              : viewer === "member"
                ? "Samuel"
                : viewer === "owner"
                  ? "Grace Church owner"
                  : viewer === "operator"
                    ? "Safety reviewer"
                    : "Elena",
          recipient: target,
          anonymous: isChurch ? churchAnonymous : anonymous,
          audience: getEffectiveAudience(
            isChurch ? churchAudience : audience,
            privacy,
            boxCeilings?.[target] ?? (target === "mine" ? "private" : "public"),
          ),
          authorCeiling: privacy,
          text,
          topic,
          createdAt: "Just now · example",
          media: media ? { kind: media, status: "pending" } : undefined,
          platformAcknowledgment:
            check.state === "approved"
              ? buildPlatformAcknowledgment(text, topic)
              : undefined,
          replies:
            check.state === "approved" && automatic[target]
              ? [
                  {
                    id: `receipt-${id}`,
                    actorId:
                      target === "grace"
                        ? "owner"
                        : target === "maria"
                          ? "maria"
                          : "elena",
                    name: names[target],
                    automatic: true,
                    official: isChurch,
                    text:
                      automaticMessages?.[target] ??
                      "Thank you for trusting this prayer box with your request. Your request has reached this box. You are welcome to return with an update.",
                  },
                ]
              : [],
          moderation: check.state,
          workState: "new",
        };
        records.push(record);
        return {
          recipient: target,
          id,
          status: check.state === "approved" ? "sent" : check.state,
          reason: check.reason,
        };
      });
      onCommit(records);
      setAcknowledgments((previous) => [
        ...previous,
        ...records.filter((row) => row.platformAcknowledgment),
      ]);
      setOutcomes((previous) =>
        retryOnly
          ? previous.map(
              (o) => results.find((r) => r.recipient === o.recipient) ?? o,
            )
          : results,
      );
      setStep("result");
    }, 650);
  }
  const draftId = useRef(crypto.randomUUID());
  const allSent =
    outcomes.length > 0 && outcomes.every((o) => o.status === "sent");

  function destinationPreview(target: BoxId) {
    const isChurch = target === "grace";
    const chosen = isChurch ? churchAudience : audience;
    const effective = getEffectiveAudience(
      chosen,
      privacy,
      boxCeilings?.[target] ?? (target === "mine" ? "private" : "public"),
    );
    return (
      <div key={target} className="delivery-preview">
        <span className={`recipient-icon ${isChurch ? "sage" : ""}`}>
          <Icon name={isChurch ? "people" : "box"} />
        </span>
        <div>
          <strong>
            {names[target]}
            {isChurch ? " · prayer community" : " · personal box"}
          </strong>
          <p>
            {(isChurch ? churchAnonymous : anonymous)
              ? "Anonymous · no profile link, flag, or association"
              : "Your display name is shown"}
          </p>
          <p>
            <Icon name={effective === "public" ? "globe" : "lock"} size={14} />{" "}
            {getAudienceLabel(effective, target)}
          </p>
          {effective !== chosen && (
            <p className="effective-notice">
              Account and box limits:{" "}
              {effective === "private"
                ? "hidden from outsiders"
                : "accepted friends only"}
              . This saved delivery stays within this preview. Making a profile
              public later will not broaden it.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Modal
      key={step === "support" ? "support-resources" : "prayer-composer"}
      title={
        step === "support"
          ? "Support is here for you"
          : step === "result"
            ? "Your delivery update"
            : initial
              ? "Send a separate copy"
              : "Leave a prayer request"
      }
      onClose={() => {
        if (step === "support") {
          setSupportShownFor(text);
          setStep("preview");
        } else onClose();
      }}
      wide
    >
      {step !== "support" && (
        <p className="prototype-note">
          <Icon name="info" size={16} /> Fictional walkthrough. No prayer
          request or media leaves this browser.
        </p>
      )}
      {step === "support" && (
        <>
          <CareResources />
          <p className="quiet-copy">
            Some words in this draft may relate to distress. These resources are
            here for you or someone you care about. Asking for support is
            welcome; this does not flag your account for misconduct.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setSupportShownFor(text);
                setStep("write");
              }}
            >
              Back to my draft
            </button>
            <button
              className="button"
              onClick={() => {
                setSupportShownFor(text);
                setStep("preview");
              }}
            >
              Continue reviewing my prayer
            </button>
          </div>
        </>
      )}
      {step === "write" && (
        <>
          <p className="form-intro">
            A few honest words are enough. You’re welcome to ask for prayer
            while your story is still unfolding.
          </p>
          {initial && (
            <div className="notice sage">
              <Icon name="link" />
              <p>
                Only your selected authored text and approved media are reused.
                Conversations, other recipients, and earlier updates stay in
                their original threads.
              </p>
            </div>
          )}
          <label className="field">
            Try a fictional example
            <select
              value={examples.findIndex((e) => e.text === text)}
              onChange={(event) => {
                const example = examples[Number(event.target.value)];
                if (example) {
                  setText(example.text);
                  setTopic(example.label.split(" ·")[0]);
                }
              }}
            >
              <option value={-1} disabled>
                Custom fictional draft
              </option>
              {examples.map((e, i) => (
                <option key={i} value={i}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Your prayer request{" "}
            <span className="field-hint">
              Use invented text only in this prototype.
            </span>
            <textarea
              rows={5}
              maxLength={5000}
              value={text}
              onChange={(event) => {
                const next = event.target.value;
                setText(next);
                setTopic(
                  examples
                    .find((example) => example.text === next)
                    ?.label.split(" ·")[0] ?? "A prayer request",
                );
              }}
            />
          </label>
          <div className="media-tools" aria-label="Fictional media examples">
            {(["photo", "audio", "video"] as const).map((kind) => (
              <button
                className={`button secondary compact ${media === kind ? "is-selected" : ""}`}
                aria-pressed={media === kind}
                onClick={() => setMedia(media === kind ? undefined : kind)}
                key={kind}
              >
                <Icon name={kind} size={17} />
                {kind === "photo"
                  ? "Photo"
                  : kind === "audio"
                    ? "Audio"
                    : "Video"}{" "}
                example
              </button>
            ))}
          </div>
          {media && (
            <div className="notice butter">
              <Icon name={media} />
              <p>
                Fictional {media} selected. Media stays unavailable until its
                own review passes. Approved text can be delivered while media is
                held. No file picker or microphone is connected.
              </p>
            </div>
          )}
          <fieldset className="destination-fieldset">
            <legend>Where this request will go</legend>
            {recipient !== "grace" && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={personal}
                  onChange={(event) => setPersonal(event.target.checked)}
                />
                <span>
                  <strong>{names[personRecipient]}’s personal box</strong>
                  <small>
                    A separate conversation with {names[personRecipient]}.
                  </small>
                </span>
              </label>
            )}
            {recipient === "maria" && offerGrace && (
              <p className="quiet-copy">
                Maria publicly displays her approved Grace Church association.
                You can choose an additional delivery.
              </p>
            )}
            {(recipient === "grace" ||
              (recipient === "maria" && offerGrace)) && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={church}
                  onChange={(event) => setChurch(event.target.checked)}
                />
                <span>
                  <strong>
                    {recipient === "grace"
                      ? "Grace Church prayer community"
                      : "Also send a separate request to Grace Church"}
                  </strong>
                  <small>
                    {recipient === "grace"
                      ? "Address the organization directly."
                      : "Optional. This does not forward Maria’s conversation."}
                  </small>
                </span>
              </label>
            )}
          </fieldset>
          {personal && (
            <div className="audience-options">
              <h3>{names[personRecipient]} · personal delivery</h3>
              <label className="field">
                Identity
                <select
                  value={anonymous ? "anonymous" : "name"}
                  onChange={(event) =>
                    setAnonymous(event.target.value === "anonymous")
                  }
                >
                  <option value="name">Show my name / username</option>
                  <option value="anonymous">Post anonymously</option>
                </select>
              </label>
              <label className="field">
                Who can see this?
                <select
                  value={audience}
                  onChange={(event) =>
                    setAudience(event.target.value as Audience)
                  }
                >
                  <option value="private">
                    Only me and {names[personRecipient]}
                  </option>
                  <option value="friends">My Church · accepted friends</option>
                  <option value="public">Everyone</option>
                </select>
              </label>
            </div>
          )}
          {church && (
            <div className="audience-options sage-wash">
              <h3>Grace Church · separate delivery</h3>
              <label className="field">
                Identity for Grace Church
                <select
                  value={churchAnonymous ? "anonymous" : "name"}
                  onChange={(event) =>
                    setChurchAnonymous(event.target.value === "anonymous")
                  }
                >
                  <option value="anonymous">Post anonymously</option>
                  <option value="name">Show my name / username</option>
                </select>
              </label>
              <label className="field">
                Outside the organization
                <select
                  value={churchAudience}
                  onChange={(event) =>
                    setChurchAudience(event.target.value as Audience)
                  }
                >
                  <option value="private">Organization-only</option>
                  <option value="friends">My Church · accepted friends</option>
                  <option value="public">Everyone</option>
                </select>
              </label>
              <p className="group-disclosure">
                <Icon name="people" size={18} />
                <span>
                  This request will be visible to{" "}
                  <strong>all active members approved by Grace Church</strong>,
                  not just its pastor, prayer leader, or assignee.{" "}
                  {churchAudience === "private"
                    ? "It will not appear publicly."
                    : "The outside audience you choose does not narrow that group."}
                </span>
              </p>
              <p className="quiet-copy">
                <strong>Proposed history policy:</strong> Members approved later
                may also read retained organization requests. A group delivery
                cannot guarantee confidentiality from someone who belongs to the
                group.
              </p>
            </div>
          )}
          {(anonymous || (church && churchAnonymous)) && (
            <p className="notice butter">
              Anonymous hides your account identity from recipients. Your words,
              photos, video, or voice may still identify you. Review what you
              share.
            </p>
          )}
          <p className="quiet-copy">
            Prayer requests only. Please remove payment handles and fundraising
            links. For financial support, refer to your local church or a
            fundraising platform. Asking for prayer about financial hardship is
            welcome.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={onClose}>
              Cancel draft
            </button>
            <button
              className="button"
              disabled={!text.trim() || !destinations.length}
              onClick={() =>
                setStep(
                  hasSupportLanguage(text) && supportShownFor !== text
                    ? "support"
                    : "preview",
                )
              }
            >
              Review request <Icon name="arrow" size={18} />
            </button>
          </div>
        </>
      )}
      {step === "preview" && (
        <>
          <p className="eyebrow">A moment to check</p>
          <h3 className="review-title">A separate delivery to each box.</h3>
          <blockquote className="draft-quote">{text}</blockquote>
          <div className="preview-destinations">
            {destinations.map(destinationPreview)}
          </div>
          {church && (
            <p className="quiet-copy">
              <strong>Grace Church:</strong> All active approved members receive
              this delivery. Proposed shared history includes members approved
              later. Choosing Simulate sending confirms this fictional
              group-audience preview.
            </p>
          )}
          <p className="quiet-copy">
            Only you see the complete destination list. No private conversation
            is copied. Each destination can have a different delivery or review
            result.
          </p>
          {church && (
            <label className="check-row demo-choice">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(event) => setSimulateFailure(event.target.checked)}
              />
              <span>
                Try an interrupted Grace Church delivery
                <small>
                  Demonstrates a safe retry without duplicating a successful
                  personal copy.
                </small>
              </span>
            </label>
          )}
          {!signedIn && (
            <div className="notice butter">
              <Icon name="lock" />
              <div>
                <strong>Keep this draft while you try an account.</strong>
                <p>
                  Use Elena’s fictional account to continue. No credentials are
                  collected.
                </p>
                <button className="button secondary compact" onClick={onSignIn}>
                  Use Elena’s demo account
                </button>
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setStep("write")}
            >
              Edit request
            </button>
            <button
              className="button"
              disabled={!signedIn}
              onClick={() => submit()}
            >
              Simulate sending <Icon name="arrow" size={18} />
            </button>
          </div>
        </>
      )}
      {step === "checking" && (
        <div className="checking-state" role="status">
          <span className="status-orbit">
            <Icon name="shield" size={30} />
          </span>
          <h3>Trying the review flow…</h3>
          <p>Text and media have separate review states.</p>
          <p className="quiet-copy">
            Limited demo rules only. Automated screening and bot protection are
            not connected.
          </p>
        </div>
      )}
      {step === "result" && (
        <>
          <div className="confirmation">
            <span className={`confirmation-icon ${allSent ? "success" : ""}`}>
              <Icon name={allSent ? "check" : "info"} size={28} />
            </span>
            <h3>
              {allSent
                ? "Your prayer request has been sent."
                : outcomes.some((o) => o.status === "sent")
                  ? "Here’s how each delivery went."
                  : outcomes.every((o) => o.status === "failed")
                    ? "This request was not delivered."
                    : outcomes.some((o) => o.status === "changes")
                      ? "A few changes are needed."
                      : "Your request has been submitted for review."}
            </h3>
            <p className="simulation-label">
              Simulated result · no actual delivery
            </p>
          </div>
          {acknowledgments[0] && (
            <PlatformAcknowledgment
              request={acknowledgments[0]}
              viewer={viewer}
            />
          )}
          {outcomes.map((outcome) => (
            <div
              className={`result-row result-${outcome.status}`}
              key={outcome.recipient}
            >
              <Icon name={outcome.status === "sent" ? "check" : "info"} />
              <div>
                <strong>
                  {names[outcome.recipient]} ·{" "}
                  {outcome.status === "sent"
                    ? "Text delivered in demo"
                    : outcome.status === "failed"
                      ? "Not delivered"
                      : outcome.status === "changes"
                        ? "Changes needed"
                        : "Review pending"}
                </strong>
                <p>{outcome.reason}</p>
                {media && outcome.status === "sent" && (
                  <p>
                    <strong>{media} review pending.</strong> The attachment is
                    unavailable to recipients.
                  </p>
                )}
                {outcome.id && (
                  <button
                    className="text-link"
                    onClick={() => {
                      onClose();
                      onNavigate(`request/${outcome.id}`);
                    }}
                  >
                    View this{" "}
                    {outcome.status === "sent" ? "request" : "review status"}{" "}
                    <Icon name="arrow" size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {outcomes.some((o) => o.status === "failed") && (
            <button className="button secondary" onClick={() => submit(true)}>
              Retry only the interrupted destination
            </button>
          )}
          {outcomes.some((o) => o.status === "sent") && (
            <p className="devotional-note">
              Remain steadfast in prayer. Keep seeking the Father in the name of
              Jesus Christ, with the help of the Holy Spirit, asking according
              to his will. Trust his wisdom and care, even when the answer
              unfolds differently than you expect.
            </p>
          )}
          <button
            className="text-link guide-link"
            onClick={() => {
              onClose();
              onNavigate("prayer-guide");
            }}
          >
            A guide to personal prayer <Icon name="arrow" size={16} />
          </button>
          <div className="modal-actions">
            <button className="button" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
