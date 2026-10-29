import { useEffect, useRef, useState } from "react";
import {
  getAudienceLabel,
  getEffectiveAudience,
  isOwnPrayerBox,
  screenText,
} from "../domain";
import type { Audience, BoxId, PrayerRequest, Viewer } from "../domain";
import { Icon, Modal } from "../ui";
import { buildPlatformAcknowledgment, hasSupportLanguage } from "../care";
import CareResources from "./CareResources";
import { PlatformAcknowledgment } from "./CareFlow";
import { useActionFeedback } from "../action-feedback";
import RecipientPicker from "./RecipientPicker";
import { TagPicker } from "./TagPicker";
import type { PrayerTag } from "../private-tags";
import { recipientNames, recipientActor } from "../recipients";
import type { PrayerGroup } from '../prayer-groups';
import "../request-refinements.css";

type Props = {
  recipient: BoxId;
  viewer: Viewer;
  privacy: Audience;
  automatic: Partial<Record<BoxId, boolean>>;
  automaticMessages?: Partial<Record<BoxId, string>>;
  offerGrace?: boolean;
  friends?: readonly string[];
  mariaVisible?: boolean;
  blockedActors?: readonly string[];
  organizationOwnerId?: string;
  groups?: readonly PrayerGroup[];
  usernames?: Readonly<Record<string, string>>;
  boxCeilings?: Partial<Record<BoxId, Audience>>;
  initial?: PrayerRequest;
  onClose: () => void;
  tagCatalog?: readonly PrayerTag[];
  initialTags?: PrayerTag[];
  onCommit: (rows: PrayerRequest[], tags: PrayerTag[]) => boolean;
  onNavigate: (route: string) => void;
  onSignIn: () => void;
};
type Outcome = {
  recipient: BoxId;
  status: "sent" | "pending" | "changes" | "failed";
  id?: string;
  reason: string;
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
  recipient: initialRecipient,
  viewer,
  privacy,
  automatic,
  automaticMessages,
  offerGrace = true,
  friends = [],
  mariaVisible = true,
  blockedActors = [],
  organizationOwnerId = "owner",
  groups = [],
  usernames,
  boxCeilings,
  initial,
  tagCatalog = [],
  initialTags = [],
  onClose,
  onCommit,
  onNavigate,
  onSignIn,
}: Props) {
  const feedback = useActionFeedback();
  const names = {...recipientNames,grace:groups.find(group => group.id === 'grace')?.name ?? recipientNames.grace};
  const isOwnDestination = (actor: string, box: BoxId) => isOwnPrayerBox(actor, box, organizationOwnerId);
  const [tags, setTags] = useState<PrayerTag[]>(initialTags);
  const [selected, setSelected] = useState<BoxId[]>([initialRecipient]);
  const recipient = selected[0] ?? initialRecipient;
  const [step, setStep] = useState<
    "write" | "support" | "preview" | "checking" | "result"
  >("write");
  const [text, setText] = useState(initial?.text ?? examples[0].text);
  const [topic, setTopic] = useState(initial?.topic ?? examples[0].label);
  const [preferences, setPreferences] = useState<Partial<Record<BoxId, { anonymous: boolean; audience: Audience }>>>({});
  const preference = (target: BoxId) => preferences[target] ?? {
    anonymous: initial?.anonymous ?? (target === "grace"), audience: "private" as Audience,
  };
  const setPreference = (target: BoxId, next: Partial<{ anonymous: boolean; audience: Audience }>) =>
    setPreferences(previous => ({ ...previous, [target]: { ...preference(target), ...next } }));
  const [media, setMedia] = useState<"photo" | "video" | "audio" | undefined>(
    initial?.media?.status === "approved" ? initial.media.kind : undefined,
  );
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<PrayerRequest[]>([]);
  const [supportShownFor, setSupportShownFor] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const submitting = useRef(false);
  const draftField = useRef<HTMLTextAreaElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const ownDestinationHeading = useRef<HTMLHeadingElement>(null);
  const previousViewer = useRef(viewer);
  const previousStep = useRef(step);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const signedInNow =
      previousViewer.current === "guest" && viewer !== "guest";
    previousViewer.current = viewer;
    if (signedInNow && isOwnDestination(viewer, recipient))
      ownDestinationHeading.current?.focus();
  }, [viewer, recipient]);
  useEffect(() => {
    // Replacing a step removes its focused action. Keep keyboard/screen-reader
    // focus in the dialog instead of letting it fall back to the page body.
    // Initial opening and the separate support dialog keep Modal's native focus.
    if (previousStep.current === step) return;
    previousStep.current = step;
    if (step === "write") draftField.current?.focus();
    else stepHeading.current?.focus();
  }, [step]);
  const destinations = selected.filter(target => !isOwnDestination(viewer, target) && !blockedActors.includes(recipientActor(target, organizationOwnerId)));
  const church = destinations.includes("grace");
  const signedIn = viewer !== "guest";

  function submit(retryOnly = false) {
    if (submitting.current) return;
    const targets = retryOnly
      ? outcomes.filter((o) => o.status === "failed").map((o) => o.recipient)
      : destinations;
    if (
      !signedIn ||
      !targets.length ||
      targets.some((target) => isOwnDestination(viewer, target) || blockedActors.includes(recipientActor(target, organizationOwnerId)))
    ) {
      feedback.prepare();
      feedback.respond({
        tone: "error",
        title: "Choose another prayer box.",
        message:
          "Requests go to someone else’s box. Your own box is for receiving prayer requests from others.",
      });
      setStep("write");
      return;
    }
    feedback.prepare();
    submitting.current = true;
    setStep("checking");
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
          authorId: viewer,
          authorName:
            viewer === "maria"
              ? "Maria"
              : viewer === "member"
                ? "Samuel"
                : viewer === "owner"
                  ? "Grace Church owner"
                  : viewer === "operator"
                    ? "Safety reviewer"
                    : viewer === "team" ? "Prayer Box team" : "Elena",
          recipient: target,
          anonymous: preference(target).anonymous,
          audience: getEffectiveAudience(
            preference(target).audience,
            privacy,
            boxCeilings?.[target] ?? (target === "mine" || target === "prayerbox" ? "private" : "public"),
          ),
          authorCeiling: privacy,
          text,
          topic,
          createdAt: "Just now · example",
          postedAt: new Date().toISOString(),
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
                        : target === "mine" ? "elena" : target === "prayerbox" ? "team" : target,
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
      if (!onCommit(records,tags)) {
        submitting.current = false;
        setStep("write");
        feedback.respond({
          tone: "error",
          title: "This request couldn’t be added.",
          message:
            "Check your account and choose someone else’s prayer box. Your draft is still here.",
        });
        return;
      }
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
      submitting.current = false;
      const sent = results.filter(
        (outcome) => outcome.status === "sent",
      ).length;
      const failed = results.filter(
        (outcome) => outcome.status === "failed",
      ).length;
      if (sent === results.length && sent > 0 && !media) {
        feedback.respond({
          tone: "success",
          title: "Your prayer request has been sent!",
          message: retryOnly
            ? "The interrupted demo delivery is now added. Your earlier copy was not sent again. Nothing left this browser."
            : "Demo confirmation only. Nothing left this browser. Thank you for sharing what’s on your heart.",
        });
      } else if (failed === results.length && failed > 0) {
        feedback.respond({
          tone: "error",
          title: "Your demo request was not delivered.",
          message:
            "This simulated interruption kept your draft here. You can try the interrupted destination again.",
        });
      } else {
        feedback.respond({
          tone: "pending",
          title:
            failed > 0
              ? sent > 0
                ? "Some demo deliveries need another try."
                : "Your demo request needs review and a retry."
              : sent > 0 && media
                ? "Your text is added; your attachment is still under review."
                : results.some((outcome) => outcome.status === "changes")
                  ? "A few changes are needed before this request can be shared."
                  : "Your demo request is awaiting review.",
          message:
            failed > 0
              ? sent > 0
                ? "Your successful copy is kept. Only the interrupted destination needs a retry. Nothing left this browser."
                : "One destination was interrupted; the other copy is held for review. No request was delivered."
              : sent > 0 && media
                ? "The fictional attachment is unavailable until its own review passes. No actual media or request was sent."
                : "Please read the review guidance below. This request has not reached its recipient; your draft is still here.",
        });
      }
    }, 650);
  }
  const draftId = useRef(crypto.randomUUID());
  const allSent =
    outcomes.length > 0 && outcomes.every((o) => o.status === "sent");

  function destinationPreview(target: BoxId) {
    const isChurch = target === "grace";
    const chosen = preference(target).audience;
    const effective = getEffectiveAudience(
      chosen,
      privacy,
      boxCeilings?.[target] ?? (target === "mine" || target === "prayerbox" ? "private" : "public"),
    );
    return (
      <div key={target} className="delivery-preview">
        <span className={`recipient-icon ${isChurch ? "sage" : ""}`}>
          <Icon name={isChurch ? "people" : "box"} />
        </span>
        <div>
          <strong>
            {names[target]}
            {isChurch ? " · prayer community" : target === "prayerbox" ? " · prayer team" : " · personal box"}
          </strong>
          <p>
            {preference(target).anonymous
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
              ? "Add to another prayer box"
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
      {(step === "write" || step === "preview") &&
        isOwnDestination(viewer, recipient) && (
          <div className="notice butter">
            <Icon name="box" />
            <div>
              <h3
                className="own-destination-title"
                ref={ownDestinationHeading}
                tabIndex={-1}
              >
                Choose someone else’s prayer box.
              </h3>
              <p>
                Your own box receives requests from others. Your draft is still
                here; choose a different destination to continue.
              </p>
              <div className="modal-actions">
                {(["prayerbox", "maria", "grace", "daniel", "jordan"] as const)
                  .filter((target) => !isOwnDestination(viewer, target) && !blockedActors.includes(recipientActor(target, organizationOwnerId)))
                  .map((target) => (
                    <button
                      className="button secondary compact"
                      key={target}
                      onClick={() => {
                        setSelected([target]);
                        setStep("write");
                      }}
                    >
                      Choose {names[target]}’s box{" "}
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
              </div>
            </div>
          </div>
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
              ref={draftField}
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
          <TagPicker value={tags} catalog={tagCatalog} onChange={setTags} />
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
          <RecipientPicker selected={selected} onChange={setSelected} viewer={viewer} friends={friends} mariaVisible={mariaVisible} blocked={blockedActors} organizationOwnerId={organizationOwnerId} usernames={usernames} groups={groups} />
          {offerGrace && destinations.includes("maria") && !destinations.includes("grace") && !isOwnDestination(viewer, "grace") && (
            <p className="quiet-copy">Maria publicly displays her Grace Church association. Search @gracechurch if you would like to add a separate church delivery. Nothing is added automatically.</p>
          )}
          {destinations.map(target => (
            <div className={`audience-options ${target === "grace" || target === "prayerbox" ? "sage-wash" : ""}`} key={target}>
              <h3>{names[target]} · {target === "grace" ? "church delivery" : target === "prayerbox" ? "prayer-team delivery" : "personal delivery"}</h3>
              <label className="field">Identity for {names[target]}
                <select value={preference(target).anonymous ? "anonymous" : "name"} onChange={event => setPreference(target, { anonymous: event.target.value === "anonymous" })}>
                  <option value="name">Show my name / username</option><option value="anonymous">Post anonymously</option>
                </select>
              </label>
              {target !== "prayerbox" && <label className="field">{target === "grace" ? "Outside the organization" : "Who can see this?"}
                <select value={preference(target).audience} onChange={event => setPreference(target, { audience: event.target.value as Audience })}>
                  <option value="private">{target === "grace" ? "Organization-only" : `Only me and ${names[target]}`}</option>
                  <option value="friends">My Church · accepted friends</option><option value="public">Everyone</option>
                </select>
              </label>}
              {target === "prayerbox" && <p className="group-disclosure"><Icon name="people" size={20} /><span>Only you and the Prayer Box prayer team can read this delivery. It stays separate from your friends’ and churches’ boxes. Anonymous hides your account identity from the team. This is a demo of the intended team inbox; no real team is contacted.</span></p>}
              {target === "grace" && <>
                <p className="group-disclosure"><Icon name="people" size={20} /><span>This request will be visible to <strong>all active members approved by Grace Church</strong>, not just its pastor, prayer leader or assignee. {preference(target).audience === "private" ? "It will not appear publicly." : "The outside audience does not narrow that group."}</span></p>
                <p className="quiet-copy"><strong>Proposed history policy:</strong> Members approved later may also read retained organization requests. Group delivery cannot guarantee confidentiality from someone who belongs to the group.</p>
              </>}
            </div>
          ))}
          {destinations.some(target => preference(target).anonymous) && <p className="notice butter">Anonymous hides your account identity from recipients. Your words, photos, video or voice may still identify you. Review what you share.</p>}
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
          <h3 className="review-title" ref={stepHeading} tabIndex={-1}>
            A separate delivery to each box.
          </h3>
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
              disabled={!signedIn || !destinations.length}
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
          <h3 ref={stepHeading} tabIndex={-1}>
            Trying the review flow…
          </h3>
          <p>Text and media have separate review states.</p>
          <p className="quiet-copy">
            Limited demo rules only. Automated screening and bot protection are
            not connected.
          </p>
        </div>
      )}
      {step === "result" && (
        <>
          <div className={`confirmation ${allSent ? "request-sent-pop" : ""}`}>
            <span className={`confirmation-icon ${allSent ? "success" : ""}`}>
              <Icon name={allSent ? "check" : "info"} size={28} />
            </span>
            <h3 ref={stepHeading} tabIndex={-1}>
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
          {allSent && <div className="request-sent-encouragement">
            <p>Prayer Box is actively praying for you, and we’re glad you took this step of faith in asking for prayer.</p>
            <p>Let the prayers of others accompany your own relationship with God. We encourage you to pray personally and keep pursuing Him through prayer and reading your Bible.</p>
            <p>You’ll find new replies and updates in your in-app notifications.</p>
            <small>Preview of the planned welcome. No real delivery, prayer-team alert or notification was sent.</small>
          </div>}
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
