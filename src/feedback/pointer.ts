/** Observe taps without capturing the pointer or interfering with OrbitControls. */
export function bindFeedbackTap(canvas: HTMLElement, host: Window, onTap: (event: PointerEvent) => void) {
  let start: { id: number; x: number; y: number; moved: boolean } | null = null;
  const pointers = new Set<number>();
  const down = (e: PointerEvent) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) { start = null; return; }
    if (e.button !== 0 || !e.isPrimary || e.ctrlKey || e.metaKey || e.altKey) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    if (start?.id === e.pointerId && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) start.moved = true;
  };
  const up = (e: PointerEvent) => {
    move(e);
    const tap = start?.id === e.pointerId && !start.moved && e.button === 0;
    pointers.delete(e.pointerId);
    if (start?.id === e.pointerId) start = null;
    const rect = canvas.getBoundingClientRect();
    if (tap && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) onTap(e);
  };
  const cancel = () => { start = null; pointers.clear(); };
  canvas.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', cancel);
  host.addEventListener('blur', cancel);
  return () => {
    canvas.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', cancel); host.removeEventListener('blur', cancel);
  };
}
