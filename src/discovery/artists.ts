export type PortfolioImage = { src: string; alt: string; kind: 'render' | 'drawing'; tone?: string };
export type DemoArtist = { id: string; name: string; studio: string; city: string; styles: string[]; open: boolean; line: string; cover: PortfolioImage; work: PortfolioImage[] };
const rose: PortfolioImage = { src: '/renders/presets/editorial.jpg', alt: 'Smart Ink study of a fine-line rose on a torso', kind: 'render' };
const arm: PortfolioImage = { src: '/renders/hero-arm.webp', alt: 'Smart Ink study of ornamental blackwork on a forearm', kind: 'render' };
const botanical: PortfolioImage = { src: '/tattoos/botanical-rose.png', alt: 'Botanical rose flash illustration', kind: 'drawing', tone: 'sand' };
const circles: PortfolioImage = { src: '/tattoos/orbit-sleeve-arm.png', alt: 'Circular geometric sleeve illustration', kind: 'drawing', tone: 'lilac' };
const moth: PortfolioImage = { src: '/tattoos/lunar-moth.png', alt: 'Lunar moth flash illustration', kind: 'drawing', tone: 'rose' };
const dagger: PortfolioImage = { src: '/tattoos/ornamental-dagger.png', alt: 'Ornamental dagger flash illustration', kind: 'drawing', tone: 'sage' };
export const DEMO_ARTISTS: DemoArtist[] = [
  { id: 'nora', name: 'Nora Vale', studio: 'Soft Form Studio', city: 'Amsterdam', styles: ['Fine line', 'Botanical'], open: true, line: 'Quiet lines. Pieces that grow with you.', cover: rose, work: [rose, botanical] },
  { id: 'atlas', name: 'Atlas Reed', studio: 'Still Ink', city: 'Rotterdam', styles: ['Blackwork', 'Ornamental'], open: true, line: 'Bold shapes, drawn to follow the body.', cover: arm, work: [arm, dagger] },
  { id: 'olive', name: 'Olive Park', studio: 'Wildflower Atelier', city: 'Utrecht', styles: ['Botanical', 'Fine line'], open: false, line: 'A small piece of nature, made personal.', cover: botanical, work: [botanical, rose] },
  { id: 'remi', name: 'Remi Sol', studio: 'Orbit Tattoo', city: 'Amsterdam', styles: ['Geometric', 'Blackwork'], open: true, line: 'Rhythm, repetition, and a little curiosity.', cover: circles, work: [circles, { src: '/tattoos/continuous-chevron-band.png', alt: 'Continuous chevron armband illustration', kind: 'drawing', tone: 'lilac' }] },
  { id: 'june', name: 'June Wren', studio: 'Night Garden', city: 'Haarlem', styles: ['Illustrative', 'Blackwork'], open: true, line: 'Little stories with a darker edge.', cover: moth, work: [moth, botanical] },
  { id: 'eli', name: 'Eli Stone', studio: 'Common Ground', city: 'Eindhoven', styles: ['Ornamental', 'Illustrative'], open: false, line: 'Timeless symbols, thoughtfully placed.', cover: dagger, work: [dagger, moth] },
];
export const ARTIST_STYLES = ['All styles', 'Fine line', 'Blackwork', 'Botanical', 'Geometric', 'Ornamental', 'Illustrative'];
export const ARTIST_CITIES = [...new Set(DEMO_ARTISTS.map(a => a.city))].sort();
export type ArtistFilters = { query: string; style: string; city: string; openOnly: boolean; savedOnly: boolean; saved: string[]; sort: string };
export function filterArtists(filters: ArtistFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const result = DEMO_ARTISTS.filter(a => (!query || `${a.name} ${a.studio} ${a.city} ${a.styles.join(' ')}`.toLocaleLowerCase().includes(query))
    && (filters.style === 'All styles' || a.styles.includes(filters.style)) && (!filters.city || a.city === filters.city)
    && (!filters.openOnly || a.open) && (!filters.savedOnly || filters.saved.includes(a.id)));
  return filters.sort === 'name' ? result.sort((a, b) => a.name.localeCompare(b.name)) : result;
}
