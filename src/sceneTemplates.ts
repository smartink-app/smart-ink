import type { BodyRegionId } from './render/bodyRegions';
import type { SceneData } from './types';
import type { StudioSettings } from './render/studioSettings';
import type { LightDefinition } from './config/lightingPresets';
import { fitRegionCamera, type RegionFraming } from './render/focusCamera';

export interface SceneTemplate {
  id: string; label: string; detail: string; region: BodyRegionId | null;
  direction: [number, number, number];
}
export const SCENE_TEMPLATES: ReadonlyArray<SceneTemplate> = [
  { id: 'blank', label: 'Full body', detail: 'Portrait view · the whole body stays available', region: null, direction: [.55, .035, 1] },
  { id: 'arm', label: 'Arm', detail: 'An angled view for arm designs', region: 'armLeft', direction: [.8, .08, 1] },
  { id: 'leg', label: 'Leg', detail: 'A sculpted view for leg designs', region: 'legLeft', direction: [-.5, .06, 1] },
  { id: 'torso', label: 'Torso', detail: 'A three-quarter view for chest designs', region: 'torso', direction: [-.45, .045, 1] },
];

// Shared by the cards and new projects, so the introduction is the actual scene.
export const TEMPLATE_STUDIO: StudioSettings = { mode: 'sweep', color: '#91857b', shadow: .10, showGuides: false };
export const TEMPLATE_LIGHTS: LightDefinition[] = [
  { name: 'Room bounce', type: 'ambient', position: [0, 0, 0], intensity: .19, color: '#ffffff', castShadow: false },
  { name: 'Large softbox', type: 'directional', position: [-3.5, 4.5, 5], target: [0, .6, 0], intensity: .92, color: '#ffe8d3', castShadow: true, softness: 1, blenderAreaSize: [4, 4] },
  { name: 'White reflector', type: 'directional', position: [4, 1.5, 4], target: [0, .5, 0], intensity: .42, color: '#fff3e8', castShadow: false, softness: 1, blenderAreaSize: [4, 4] },
  { name: 'Soft edge light', type: 'directional', position: [2, 3.5, -4], target: [0, .7, 0], intensity: .48, color: '#ffdfbf', castShadow: false, softness: .85, blenderAreaSize: [3.5, 3.5] },
];

export function templateCamera(template: SceneTemplate, framing: RegionFraming, aspect = 1): SceneData['camera'] {
  // The full model opens as a portrait, without hiding or isolating any skin.
  // Fit the upper half of its real bounds; Fit / orbit still reveal the full body.
  let subject = framing;
  if (template.region === null && framing.points?.length) {
    let low = Infinity, high = -Infinity;
    for (let i = 1; i < framing.points.length; i += 3) {
      low = Math.min(low, framing.points[i]); high = Math.max(high, framing.points[i]);
    }
    const points: number[] = [];
    for (let i = 0; i < framing.points.length; i += 3) {
      if (framing.points[i + 1] >= low + (high - low) * .57) points.push(framing.points[i], framing.points[i + 1], framing.points[i + 2]);
    }
    subject = { ...framing, points: new Float32Array(points) };
  }
  return fitRegionCamera(subject, template.direction, 36, aspect);
}

export function fallbackTemplateCamera(template: SceneTemplate): SceneData['camera'] {
  const center: [number, number, number] = template.region === null ? [0, 1, 0] : template.id === 'arm' ? [.85, .3, 0] : template.id === 'leg' ? [.3, -1, 0] : [0, .6, 0];
  return fitRegionCamera({ center, radius: template.id === 'torso' ? .85 : 1.15 }, template.direction, 36, 1);
}
export type TemplatePreview = { image: string; camera: SceneData['camera'] };
// Reuse the snapshots when returning from the editor, without keeping WebGL alive.
export const templatePreviewCache: Record<string, TemplatePreview> = {};
