import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import { createPrayerBoxQr } from "./qr.ts";
import type { BoxId } from "./domain.ts";

/**
 * Independently rasterize the public module matrix, then decode with jsQR.
 * This uses neither the encoder's SVG/image output nor its decoding logic.
 */
function decodeModules(
  qr: ReturnType<typeof createPrayerBoxQr>,
  scale: 6 | 8,
): string {
  const width = (qr.size + qr.quietZone * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255); // Opaque white pixels, including the complete quiet zone.
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.data[row * qr.size + column]) continue;
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
    assert.throws(() => createPrayerBoxQr(page, "maria"), undefined, page);
});

test("QR payloads never encode page locations containing credentials", () => {
  for (const page of [
    "https://fictional-user:fictional-password@example.org/prayer-box/",
    "https://fictional-user@example.org/prayer-box/",
    "http://fictional-user:fictional-password@127.0.0.1:4173/",
  ])
    assert.throws(() => createPrayerBoxQr(page, "grace"), undefined, page);
});

test("oversized page paths are rejected instead of returning an unusable QR", () => {
  const page = `https://example.org/${"fictional-path-segment/".repeat(1000)}`;
  assert.throws(() => createPrayerBoxQr(page, "mine"));
});
