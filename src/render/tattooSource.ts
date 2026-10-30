import { STARTER_TATTOOS, LEGACY_STARTER_SOURCES } from '../starterTattoos';
/** The example design uses the same preview and export path as uploaded art. */
export const DEFAULT_TATTOO_SOURCE = '/tattoos/starter-2026/peony.png';

export function resolveTattooSource(uploadedImage: string | null): string {
  if (uploadedImage === '/tattoos/ornamental-dagger.png') return '/tattoos/ornamental-dagger.png?v=transparent-2';
  return uploadedImage ?? DEFAULT_TATTOO_SOURCE;
}

/** Starter flash is black ink; uploaded art retains its original colours. */
export function isStarterTattoo(source: string): boolean {
  const path = source.split('?')[0];
  return STARTER_TATTOOS.some(asset => asset.source === path) || LEGACY_STARTER_SOURCES.includes(path);
}
