import { STARTER_TATTOOS } from '../starterTattoos';
/** The example design uses the same preview and export path as uploaded art. */
export const DEFAULT_TATTOO_SOURCE = '/tattoos/botanical-rose.png';

export function resolveTattooSource(uploadedImage: string | null): string {
  if (uploadedImage === '/tattoos/ornamental-dagger.png') return '/tattoos/ornamental-dagger.png?v=transparent-2';
  return uploadedImage ?? DEFAULT_TATTOO_SOURCE;
}

/** Starter flash is black ink; uploaded art retains its original colours. */
export function isStarterTattoo(source: string): boolean {
  return STARTER_TATTOOS.some(asset => asset.source === source.split('?')[0]);
}
