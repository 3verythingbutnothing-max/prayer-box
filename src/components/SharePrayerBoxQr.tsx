import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { prayerBoxUrl } from "../domain";
import type { BoxId } from "../domain";
import type { createPrayerBoxQr } from "../qr";
import { Icon, PrayerBoxMark } from "../ui";
import { useActionFeedback } from "../action-feedback";
import "../qr-share.css";

type Qr = ReturnType<typeof createPrayerBoxQr>;

/** Merge adjacent dark modules without rounding or changing their geometry. */
function modulePath(qr: Qr, cell: number) {
  const runs: string[] = [];
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.data[row * qr.size + column]) continue;
      const start = column;
      while (column + 1 < qr.size && qr.data[row * qr.size + column + 1])
        column += 1;
      const width = (column - start + 1) * cell;
      runs.push(`M${start * cell} ${row * cell}h${width}v${cell}h-${width}Z`);
    }
  }
  return runs.join("");
}

function qrCardDimensions(qr: Qr | null) {
  const cell = 10;
  const border = 24;
  const top = 112;
  const square = qr ? (qr.size + 2 * qr.quietZone) * cell : 530;
  return {
    cell,
    border,
    top,
    square,
    width: square + border * 2,
    height: top + square + 164,
  };
}

/** The same self-contained vector card is shown on screen and exported. */
export function PrayerBoxQrCard({
  qr,
  boxName,
  elementRef,
}: {
  qr: Qr;
  boxName: string;
  elementRef?: RefObject<SVGSVGElement | null>;
}) {
  const { cell, border, top, square, width, height } = qrCardDimensions(qr);
  const title =
    ["Prayer Box", "Prayer Box team"].includes(boxName)
      ? "Prayer Box team"
      : `${boxName}’s Prayer Box`;
  const printedUrl = new URL(qr.url);
  const titleFontSize = title.length > 22 ? 30 : 34;
  return (
    <svg
      ref={elementRef}
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`QR code for ${title}. ${qr.url}`}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <title>{`${title} — shareable QR code`}</title>
      <desc>Scan to open {qr.url}. Fictional frontend demo.</desc>
      <rect width={width} height={height} rx="30" fill="#FFFBF5" />
      <rect
        x="1"
        y="1"
        width={width - 2}
        height={height - 2}
        rx="29"
        fill="none"
        stroke="#C6D9E9"
        strokeWidth="2"
      />
      <path
        d={`M1 30Q1 1 30 1h${width - 60}q29 0 29 29v58H1Z`}
        fill="#EEF5FA"
      />
      <g transform="translate(29 13)">
        <PrayerBoxMark size={76} />
      </g>
      <text x="121" y="51" fontSize="31" fontWeight="700" fill="#2F4B68">
        Prayer Box
      </text>
      <text x="122" y="77" fontSize="18" fill="#5C6876">
        A little box. A place for prayer.
      </text>
      {/* The entire code and its four-module quiet zone stay opaque white. */}
      <rect x={border} y={top} width={square} height={square} fill="#FFFFFF" />
      <path
        d={modulePath(qr, cell)}
        transform={`translate(${border + qr.quietZone * cell} ${top + qr.quietZone * cell})`}
        fill="#233D56"
        shapeRendering="crispEdges"
      />
      <text
        x={width / 2}
        y={top + square + 39}
        textAnchor="middle"
        fontSize={titleFontSize}
        fontWeight="700"
        fill="#2F4B68"
      >
        {title}
      </text>
      <text
        x={width / 2}
        y={top + square + 78}
        textAnchor="middle"
        fontSize="29"
        fill="#293545"
      >
        Scan to leave a prayer request
      </text>
      <text
        x={width / 2}
        y={top + square + 111}
        textAnchor="middle"
        fontSize="22"
        fill="#5C6876"
      >
        {printedUrl.host}
        {printedUrl.pathname}
      </text>
      <text
        x={width / 2}
        y={top + square + 140}
        textAnchor="middle"
        fontSize="22"
        fill="#5C6876"
      >
        {printedUrl.hash} · Fictional demo
      </text>
    </svg>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the download before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function pngFromSvg(svg: Blob, width: number, height: number) {
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The QR image could not be prepared."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    // Integer scaling keeps square modules crisp in the slide-ready export.
    canvas.width = width * 3;
    canvas.height = height * 3;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image downloads are unavailable in this browser.");
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("The image could not be saved.")),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SharePrayerBoxQr({
  box,
  boxName,
}: {
  box: BoxId;
  boxName: string;
}) {
  const feedback = useActionFeedback();
  const pageUrl = window.location.href;
  const permalink = prayerBoxUrl(pageUrl, box);
  const [qr, setQr] = useState<Qr | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const mounted = useRef(true);
  const exportingNow = useRef(false);
  const copyingNow = useRef(false);
  const heading = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The encoder loads only when someone opens Share, with a copy-link fallback.
    import("../qr")
      .then(({ createPrayerBoxQr }) => {
        const code = createPrayerBoxQr(pageUrl, box);
        if (!cancelled) setQr(code);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pageUrl, box]);

  const { width, height } = qrCardDimensions(qr);

  async function download(format: "png" | "svg") {
    if (!svg.current || exportingNow.current) return;
    feedback.prepare();
    exportingNow.current = true;
    setExportError("");
    setExporting(true);
    try {
      const source = new XMLSerializer().serializeToString(svg.current);
      const vector = new Blob([source], {
        type: "image/svg+xml;charset=utf-8",
      });
      const blob =
        format === "png" ? await pngFromSvg(vector, width, height) : vector;
      if (!mounted.current) return;
      saveBlob(blob, `prayer-box-${box}.${format}`);
      feedback.respond({
        tone: "success",
        title: "Your QR card is ready for sharing.",
        message: `${format.toUpperCase()} prepared for download. Your browser manages saving the file; nothing was uploaded or shared.`,
      });
    } catch {
      if (!mounted.current) return;
      setExportError(
        "We couldn’t prepare that download. Try again, or copy the box link.",
      );
      feedback.respond({
        tone: "error",
        title: "Your QR download could not be prepared.",
        message:
          "No file is confirmed. You can try again or copy the box link instead.",
      });
    } finally {
      exportingNow.current = false;
      if (mounted.current) setExporting(false);
    }
  }

  return (
    <div className="qr-share-layout">
      <div className="qr-share-preview" aria-busy={!qr && !loadError}>
        {qr ? (
          <PrayerBoxQrCard qr={qr} boxName={boxName} elementRef={svg} />
        ) : (
          <p className="qr-share-placeholder" role="status">
            {loadError
              ? "The QR code couldn’t load. You can still copy this box’s link."
              : "Preparing your QR code…"}
          </p>
        )}
      </div>
      <section className="qr-share-tools" aria-labelledby={heading}>
        <div>
          <p className="qr-share-eyebrow">A little invitation</p>
          <h3 id={heading}>Make room for prayer.</h3>
          <p>
            Save {boxName}’s code for a slideshow, handout or invitation.
            Scanning opens this box’s page.
          </p>
        </div>
        <div className="qr-share-downloads">
          <button
            className="button"
            disabled={!qr || exporting}
            onClick={() => download("png")}
          >
            <Icon name="download" size={18} />{" "}
            {exporting ? "Preparing…" : "Download PNG"}
          </button>
          <button
            className="button secondary"
            disabled={!qr || exporting}
            onClick={() => download("svg")}
          >
            <Icon name="download" size={18} /> Download SVG
          </button>
          <p className="quiet-copy">
            Clear QR code · PNG for slides · SVG for crisp printing
          </p>
          {exportError ? (
            <p className="qr-share-error" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>
        <div className="qr-share-link">
          <label className="field">
            Or share the box link
            <input
              value={permalink}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            className="text-link"
            onClick={async () => {
              if (copyingNow.current) return;
              feedback.prepare();
              if (!navigator.clipboard?.writeText) {
                setCopyFeedback(
                  "Select the box link above to copy it manually.",
                );
                feedback.respond({
                  tone: "info",
                  title: "Your box link is ready to copy manually.",
                  message:
                    "Automatic clipboard copying is unavailable here. Select the normal box link above to copy it.",
                });
                return;
              }
              copyingNow.current = true;
              try {
                await navigator.clipboard.writeText(permalink);
                if (!mounted.current) return;
                setCopyFeedback("Box link copied.");
                feedback.respond({
                  tone: "success",
                  title: "Your box link is copied.",
                  message:
                    "It is ready to paste wherever you choose. Private requests still need permission.",
                });
              } catch {
                if (!mounted.current) return;
                setCopyFeedback(
                  "Select the box link above to copy it manually.",
                );
                feedback.respond({
                  tone: "error",
                  title: "Please copy the box link manually.",
                  message:
                    "Automatic copying was not allowed. Select the normal box link above to copy it instead.",
                });
              } finally {
                copyingNow.current = false;
              }
            }}
          >
            <Icon name="link" size={17} /> Copy box link
          </button>
          <p className="quiet-copy" role="status">
            {copyFeedback}
          </p>
        </div>
      </section>
      <p className="qr-share-privacy quiet-copy">
        <Icon name="lock" size={15} /> A QR code opens the box page; private
        requests still need permission. This is a fictional demo, with changes
        kept in your browser session.
      </p>
    </div>
  );
}
