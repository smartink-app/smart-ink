export const SLEEVE_IDS = ['arm', 'shoulder', 'chest'] as const;
export type SleeveSectionId = typeof SLEEVE_IDS[number];
export interface SleeveSection { visible: boolean; scale: number; x: number; y: number; rotation: number; trim: number }
export interface SleeveSettings { version: 1; active: SleeveSectionId; sections: Record<SleeveSectionId, SleeveSection> }
const section = (): SleeveSection => ({ visible: true, scale: 1, x: 0, y: 0, rotation: 0, trim: 0 });
export const DEFAULT_SLEEVE: SleeveSettings = { version: 1, active: 'shoulder', sections: { arm: section(), shoulder: section(), chest: section() } };
export const SLEEVE_SOURCES = { arm: '/tattoos/orbit-sleeve-arm.png', shoulder: '/tattoos/orbit-sleeve-shoulder.png', chest: '/tattoos/orbit-sleeve-chest.png' };
export function validSleeve(value: unknown): value is SleeveSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as SleeveSettings;
  return s.version === 1 && SLEEVE_IDS.includes(s.active) && !!s.sections && SLEEVE_IDS.every(id => {
    const v = s.sections[id];
    return !!v && typeof v.visible === 'boolean' && Number.isFinite(v.scale) && v.scale >= .65 && v.scale <= 1.35
      && Number.isFinite(v.x) && Math.abs(v.x) <= .25 && Number.isFinite(v.y) && Math.abs(v.y) <= .25
      && Number.isFinite(v.rotation) && Math.abs(v.rotation) <= 60 && Number.isFinite(v.trim) && v.trim >= 0 && v.trim <= .3;
  });
}
