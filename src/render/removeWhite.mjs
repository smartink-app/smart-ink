/** Convert black/gray artwork on white into black ink with continuous alpha.
 * Process from the original each time. RGB is straight (not premultiplied).
 */
export function removeWhite(data, paperCleanup = 0) {
  if (!(data instanceof Uint8ClampedArray) || data.length % 4) throw new Error('Expected RGBA pixels');
  if (!Number.isFinite(paperCleanup) || paperCleanup < 0 || paperCleanup > 20) throw new Error('Cleanup must be 0–20');
  const whitePoint = 255 * (1 - paperCleanup / 100);
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    // Perceptual sRGB luminance keeps neutral gray's appearance on white.
    const light = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    result[i + 3] = Math.round(data[i + 3] * Math.max(0, 1 - light / whitePoint));
  }
  return result;
}
