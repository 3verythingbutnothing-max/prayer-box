import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../ui";
import FeedbackBug from "./FeedbackBug";
import "../feedback.css";

type FeedbackType = "bug" | "feature" | "other";
type Picture = { id: string; file: File; url: string };
const types: Record<FeedbackType, string> = {
  bug: "Report a bug",
  feature: "Request a new feature",
  other: "Other",
};
const pictureLimit = 3;
const pictureBytes = 5 * 1024 * 1024;
const messageLimit = 3000;

async function isSupportedPicture(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, i) => bytes[i] === byte,
    );
  if (file.type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (file.type === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

export default function FeedbackPage() {
  const [kind, setKind] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [messageError, setMessageError] = useState("");
  const [pictureError, setPictureError] = useState("");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const choosePictures = useRef<HTMLButtonElement>(null);
  const objectUrls = useRef(new Set<string>());
  const generation = useRef(0);
  const pictureId = useRef(0);
  const moveFocus = useRef(false);
  const returnToPicturePicker = useRef(false);
  const ids = useId();

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      generation.current += 1;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (!moveFocus.current) return;
    (preview ? previewRef.current : messageRef.current)?.focus();
    moveFocus.current = false;
  }, [preview]);

  useEffect(() => {
    if (returnToPicturePicker.current) {
      choosePictures.current?.focus();
      returnToPicturePicker.current = false;
    }
  }, [pictures]);

  function releasePicture(picture: Picture) {
    URL.revokeObjectURL(picture.url);
    objectUrls.current.delete(picture.url);
  }

  async function addPictures(files: File[]) {
    if (!files.length || checking) return;
    const currentGeneration = generation.current;
    setChecking(true);
    setPictureError("");
    const added: Picture[] = [];
    const errors: string[] = [];
    const slots = pictureLimit - pictures.length;
    if (files.length > slots)
      errors.push(
        "You can attach up to 3 pictures. Any extra pictures were not added.",
      );
    for (const file of files.slice(0, slots)) {
      if (!file.size || file.size > pictureBytes) {
        errors.push(
          "A picture wasn’t added. Choose a non-empty picture no larger than 5 MB.",
        );
        continue;
      }
      let url = "";
      try {
        if (!(await isSupportedPicture(file))) throw new Error("unsupported");
        if (currentGeneration !== generation.current) break;
        url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        const image = new Image();
        image.src = url;
        await image.decode();
        if (currentGeneration !== generation.current) {
          URL.revokeObjectURL(url);
          objectUrls.current.delete(url);
          break;
        }
        pictureId.current += 1;
        added.push({ id: `picture-${pictureId.current}`, file, url });
      } catch {
        if (url) {
          URL.revokeObjectURL(url);
          objectUrls.current.delete(url);
        }
        errors.push(
          "A picture couldn’t be opened. Please choose a valid PNG, JPG or WebP.",
        );
      }
    }
    if (currentGeneration !== generation.current) return;
    setPictures((previous) => [...previous, ...added]);
    setPictureError([...new Set(errors)].join(" "));
    setChecking(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking || preview) return;
    if (!message.trim()) {
      setMessageError("Add a few words so we know what you’d like to share.");
      messageRef.current?.focus();
      return;
    }
    setMessageError("");
    moveFocus.current = true;
    setPreview(true);
  }

  function edit() {
    moveFocus.current = true;
    setPreview(false);
  }

  function startAnother() {
    pictures.forEach(releasePicture);
    setPictures([]);
    setMessage("");
    setKind("bug");
    setMessageError("");
    setPictureError("");
    edit();
  }

  return (
    <div className="feedback-page">
      <div className="feedback-layout">
        <aside className="feedback-welcome">
          <p className="eyebrow">A little care for our little space</p>
          <h1>
            A little bug?
            <br />
            Let us know.
          </h1>
          <p className="feedback-intro">
            Spotted something that feels off, or have an idea? Help make Prayer
            Box a little better.
          </p>
          <div className="feedback-bug-card panel">
            <FeedbackBug className="feedback-main-bug" />
            <p>
              Little fixes.
              <br />
              <strong>Thoughtful ideas.</strong>
            </p>
            <svg
              className="feedback-bug-trail"
              viewBox="0 0 200 80"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 54c29 25 63 15 64-5 1-17-24-20-26-2-3 29 67 34 89 3 14-20 34-39 62-35"
                fill="none"
                stroke="#B4C9DA"
                strokeWidth="1.5"
                strokeDasharray="3 6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="feedback-tip">
            <Icon name="heart" size={17} /> A little detail goes a long way. For
            a bug, tell us what you expected and what happened instead.
          </p>
        </aside>

        <section
          className="feedback-form-card panel"
          aria-labelledby={`${ids}-title`}
        >
          <FeedbackBug className="feedback-tiny-bug" />
          {preview ? (
            <div className="feedback-preview">
              <span className="feedback-success-mark" aria-hidden="true">
                <Icon name="check" size={24} />
              </span>
              <p className="feedback-eyebrow">Fictional demo</p>
              <h2 ref={previewRef} tabIndex={-1} id={`${ids}-title`}>
                Your feedback preview is ready.
              </h2>
              <p>Thanks for helping care for this little space.</p>
              <p className="feedback-demo-note">
                <Icon name="info" size={17} />
                <span>
                  <strong>Nothing was sent or saved.</strong> This is a
                  temporary preview in your browser.
                </span>
              </p>
              <dl className="feedback-summary">
                <dt>Type</dt>
                <dd>{types[kind]}</dd>
                <dt>Your message</dt>
                <dd className="feedback-message-preview">{message.trim()}</dd>
                <dt>Pictures</dt>
                <dd>
                  {pictures.length
                    ? `${pictures.length} ${pictures.length === 1 ? "picture" : "pictures"} attached to this preview`
                    : "No pictures attached"}
                </dd>
              </dl>
              {pictures.length > 0 && (
                <div className="feedback-preview-pictures">
                  {pictures.map((picture, index) => (
                    <img
                      key={picture.id}
                      src={picture.url}
                      alt={`Selected picture ${index + 1}: ${picture.file.name}`}
                    />
                  ))}
                </div>
              )}
              <div className="feedback-preview-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={edit}
                >
                  <Icon name="edit" size={17} /> Edit feedback
                </button>
                <button type="button" className="button" onClick={startAnother}>
                  Start another <Icon name="arrow" size={17} />
                </button>
              </div>
            </div>
          ) : (
            <form noValidate onSubmit={submit}>
              <p className="feedback-eyebrow">We’re all ears</p>
              <h2 id={`${ids}-title`}>Share a little feedback.</h2>
              <p className="feedback-form-intro">
                A bug, a bright idea, or something else on your mind.
              </p>
              <p className="feedback-demo-note" id={`${ids}-demo`}>
                <Icon name="info" size={17} />
                <span>
                  Fictional demo · Nothing is sent or saved. Use invented text
                  and non-sensitive sample pictures.
                </span>
              </p>

              <label className="field" htmlFor={`${ids}-kind`}>
                What would you like to share?
              </label>
              <select
                id={`${ids}-kind`}
                className="feedback-select"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as FeedbackType)
                }
              >
                {Object.entries(types).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <label
                className="field feedback-message-label"
                htmlFor={`${ids}-message`}
              >
                Tell us about it{" "}
                <span className="feedback-required">Required</span>
              </label>
              <textarea
                id={`${ids}-message`}
                ref={messageRef}
                className="feedback-message"
                value={message}
                required
                maxLength={messageLimit}
                rows={6}
                aria-invalid={!!messageError}
                aria-describedby={`${ids}-demo ${ids}-message-help${messageError ? ` ${ids}-message-error` : ""}`}
                placeholder={
                  kind === "bug"
                    ? "What happened, and what were you hoping would happen?"
                    : kind === "feature"
                      ? "What would make this little space more helpful?"
                      : "What would you like us to know?"
                }
                onChange={(event) => {
                  setMessage(event.target.value.slice(0, messageLimit));
                  if (messageError) setMessageError("");
                }}
              />
              <div className="feedback-message-help">
                <span id={`${ids}-message-help`}>
                  Please leave out names, contact details and private prayer
                  content.
                </span>
                <span>{message.length.toLocaleString()} / 3,000</span>
              </div>
              {messageError && (
                <p
                  className="feedback-error"
                  id={`${ids}-message-error`}
                  role="alert"
                >
                  {messageError}
                </p>
              )}

              <div className="feedback-picture-area" aria-busy={checking}>
                <div className="feedback-picture-heading">
                  <h3>
                    Add pictures <span>Optional</span>
                  </h3>
                  <span className="feedback-picture-count">
                    {pictures.length} / 3
                  </span>
                </div>
                <p id={`${ids}-picture-help`}>
                  PNG, JPG or WebP · Up to 3 pictures · 5 MB each. Crop out
                  anything private.
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  aria-label="Choose feedback pictures"
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    void addPictures(files);
                  }}
                />
                <button
                  ref={choosePictures}
                  type="button"
                  className="button secondary feedback-add-pictures"
                  disabled={checking || pictures.length >= pictureLimit}
                  aria-describedby={`${ids}-picture-help${pictureError ? ` ${ids}-picture-error` : ""}`}
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="photo" size={20} />
                  {checking ? "Checking pictures…" : "Choose pictures"}
                </button>
                {pictures.length > 0 && (
                  <ul className="feedback-pictures">
                    {pictures.map((picture, index) => (
                      <li key={picture.id}>
                        <img
                          src={picture.url}
                          alt={`Selected picture ${index + 1}`}
                        />
                        <span
                          className="feedback-picture-name"
                          title={picture.file.name}
                        >
                          {picture.file.name}
                        </span>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove picture ${index + 1}`}
                          disabled={checking}
                          onClick={() => {
                            releasePicture(picture);
                            returnToPicturePicker.current = true;
                            setPictures((previous) =>
                              previous.filter((p) => p.id !== picture.id),
                            );
                            setPictureError("");
                          }}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {pictureError && (
                  <p
                    className="feedback-error"
                    id={`${ids}-picture-error`}
                    role="alert"
                  >
                    {pictureError}
                  </p>
                )}
                <span className="sr-only" role="status">
                  {checking
                    ? "Checking selected pictures."
                    : `${pictures.length} ${pictures.length === 1 ? "picture" : "pictures"} selected.`}
                </span>
              </div>

              <button
                type="submit"
                className="button feedback-submit"
                disabled={checking}
              >
                <span>Submit</span>
                <Icon name="arrow" size={20} />
              </button>
              <p className="feedback-submit-note">
                <Icon name="lock" size={14} /> Browser preview only · No report
                is delivered.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
