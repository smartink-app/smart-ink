/** Bottom-up atlas rectangle: u, v, width, height. */
export type InkUvRegion = [number, number, number, number];
/** Bound actual coverage, preserving an eight-pixel guard for filtering/island padding. */
export function inkUvRegion(pixels: Uint8Array, size: number): InkUvRegion {
  if (!Number.isInteger(size) || size < 1 || pixels.length !== size * size * 4) throw new Error('Invalid ink atlas');
  let left = size, bottom = size, right = -1, top = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!pixels[(y * size + x) * 4 + 3]) continue;
    left = Math.min(left, x); bottom = Math.min(bottom, y);
    right = Math.max(right, x); top = Math.max(top, y);
  }
  if (right < 0) return [0, 0, 1, 1];
  left = Math.max(0, left - 8); bottom = Math.max(0, bottom - 8);
  right = Math.min(size, right + 9); top = Math.min(size, top + 9);
  return [left / size, bottom / size, (right - left) / size, (top - bottom) / size];
}
