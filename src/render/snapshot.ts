import type { RenderContract } from './contract';

export type DetailedSettings = { finish: 'standard' | 'portfolio'; regionalSkin: boolean };
export const DEFAULT_DETAILED_SETTINGS: DetailedSettings = { finish: 'portfolio', regionalSkin: true };

export type SnapshotQuality = 'quick' | 'detailed';
export type SnapshotShot = { contract: RenderContract; inkBlob: Blob; sceneName?: string };

/** Keep the viewport's crop, independent of the social-image export format. */
export function snapshotOutput(aspect: number, quality: SnapshotQuality, settings?: DetailedSettings) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? Math.min(32, Math.max(1 / 32, aspect)) : 1;
  const portfolio = quality === 'detailed' && settings?.finish === 'portfolio';
  const edge = portfolio ? 4000 : quality === 'detailed' ? 2560 : 960;
  return {
    qualityTier: 'final' as const,
    width: Math.round(ratio >= 1 ? edge : edge * ratio),
    height: Math.round(ratio >= 1 ? edge / ratio : edge),
    samples: portfolio ? 2048 : quality === 'detailed' ? 512 : 64,
    ...(portfolio ? { finish: 'portfolio' as const } : {}),
  };
}

export function snapshotContract(source: RenderContract, quality: SnapshotQuality, settings?: DetailedSettings): RenderContract {
  const contract = structuredClone(source);
  contract.renderStyle = 'cinematic';
  contract.output = snapshotOutput(contract.camera.aspect, quality, settings);
  if (quality === 'detailed' && settings?.regionalSkin && contract.skinProfileVersion === 3) contract.skinVariation = 'regional';
  else delete contract.skinVariation;
  contract.camera.preserveFraming = true;
  contract.camera.aperture = source.camera.aperture ?? 8;
  contract.camera.depthOfField = source.camera.depthOfField ?? quality !== 'detailed';
  return contract;
}
