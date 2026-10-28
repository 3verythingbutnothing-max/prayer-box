/** Decode and re-encode locally: original bytes/metadata never become the preview. */
export async function makePicturePreview(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024)
    throw new Error('Choose a PNG, JPEG, or WebP image up to 2 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const valid = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('That file does not match a supported image format.');
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width > 8000 || image.height > 8000 || image.width * image.height > 24_000_000)
      throw new Error('Choose an image smaller than 8,000 pixels per side and 24 megapixels.');
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image preview is unavailable. Please try again in another browser.');
    const edge = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, 256, 256);
    return canvas.toDataURL('image/png');
  } finally { image.close(); }
}

