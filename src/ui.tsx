import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

/** Place inside a visible label; native interaction for an ongoing preference. */
export function PreferenceSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <span className="preference-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="preference-switch-track" aria-hidden="true">
        <span className="preference-switch-thumb">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path className="switch-off-mark" d="M5 8h6" />
            <path className="switch-on-mark" d="m4 8 3 3 5-6" />
          </svg>
        </span>
      </span>
    </span>
  );
}

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    box: (
      <>
        <path d="m3 8 9-5 9 5v12H3Z" />
        <path d="m3 8 9 6 9-6M8 17h8" />
      </>
    ),
    note: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
        <path d="M14 3v6h6M8 13h8m-8 4h5" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v3" />
      </>
    ),
    cross: <path d="M9 3h6v5h5v6h-5v7H9v-7H4V8h5Z" />,
    'prayer-hands': <><path d="m12 17-2-5V4a1.5 1.5 0 0 0-3 0v6l-3 7 4 4 4-4Zm0 0 2-5V4a1.5 1.5 0 0 1 3 0v6l3 7-4 4-4-4Z"/><path d="m4 17-2 2 4 4 2-2m12-4 2 2-4 4-2-2"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    heart: <path d="M12 20 4 12C-3 5 7-1 12 6c5-7 15-1 8 6Z" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18Z" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
    back: <path d="M19 12H5m5-5-5 5 5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    bell: (
      <>
        <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 4h4" />
      </>
    ),
    settings: (
      <>
        <path d="m10 3-1 3-3 1-3-1-1 4 3 2v3l-1 3 3 2 3-2h3l3 2 3-3-1-3v-3l2-2-2-4-3 1-2-1-1-3Z" />
        <circle cx="11" cy="12" r="3" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 9 4v5c0 5-9 9-9 9s-9-4-9-9V7Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    audio: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" />
      </>
    ),
    photo: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="m3 17 5-5 4 4 4-7 5 8" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="5" width="12" height="14" rx="3" />
        <path d="m15 10 6-4v12l-6-4" />
      </>
    ),
    link: (
      <>
        <path d="m9 15 6-6m-6-2 2-2a5 5 0 0 1 7 7l-2 2M8 10l-2 2a5 5 0 0 0 7 7l2-2" />
      </>
    ),
    qr: (
      <>
        <path d="M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Z" />
        <path d="M15 15h3v3h3v3m-6-3v3m6-9h-3m-6 0v3m0 6h3" />
      </>
    ),
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
      </>
    ),
    flag: (
      <>
        <path d="M5 22V3c5-3 9 4 14 0v11c-5 4-9-3-14 0" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-11v1" />
      </>
    ),
    exit: (
      <>
        <path d="M9 4H4v16h5m6-13 5 5-5 5M8 12h12" />
      </>
    ),
    edit: (
      <>
        <path d="m16 3 5 5-12 12-6 1 1-6Zm-1 1 5 5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[
        name === "arrow-right" ? "arrow" : name === "users" ? "people" : name
      ] ?? paths.note}
    </svg>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="modal-header">
        <h2 id={heading}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="modal-feedback-slot" />
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

/** Shared silhouette: an open lavender box and a heart-marked prayer note. */
function PrayerBoxDrawing({ detailed = false }: { detailed?: boolean }) {
  return (
    <g
      stroke="#6D587F"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m13 54 35-15 34 15-34 15Z" fill="#DCCDF1" />
      <path d="m13 54 35 15v24L13 78Z" fill="#EAE2FF" />
      <path d="m48 69 34-15v24L48 93Z" fill="#CFBAE9" />
      <g transform="rotate(-9 48 36)">
        <rect x="29" y="9" width="39" height="54" rx="5" fill="#FFF0AE" />
        <path d="M38 23h21m-21 8h16" stroke="#897598" strokeWidth="1.9" />
        <path
          d="M48 39c-5-7-13-1-7 5l7 6 7-6c6-6-2-12-7-5Z"
          fill="#E8B2BD"
          strokeWidth="1.7"
        />
        {detailed ? (
          <path d="M38 56h19" stroke="#897598" strokeWidth="1.9" />
        ) : null}
      </g>
      <path d="m13 54 35 15-9 10L5 63Z" fill="#F5EEFF" />
      <path d="m48 69 34-15 9 9-34 16Z" fill="#EEE3FC" />
    </g>
  );
}

/** Decorative beside a wordmark by default; pass title for a standalone label. */
export function PrayerBoxMark({
  size = 36,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={`prayer-box-mark ${className}`.trim()}
      focusable="false"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <PrayerBoxDrawing />
    </svg>
  );
}

export function BoxArt({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "box-art small" : "box-art"}
      viewBox="0 0 220 180"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="111" cy="161" rx="74" ry="9" fill="#D5C8E6" opacity=".35" />
      <g transform="translate(28 -2) scale(1.7)">
        <PrayerBoxDrawing detailed />
      </g>
      <path
        d="M178 36v12m-6-6h12M43 43l-5-7m-6 18-9-1m168 12 8-5"
        stroke="#9983AC"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M56 24c-5-8-13-1-7 5l7 6 7-6c6-6-2-13-7-5Z"
        fill="#FFE5D8"
        stroke="#9983AC"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CountryFlag({ country = "us" }: { country?: string }) {
  return (
    <svg
      className="country-flag"
      viewBox="0 0 30 20"
      role="img"
      aria-label={`${country === "gb" ? "United Kingdom" : country === "ph" ? "Philippines" : "United States"}, self-selected`}
    >
      {country === "gb" ? (
        <>
          <rect width="30" height="20" fill="#485A87" />
          <path d="m0 0 30 20M0 20 30 0" stroke="#fff" strokeWidth="5" />
          <path d="m0 0 30 20M0 10h30" stroke="#B25D68" strokeWidth="2" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="7" />
          <path d="M15 0v20M0 10h30" stroke="#B25D68" strokeWidth="4" />
        </>
      ) : country === "ph" ? (
        <>
          <rect width="30" height="10" fill="#485A87" />
          <rect y="10" width="30" height="10" fill="#B25D68" />
          <path d="M0 0v20l17-10Z" fill="#fff" />
          <circle cx="6" cy="10" r="2.5" fill="#CFA547" />
        </>
      ) : (
        <>
          <rect width="30" height="20" fill="#fff" />
          {[0, 3, 6, 9, 12, 15, 18].map((y) => (
            <rect key={y} y={y} width="30" height="1.6" fill="#B25D68" />
          ))}
          <rect width="13" height="11" fill="#485A87" />
          <path
            d="M2 2h1m3 0h1m3 0h1M2 5h1m3 0h1m3 0h1M2 8h1m3 0h1m3 0h1"
            stroke="#fff"
            strokeWidth="1.6"
          />
        </>
      )}
    </svg>
  );
}
