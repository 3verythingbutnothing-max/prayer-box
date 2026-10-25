import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

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
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export function BoxArt({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "box-art small" : "box-art"}
      viewBox="0 0 220 180"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="112" cy="158" rx="74" ry="10" fill="#DCCFE7" opacity=".38" />
      <path
        d="m36 91 72-30 75 31-75 32Z"
        fill="#E0D2F5"
        stroke="#77618F"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m36 91 72 31v36l-72-30Z"
        fill="#EAE2FF"
        stroke="#77618F"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m108 122 75-30v36l-75 30Z"
        fill="#D9C8F1"
        stroke="#77618F"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m36 91-15 17 71 31 16-17m75-30 15 15-74 32-16-17"
        fill="#F4EDFF"
        stroke="#77618F"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g transform="rotate(-10 105 61)">
        <rect
          x="69"
          y="23"
          width="70"
          height="80"
          rx="6"
          fill="#FFF2BF"
          stroke="#77618F"
          strokeWidth="2"
        />
        <path
          d="M85 43h38m-38 11h29m-29 33h35"
          stroke="#8B769A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M104 65c-6-9-15-2-8 5l8 7 8-7c7-7-2-14-8-5Z"
          fill="#E5B7BD"
          stroke="#77618F"
          strokeWidth="1.5"
        />
      </g>
      <path
        d="M165 40v12m-6-6h12M44 47l-5-7m-5 16-9-1m155 12 8-5"
        stroke="#9983AC"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M56 27c-5-8-13-1-7 5l7 6 7-6c6-6-2-13-7-5Z"
        fill="#FFE5D8"
        stroke="#9983AC"
        strokeWidth="1.5"
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
