/** Resize locally and re-encode photos without their original metadata. */
export async function prepareInspirationImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw Error('Choose a JPG, PNG or WebP image up to 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) throw Error('This image is too large. Choose one under 40 megapixels.');
    const ratio = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Your browser could not prepare this image.');
    context.fillStyle = '#f2eee7'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [.82, .65, .45]) {
      const source = canvas.toDataURL('image/jpeg', quality);
      if (source.length <= 240000) return source;
    }
    throw Error('Choose a smaller image for this demo.');
  } finally { bitmap.close(); }
}
