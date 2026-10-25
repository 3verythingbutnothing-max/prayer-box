import QRCode from "qrcode";
import { prayerBoxUrl } from "./domain.ts";
import type { BoxId } from "./domain.ts";

/** A box permalink only: never a request, query string, or credential. */
export function createPrayerBoxQr(pageUrl: string, box: BoxId) {
  const page = new URL(pageUrl);
  if (
    !["http:", "https:"].includes(page.protocol) ||
    page.username ||
    page.password
  ) {
    throw new Error(
      "A Prayer Box QR code needs a web page without credentials.",
    );
  }
  const url = prayerBoxUrl(page.href, box);
  // Bound density and export size for a readable, shareable card.
  if (url.length > 512)
    throw new Error("This box link is too long for a QR card.");
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "H" });
  return {
    url,
    size: modules.size,
    data: new Uint8Array(modules.data),
    quietZone: 4 as const,
  };
}
