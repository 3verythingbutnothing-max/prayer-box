import QRCode from "qrcode";
import { prayerBoxUrl } from "./domain.ts";
import type { BoxId } from "./domain.ts";

type LogoArea = { row: number; column: number; size: number };

/** Find a small central data-only area, with space around functional patterns. */
function findLogoArea(size: number, reserved: Uint8Array): LogoArea {
  // At most one fifth of the symbol width (4% of its area), capped at 9 modules.
  // Error correction is a fallback, not permission to cover finder/alignment cells.
  const maximum = Math.min(9, Math.floor(size / 5));
  const center = (size - 1) / 2;
  for (let side = maximum % 2 ? maximum : maximum - 1; side >= 5; side -= 2) {
    let best: LogoArea | undefined;
    let distance = Infinity;
    for (let row = 1; row + side < size; row += 1) {
      for (let column = 1; column + side < size; column += 1) {
        const middleRow = row + (side - 1) / 2;
        const middleColumn = column + (side - 1) / 2;
        if (
          middleRow < size / 4 ||
          middleRow > (3 * size) / 4 ||
          middleColumn < size / 4 ||
          middleColumn > (3 * size) / 4
        )
          continue;
        const score = (middleRow - center) ** 2 + (middleColumn - center) ** 2;
        if (score >= distance) continue;
        let clear = true;
        // Preserve every functional cell plus an additional one-module buffer.
        for (let y = row - 1; y <= row + side && clear; y += 1) {
          for (let x = column - 1; x <= column + side; x += 1) {
            if (reserved[y * size + x]) {
              clear = false;
              break;
            }
          }
        }
        if (clear) {
          best = { row, column, size: side };
          distance = score;
        }
      }
    }
    if (best) return best;
  }
  throw new Error("This code has no clear area for its Prayer Box mark.");
}

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
  const reserved = new Uint8Array(modules.reservedBit);
  const logo = findLogoArea(modules.size, reserved);
  const data = new Uint8Array(modules.data);
  for (let row = logo.row; row < logo.row + logo.size; row += 1) {
    data.fill(
      0,
      row * modules.size + logo.column,
      row * modules.size + logo.column + logo.size,
    );
  }
  return {
    url,
    size: modules.size,
    data,
    reserved,
    logo,
    errorCorrectionLevel: "H" as const,
    quietZone: 4 as const,
  };
}
