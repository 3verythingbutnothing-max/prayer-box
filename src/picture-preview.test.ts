import assert from 'node:assert/strict';
import test from 'node:test';
import { makePicturePreview } from './picture-preview.ts';

const png = [137, 80, 78, 71, 13, 10, 26, 10];
const jpeg = [255, 216, 255, 224];
const webp = [82, 73, 70, 70, 16, 0, 0, 0, 87, 69, 66, 80];
const picture = (bytes = png, type = 'image/png') => new File([new Uint8Array(bytes)], 'private-original-name.png', { type });

/** Fake decoding/canvas boundaries, not the validation or cropping algorithm. */
function browserHarness(options: { width?: number; height?: number; noContext?: boolean; decodeError?: boolean; drawError?: boolean } = {}) {
  const keys = ['createImageBitmap', 'document'] as const;
  const original = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let decodeCalls = 0;
  let closeCalls = 0;
  const drawCalls: unknown[][] = [];
  const encodings: string[] = [];
  const bitmap = { width: options.width ?? 600, height: options.height ?? 400, close: () => { closeCalls++; } };
  const canvas = {
    width: 0, height: 0,
    getContext: (kind: string) => {
      assert.equal(kind, '2d');
      return options.noContext ? null : { drawImage: (...args: unknown[]) => { if (options.drawError) throw new Error('Drawing failed'); drawCalls.push(args); } };
    },
    toDataURL: (type: string) => { encodings.push(type); return 'data:image/png;base64,bm9ybWFsaXplZA=='; },
  };
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => {
    decodeCalls++;
    if (options.decodeError) throw new Error('Decoding failed');
    return bitmap;
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => { assert.equal(tag, 'canvas'); return canvas; } } });
  return {
    bitmap, canvas, drawCalls, encodings,
    get decodeCalls() { return decodeCalls; },
    get closeCalls() { return closeCalls; },
    restore() { keys.forEach((key, index) => { const descriptor = original[index]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }); },
  };
}

test('picture validation rejects unsupported, empty and oversized files before decoding', async () => {
  const browser = browserHarness();
  try {
    for (const file of [picture(png, 'image/svg+xml'), picture(png, 'image/gif'), picture([], 'image/png'), new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' })]) {
      await assert.rejects(makePicturePreview(file));
    }
    assert.equal(browser.decodeCalls, 0);
    assert.deepEqual(browser.drawCalls, []);
  } finally { browser.restore(); }
});

test('a declared image format cannot disguise mismatched or truncated file bytes', async () => {
  const browser = browserHarness();
  try {
    for (const file of [picture(jpeg, 'image/png'), picture(png, 'image/jpeg'), picture(png, 'image/webp'), picture([82, 73, 70, 70], 'image/webp')]) {
      await assert.rejects(makePicturePreview(file));
    }
    assert.equal(browser.decodeCalls, 0);
  } finally { browser.restore(); }
});

for (const [type, bytes] of [['image/png', png], ['image/jpeg', jpeg], ['image/webp', webp]] as const) {
  test(`${type} becomes a new centered square PNG, without returning original file content`, async () => {
    const browser = browserHarness();
    try {
      const output = await makePicturePreview(picture([...bytes], type));
      assert.equal(output, 'data:image/png;base64,bm9ybWFsaXplZA==');
      assert.equal(browser.canvas.width, 256);
      assert.equal(browser.canvas.height, 256);
      assert.deepEqual(browser.drawCalls, [[browser.bitmap, 100, 0, 400, 400, 0, 0, 256, 256]]);
      assert.deepEqual(browser.encodings, ['image/png']);
      assert.equal(browser.closeCalls, 1);
      assert.doesNotMatch(output, /private-original-name/);
    } finally { browser.restore(); }
  });
}

test('portrait images crop vertically around the center', async () => {
  const browser = browserHarness({ width: 400, height: 800 });
  try {
    await makePicturePreview(picture());
    assert.deepEqual(browser.drawCalls, [[browser.bitmap, 0, 200, 400, 400, 0, 0, 256, 256]]);
    assert.equal(browser.closeCalls, 1);
  } finally { browser.restore(); }
});

test('decoded dimension limits reject oversized imagery and always close its bitmap', async () => {
  for (const [width, height] of [[0, 100], [100, 0], [8001, 100], [100, 8001], [6000, 5000]]) {
    const browser = browserHarness({ width, height });
    try {
      await assert.rejects(makePicturePreview(picture()));
      assert.equal(browser.closeCalls, 1);
      assert.deepEqual(browser.drawCalls, []);
      assert.deepEqual(browser.encodings, []);
    } finally { browser.restore(); }
  }
});

test('unavailable canvas and drawing failures release decoded pixels and do not return a preview', async () => {
  for (const options of [{ noContext: true }, { drawError: true }]) {
    const browser = browserHarness(options);
    try {
      await assert.rejects(makePicturePreview(picture()));
      assert.equal(browser.closeCalls, 1);
      assert.deepEqual(browser.encodings, []);
    } finally { browser.restore(); }
  }
});

test('a decoder failure produces no preview', async () => {
  const browser = browserHarness({ decodeError: true });
  try {
    await assert.rejects(makePicturePreview(picture()));
    assert.equal(browser.decodeCalls, 1);
    assert.equal(browser.closeCalls, 0);
    assert.deepEqual(browser.drawCalls, []);
    assert.deepEqual(browser.encodings, []);
  } finally { browser.restore(); }
});
