import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { createCuePlayer } from "./feedback-cues";
import type {
  CueResult,
  FeedbackPreferences as Preferences,
  FeedbackTone,
} from "./feedback-cues";
import { Icon, PreferenceSwitch } from "./ui";
import "./action-feedback.css";

export type ActionFeedback = {
  tone: FeedbackTone;
  title: string;
  message?: string;
};
type Notice = ActionFeedback & {
  id: number;
  cues?: CueResult;
  animate: boolean;
};
type FeedbackContextValue = {
  prepare: () => void;
  respond: (feedback: ActionFeedback) => void;
  showNotice: (message: string) => void;
  clear: () => void;
  preferences: Preferences;
  setPreference: (name: keyof Preferences, value: boolean) => void;
};
const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useActionFeedback() {
  const value = useContext(FeedbackContext);
  if (!value)
    throw new Error("Submission feedback requires ActionFeedbackProvider.");
  return value;
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Notice | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    sound: true,
    vibration: true,
  });
  const preferencesRef = useRef(preferences);
  const playerRef = useRef<ReturnType<typeof createCuePlayer> | null>(null);
  const sequence = useRef(0);
  const responseRoute = useRef(window.location.hash);
  const keyboard = useRef(false);

  function player() {
    if (!playerRef.current)
      playerRef.current = createCuePlayer({
        preferences: () => preferencesRef.current,
        visible: () => document.visibilityState !== "hidden",
        reducedMotion: () =>
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        createContext: () =>
          typeof AudioContext === "undefined" ? undefined : new AudioContext(),
        vibrate: (duration) =>
          typeof navigator.vibrate === "function"
            ? navigator.vibrate(duration)
            : undefined,
      });
    return playerRef.current;
  }
  const prepare = useCallback(() => player().prepare(), []);
  const respond = useCallback((feedback: ActionFeedback) => {
    const id = ++sequence.current;
    queueMicrotask(() => {
      if (sequence.current === id) responseRoute.current = window.location.hash;
    });
    setCurrent({ ...feedback, id, animate: !keyboard.current });
    void player()
      .play(feedback.tone)
      .then((cues) => {
        setCurrent((previous) =>
          previous?.id === id ? { ...previous, cues } : previous,
        );
      });
  }, []);
  const showNotice = useCallback((message: string) => {
    const id = ++sequence.current;
    queueMicrotask(() => {
      if (sequence.current === id) responseRoute.current = window.location.hash;
    });
    setCurrent({ id, tone: "info", title: message, animate: false });
  }, []);
  const clear = useCallback(() => {
    sequence.current += 1;
    setCurrent(null);
    playerRef.current?.stop();
  }, []);
  const setPreference = useCallback(
    (name: keyof Preferences, value: boolean) => {
      const next = { ...preferencesRef.current, [name]: value };
      preferencesRef.current = next;
      setPreferences(next);
      if (!value) playerRef.current?.stop();
    },
    [],
  );

  useEffect(() => {
    let actionTimer: number | undefined;
    const isNextControl = (target: EventTarget | null) =>
      target instanceof Element &&
      !target.closest(".action-feedback") &&
      !!target.closest("button, a, input, select, textarea, summary, label");
    const onKey = (event: KeyboardEvent) => {
      keyboard.current = true;
      if (event.key === "Escape") clear();
    };
    const onPointer = () => {
      keyboard.current = false;
    };
    const onAction = (event: MouseEvent) => {
      if (!isNextControl(event.target)) return;
      const previous = sequence.current;
      // Let native preactivation and React handlers finish before removing an
      // in-flow notice. Microtasks can run between native event listeners, so
      // use the next task. A new outcome always wins over stale cleanup.
      if (actionTimer !== undefined) window.clearTimeout(actionTimer);
      actionTimer = window.setTimeout(() => {
        actionTimer = undefined;
        if (sequence.current === previous) clear();
      }, 0);
    };
    const hide = () => {
      if (document.hidden) playerRef.current?.stop();
    };
    const navigate = () => {
      // A commit may navigate and acknowledge within the same gesture. Its
      // microtask records the final route before hashchange is dispatched.
      if (responseRoute.current !== window.location.hash) {
        setCurrent(null);
        playerRef.current?.stop();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("click", onAction, true);
    window.addEventListener("hashchange", navigate);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("click", onAction, true);
      window.removeEventListener("hashchange", navigate);
      document.removeEventListener("visibilitychange", hide);
      if (actionTimer !== undefined) window.clearTimeout(actionTimer);
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  return (
    <FeedbackContext.Provider
      value={{
        prepare,
        respond,
        showNotice,
        clear,
        preferences,
        setPreference,
      }}
    >
      {children}
      <FeedbackToast
        current={current}
        onDismiss={() => {
          setCurrent(null);
          playerRef.current?.stop();
        }}
        onMute={() => setPreference("sound", false)}
        sound={preferences.sound}
      />
    </FeedbackContext.Provider>
  );
}

function FeedbackToast({
  current,
  onDismiss,
  onMute,
  sound,
}: {
  current: Notice | null;
  onDismiss: () => void;
  onMute: () => void;
  sound: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement>(() => document.body);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!current) return;
    // Native dialogs live above page z-indexes. Keep the existing notice within
    // the active dialog's accessible tree; retarget it when that dialog closes.
    const sync = () => {
      const dialogs =
        document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      const dialog = dialogs.item(dialogs.length - 1);
      setTarget(
        dialog?.querySelector<HTMLElement>(".modal-feedback-slot") ??
          dialog ??
          document.body,
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, [!!current]);

  function dismiss() {
    if (document.activeElement === dismissRef.current) {
      const previous = returnFocus.current;
      if (previous?.isConnected && !previous.closest(".action-feedback"))
        previous.focus();
      else {
        const container =
          target.closest("dialog") ?? document.getElementById("main-content");
        container?.focus();
      }
    }
    onDismiss();
  }

  return createPortal(
    <>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {current ? `${current.title} ${current.message ?? ""}` : ""}
      </div>
      {current && (
        <aside
          className={`toast action-feedback feedback-${current.tone}`}
          aria-label="Action feedback"
          data-feedback-tone={current.tone}
          data-feedback-sequence={current.id}
          data-audio-feedback={current.cues?.audio ?? "none"}
          data-vibration-feedback={current.cues?.vibration ?? "none"}
          data-motion={current.animate ? "gentle" : "instant"}
        >
          <span className="action-feedback-icon" aria-hidden="true">
            <Icon
              name={
                current.tone === "success"
                  ? "check"
                  : current.tone === "pending"
                    ? "shield"
                    : "info"
              }
              size={23}
            />
          </span>
          <div className="action-feedback-copy">
            <strong>{current.title}</strong>
            {current.message && <p>{current.message}</p>}
          </div>
          <div className="action-feedback-tools">
            {sound && current.cues && (
              <button
                className="icon-button"
                aria-label="Mute confirmation sounds"
                onClick={onMute}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path d="m11 5-6 5H2v4h3l6 5ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" />
                </svg>
              </button>
            )}
            <button
              ref={dismissRef}
              className="icon-button"
              aria-label="Dismiss confirmation"
              onFocus={(event) => {
                if (event.relatedTarget instanceof HTMLElement)
                  returnFocus.current = event.relatedTarget;
              }}
              onClick={dismiss}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </aside>
      )}
    </>,
    target,
  );
}

export function FeedbackPreferences() {
  const { preferences, setPreference, prepare, respond } = useActionFeedback();
  return (
    <section
      className="panel feedback-preferences"
      aria-labelledby="feedback-preferences-title"
    >
      <p className="eyebrow">A little reassurance</p>
      <h2 id="feedback-preferences-title">Sounds & touch</h2>
      <p>
        A gentle note and a little tap when you submit something. Visual
        confirmations are always on.
      </p>
      <label className="feedback-preference-row">
        <span>
          <strong>Confirmation sounds</strong>
          <small>A quiet chime after a submission.</small>
        </span>
        <PreferenceSwitch
          checked={preferences.sound}
          onChange={(value) => setPreference("sound", value)}
        />
      </label>
      <label className="feedback-preference-row">
        <span>
          <strong>Gentle vibration</strong>
          <small>A brief tap on supported phones.</small>
        </span>
        <PreferenceSwitch
          checked={preferences.vibration}
          onChange={(value) => setPreference("vibration", value)}
        />
      </label>
      <div className="feedback-preferences-bottom">
        <button
          className="button secondary compact"
          onClick={() => {
            prepare();
            respond({
              tone: "success",
              title: "A little encouragement, just like this.",
              message: "This is a preview of your confirmation feedback.",
            });
          }}
        >
          Try feedback <Icon name="check" size={16} />
        </button>
        <p>
          Your browser, device and accessibility settings may keep feedback
          quiet. These choices apply to this demo session.
        </p>
      </div>
    </section>
  );
}
