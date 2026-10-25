import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { createPrayerBoxQr } from "./qr.ts";
import type { BoxId } from "./domain.ts";

/**
 * Independently rasterize the public module matrix, then decode with jsQR.
 * This uses neither the encoder's SVG/image output nor its decoding logic.
 */
function decodeModules(
  qr: ReturnType<typeof createPrayerBoxQr>,
  scale: number,
  badge: "none" | "filled" | "checker" = "none",
): string {
  const width = (qr.size + qr.quietZone * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255); // Opaque white pixels, including the complete quiet zone.
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      const inBadge =
        row >= qr.logo.row &&
        row < qr.logo.row + qr.logo.size &&
        column >= qr.logo.column &&
        column < qr.logo.column + qr.logo.size;
      const dark =
        inBadge && badge !== "none"
          ? badge === "filled" || (row + column) % 2 === 0
          : qr.data[row * qr.size + column];
      if (!dark) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixel =
            (((row + qr.quietZone) * scale + y) * width +
              (column + qr.quietZone) * scale +
              x) *
            4;
          pixels[pixel] = 0;
          pixels[pixel + 1] = 0;
          pixels[pixel + 2] = 0;
        }
      }
    }
  }
  const decoded = jsQR(pixels, width, width, {
    inversionAttempts: "dontInvert",
  });
  assert.ok(
    decoded,
    `Independent decoder could not read the ${qr.size}-module QR at ${scale}×`,
  );
  return decoded.data;
}

const boxes: BoxId[] = ["maria", "mine", "grace"];
const locations = [
  {
    label: "GitHub Pages project path",
    page: "https://prayer-box-demo.github.io/prayer-box/?fixture=private-query#request/private-story",
    base: "https://prayer-box-demo.github.io/prayer-box/",
    scale: 6 as const,
  },
  {
    label: "local development path",
    page: "http://127.0.0.1:4173/?fixture=private-query#request/private-story",
    base: "http://127.0.0.1:4173/",
    scale: 8 as const,
  },
];

const brandedPages = [
  "https://3verythingbutnothing-max.github.io/prayer-box/?private=omit#request/old",
  "http://127.0.0.1:4173/prayer-box/?private=omit#request/old",
  "https://example.org/祈り/?private=omit#request/old",
  "http://a/?private=omit#request/old",
];

for (const box of boxes) {
  test(`small and phone-sized branded QR area independently decodes for ${box}`, () => {
    for (const page of brandedPages) {
      const qr = createPrayerBoxQr(page, box);
      for (const scale of [2, 3, 4]) {
        // Conservative occlusion probes fill more of the reserved logo badge
        // than the actual light pastel mark. Actual SVG/PNG pixels are also QA'd.
        for (const badge of ["none", "filled", "checker"] as const) {
          assert.equal(
            decodeModules(qr, scale, badge),
            qr.url,
            `${page} / ${scale}× / ${badge}`,
          );
        }
      }
    }
  });
}

test("the central logo cutout preserves all functional modules plus a one-module buffer", () => {
  const pages = [
    ...brandedPages,
    `https://example.org/${"sample/".repeat(65)}`,
  ];
  const versions = new Set<number>();
  for (const page of pages) {
    for (const box of boxes) {
      const qr = createPrayerBoxQr(page, box);
      const raw = QRCode.create(qr.url, { errorCorrectionLevel: "H" });
      versions.add(raw.version);
      assert.equal(qr.errorCorrectionLevel, "H");
      assert.equal(qr.quietZone, 4);
      assert.ok(qr.logo.size >= 5 && qr.logo.size <= 9);
      assert.ok(qr.logo.size ** 2 / qr.size ** 2 <= 0.04);
      const rowCenter = qr.logo.row + (qr.logo.size - 1) / 2;
      const columnCenter = qr.logo.column + (qr.logo.size - 1) / 2;
      assert.ok(rowCenter >= qr.size / 4 && rowCenter <= (qr.size * 3) / 4);
      assert.ok(
        columnCenter >= qr.size / 4 && columnCenter <= (qr.size * 3) / 4,
      );
      for (let row = 0; row < qr.size; row++) {
        for (let column = 0; column < qr.size; column++) {
          const index = row * qr.size + column;
          const cutout =
            row >= qr.logo.row &&
            row < qr.logo.row + qr.logo.size &&
            column >= qr.logo.column &&
            column < qr.logo.column + qr.logo.size;
          const buffer =
            row >= qr.logo.row - 1 &&
            row <= qr.logo.row + qr.logo.size &&
            column >= qr.logo.column - 1 &&
            column <= qr.logo.column + qr.logo.size;
          if (buffer) assert.equal(raw.modules.isReserved(row, column), 0);
          assert.equal(qr.reserved[index], raw.modules.reservedBit[index]);
          assert.equal(qr.data[index], cutout ? 0 : raw.modules.data[index]);
        }
      }
      assert.equal(decodeModules(qr, 4, "checker"), qr.url);
    }
  }
  assert.ok(
    versions.size >= 4,
    "Fixture URLs exercise several versions and alignment layouts",
  );
});

for (const location of locations) {
  for (const box of boxes) {
    test(`independent QR decoding reaches ${box} on the ${location.label}`, () => {
      const qr = createPrayerBoxQr(location.page, box);
      const expected = `${location.base}#box/${box}`;
      assert.equal(qr.quietZone, 4);
      assert.equal(qr.data.length, qr.size * qr.size);
      assert.equal(qr.url, expected);
      assert.equal(decodeModules(qr, location.scale), expected);
      assert.doesNotMatch(qr.url, /private-query|private-story|\?|#request\//);
    });
  }
}

test("personal and organization boxes produce distinct independently decoded destinations", () => {
  const codes = boxes.map((box) =>
    createPrayerBoxQr("https://example.org/prayer-box/#request/old-story", box),
  );
  const decoded = codes.map((qr) => decodeModules(qr, 8));
  assert.deepEqual(decoded, [
    "https://example.org/prayer-box/#box/maria",
    "https://example.org/prayer-box/#box/mine",
    "https://example.org/prayer-box/#box/grace",
  ]);
  assert.equal(
    new Set(codes.map((qr) => Array.from(qr.data).join(""))).size,
    3,
  );
});

test("QR creation rejects malformed and non-HTTP page locations", () => {
  const invalid = [
    "",
    "not a URL",
    "https://",
    "//example.org/prayer-box/",
    "file:///tmp/prayer-box/index.html",
    "ftp://example.org/prayer-box/",
    "mailto:fictional@example.invalid",
    "javascript:alert('fictional-only')",
    "data:text/html,fictional-only",
  ];
  for (const page of invalid)
    assert.throws(() => createPrayerBoxQr(page, "maria"), Error, page);
});

test("QR payloads never encode page locations containing credentials", () => {
  for (const page of [
    "https://fictional-user:fictional-password@example.org/prayer-box/",
    "https://fictional-user@example.org/prayer-box/",
    "http://fictional-user:fictional-password@127.0.0.1:4173/",
  ])
    assert.throws(() => createPrayerBoxQr(page, "grace"), Error, page);
});

test("oversized page paths are rejected instead of returning an unusable QR", () => {
  const page = `https://example.org/${"fictional-path-segment/".repeat(1000)}`;
  assert.throws(() => createPrayerBoxQr(page, "mine"));
});
