import { useState } from "react";
import type { PrayerRequest, Viewer } from "../domain";
import { canSeePlatformAcknowledgment } from "../care";
import type { CareConcern, SupportNote } from "../care";
import { Icon, Modal } from "../ui";
import CareResources from "./CareResources";
import "../care-flow.css";

export function PlatformAcknowledgment({
  request,
  viewer,
  testimonyOnly = false,
}: {
  request: PrayerRequest;
  viewer: Viewer;
  testimonyOnly?: boolean;
}) {
  if (!canSeePlatformAcknowledgment(request, viewer, testimonyOnly))
    return null;
  return (
    <article
      className="reply-note platform-acknowledgment"
      aria-label="Private automatic acknowledgment from Prayer Box"
    >
      <div className="reply-heading">
        <span className="platform-ack-mark" aria-hidden="true">
          <Icon name="box" size={17} />
        </span>
        <strong>Prayer Box</strong>
        <span className="chip">Automatic</span>
        <span className="platform-private-label">
          <Icon name="lock" size={13} /> Only you
        </span>
      </div>
      <p>{request.platformAcknowledgment}</p>
      <small>
        First comment · private to you. This is demo wording for a planned
        prayer-team commitment. No team is alerted or added as a recipient; this
        does not mean someone has read or prayed over your request.
      </small>
    </article>
  );
}

export function PrivateSupportNotifications({
  notes,
  onOpen,
  onDismiss,
}: {
  notes: SupportNote[];
  onOpen: () => void;
  onDismiss: (id: string) => void;
}) {
  if (!notes.length) return null;
  return (
    <section
      className="private-support-notifications"
      aria-label="Your private support notes"
    >
      {notes.map((note) => (
        <article className="private-support-notification" key={note.id}>
          <span className="eyebrow">
            <Icon name="lock" size={14} /> Only you
          </span>
          <h3>A little support, if you need it.</h3>
          <p>
            You deserve kindness and support. You can talk to a trained
            counselor or find someone you trust to be with you.
          </p>
          <div className="inline-actions">
            <button className="button compact" onClick={onOpen}>
              Ways to get support <Icon name="arrow" size={16} />
            </button>
            <button className="text-link" onClick={() => onDismiss(note.id)}>
              Dismiss this note
            </button>
          </div>
          <small>
            A private in-app demo note. No email, text message or emergency
            alert was sent.
          </small>
        </article>
      ))}
    </section>
  );
}

export function CareReviewQueue({
  concerns,
  onSend,
  onClose,
}: {
  concerns: CareConcern[];
  onSend: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const concern = concerns.find((item) => item.id === selected);
  return (
    <section
      className="care-review-queue panel"
      aria-labelledby="care-review-title"
    >
      <p className="eyebrow">
        <Icon name="heart" size={16} /> Compassionate review
      </p>
      <h2 id="care-review-title">Care and wellbeing</h2>
      <p className="quiet-copy">
        A concern asks for a compassionate check-in. It does not remove a
        request, block an account, or establish a diagnosis. This queue is not
        monitored for emergencies.
      </p>
      {concerns.length ? (
        concerns.map((item) => (
          <article className="care-concern" key={item.id}>
            <div className="care-concern-heading">
              <h3>{item.title}</h3>
              <span className="chip">
                {item.status === "new"
                  ? "Care concern"
                  : item.status === "support-sent"
                    ? "Support offered in demo"
                    : "Closed"}
              </span>
            </div>
            <p className="quiet-copy">
              {item.anonymous ? "Anonymous requester" : "Requester"} · Reported
              evidence for this case only
            </p>
            <blockquote>{item.evidence}</blockquote>
            <p className="quiet-copy">
              No author profile or general private inbox is opened. Urgent help
              should come from local emergency or crisis services, not a delayed
              Prayer Box response.
            </p>
            {item.status === "new" && (
              <div className="inline-actions">
                <button
                  className="button compact"
                  onClick={() => setSelected(item.id)}
                >
                  Preview private support note
                </button>
                <button className="text-link" onClick={() => onClose(item.id)}>
                  Close without a note
                </button>
              </div>
            )}
          </article>
        ))
      ) : (
        <p className="care-queue-empty">
          No care concerns in this demo session. A viewer or reviewer can raise
          one from an accessible request.
        </p>
      )}
      {concern && concern.status === "new" && (
        <Modal
          title="A private note of support"
          onClose={() => setSelected(null)}
          wide
        >
          <p className="form-intro">
            The requester alone will see a discreet in-app note with ways to
            find support. No prayer text or reporter identity appears in its
            preview.
          </p>
          <div className="care-note-preview">
            <strong>A little support, if you need it.</strong>
            <p>
              You deserve kindness and support. You can talk to a trained
              counselor or find someone you trust to be with you.
            </p>
          </div>
          <details className="care-preview-resources">
            <summary>Preview the support resources they can open</summary>
            <CareResources compact />
          </details>
          <p className="quiet-copy">
            A single demo note is added for this case. This does not contact the
            person, a prayer team, a clinician or emergency services outside the
            prototype.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
            <button
              className="button"
              onClick={() => {
                onSend(concern.id);
                setSelected(null);
              }}
            >
              Add private demo support note
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
