import { cinematicLights, cinematicPreset, type CinematicPresetId } from './cinematicPresets';
import { normalizeTattooCamera, type TattooCameraAdjustment } from './tattooCamera';
import type { CameraView } from './cameraTransition';

/** Starting artistic bounds, not a certification of image quality or visibility. */
export function shootBounds(id: CinematicPresetId | null) {
  return {
    azimuth: { min: -30, max: 30 }, elevation: { min: -20, max: 20 },
    zoom: { min: .8, max: id === 'detail' ? 6 : 1 },
  };
}
export function guidedCamera(value: TattooCameraAdjustment, id: CinematicPresetId | null): TattooCameraAdjustment {
  const normalized = normalizeTattooCamera(value), bounds = shootBounds(id);
  return Object.fromEntries(Object.entries(normalized).map(([name, value]) => {
    const limit = bounds[name as keyof TattooCameraAdjustment];
    return [name, Math.max(limit.min, Math.min(limit.max, value))];
  })) as unknown as TattooCameraAdjustment;
}
export function guidedBrightness(value: number) {
  return Number.isFinite(value) ? Math.max(.9, Math.min(1.2, value)) : 1;
}
export function guidedLights(id: CinematicPresetId | null, camera: CameraView, brightness: number, scale: number) {
  const preset = cinematicPreset(id) ?? cinematicPreset('editorial')!;
  const rig = { ...preset, fill: Math.max(preset.fill, preset.key[3] * .28), rim: Math.min(preset.rim, preset.key[3] * .25) };
  return cinematicLights(rig, camera, scale).map(light => ({ ...light, intensity: light.intensity * guidedBrightness(brightness) }));
}
