import ExploreNav from './ExploreNav';
import { useState } from 'react';
import { FiArrowUpRight, FiArrowRight, FiBookmark, FiMapPin, FiSearch, FiX } from 'react-icons/fi';
import FocusDialog from '../FocusDialog';
import { ARTIST_CITIES, ARTIST_STYLES, DEMO_ARTISTS, filterArtists, type DemoArtist, type PortfolioImage } from './artists';
import './discovery.css';

const savedKey = 'smartink:discovery:saved-artists:v1';
function loadSaved(): string[] {
  try { const values: unknown = JSON.parse(localStorage.getItem(savedKey) ?? '[]'); return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string' && DEMO_ARTISTS.some(a => a.id === v)) : []; }
  catch { return []; }
}
function Artwork({ image, eager = false }: { image: PortfolioImage; eager?: boolean }) {
  return <div className={`discover-art discover-art--${image.kind} discover-art--${image.tone ?? 'neutral'}`}><img src={image.src} alt={image.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" /><span className="discover-art-label">{image.kind === 'render' ? 'Placement study' : 'Flash study'}</span></div>;
}
export default function ArtistDiscovery({ onHome, onStudio, onMoodboard, signedIn }: { onMoodboard: (image?: PortfolioImage) => void; onHome: () => void; onStudio: () => void; signedIn: boolean }) {
  const [query, setQuery] = useState(''), [style, setStyle] = useState('All styles'), [city, setCity] = useState('');
  const [openOnly, setOpenOnly] = useState(false), [savedOnly, setSavedOnly] = useState(false), [sort, setSort] = useState('featured');
  const [saved, setSaved] = useState(loadSaved), [saveError, setSaveError] = useState('');
  const [preview, setPreview] = useState<DemoArtist | null>(null);
  const artists = filterArtists({ query, style, city, openOnly, savedOnly, saved, sort });
  const toggleSave = (artistId: string) => {
    const next = saved.includes(artistId) ? saved.filter(v => v !== artistId) : [...saved, artistId];
    try { localStorage.setItem(savedKey, JSON.stringify(next)); setSaved(next); setSaveError(''); }
    catch { setSaveError('Your browser could not save this shortlist. Please try again.'); }
  };
  const clear = () => { setQuery(''); setStyle('All styles'); setCity(''); setOpenOnly(false); setSavedOnly(false); };
  const filtering = query || style !== 'All styles' || city || openOnly || savedOnly;
  return <div className="discover-page">
    <a className="discover-skip" href="#discover-main">Skip to artists</a>
    <ExploreNav active="artists" onHome={onHome} onArtists={() => {}} onMoodboards={() => onMoodboard()} onStudio={onStudio} signedIn={signedIn} />
    <main id="discover-main">
      <section className="discover-hero" aria-labelledby="discover-title"><p className="discover-eyebrow"><span />A connection before the ink</p><h1 id="discover-title">Find your artist.<br /><span>Make it personal.</span></h1><p className="discover-intro">A style that speaks to you. An artist who gets it.<br />Explore the work and find the person behind your next piece.</p><div className="discover-search-bar"><label className="discover-search"><FiSearch aria-hidden /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Artist, studio or style" aria-label="Search artists" /></label><label className="discover-location"><FiMapPin aria-hidden /><select value={city} onChange={e => setCity(e.target.value)} aria-label="Artist location"><option value="">All locations</option>{ARTIST_CITIES.map(c => <option key={c}>{c}</option>)}</select></label></div></section>
      <section className="discover-collection" aria-label="Artist portfolios">
        <div className="discover-style-list" role="group" aria-label="Tattoo styles">{ARTIST_STYLES.map(s => <button key={s} aria-pressed={style === s} onClick={() => setStyle(s)}>{s}</button>)}</div>
        <div className="discover-collection-heading"><div><p className="discover-eyebrow">Different hands. Distinct voices.</p><h2>{savedOnly ? 'Your shortlist.' : filtering ? 'Find your connection.' : 'Meet your next artist.'}</h2></div><button className="discover-saved-toggle" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><FiBookmark aria-hidden />Saved <span>{saved.length}</span></button></div>
        <div className="discover-results-tools"><p role="status">{artists.length} {artists.length === 1 ? 'artist' : 'artists'}{city ? ` in ${city}` : ' to explore'}{filtering && <button onClick={clear}>Clear filters <FiX aria-hidden /></button>}</p><div><label className="discover-open-filter"><input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} />Open for requests</label><select value={sort} aria-label="Sort artists" onChange={e => setSort(e.target.value)}><option value="featured">Curated order</option><option value="name">Name A–Z</option></select></div></div>
        <p className="discover-demo-note"><span>Preview collection</span> Fictional artists, illustrated with Smart Ink renders and sample artwork. Availability is illustrative; no real bookings are made here.</p>
        {saveError && <p className="discover-error" role="alert">{saveError}</p>}
        <div className="discover-grid">{artists.map((artist, index) => <article className="discover-artist-card" key={artist.id} aria-label={artist.name}>
          <div className="discover-cover"><button className="discover-cover-link" onClick={() => setPreview(artist)} aria-label={`View ${artist.name} portfolio`}><Artwork image={artist.cover} eager={index < 3} /></button><button className="discover-save" aria-label={`${saved.includes(artist.id) ? 'Unsave' : 'Save'} ${artist.name}`} aria-pressed={saved.includes(artist.id)} onClick={() => toggleSave(artist.id)}><FiBookmark aria-hidden /></button><span className={`discover-booking-state${artist.open ? ' is-open' : ''}`}><i />{artist.open ? 'Open for requests' : 'Books closed'}</span></div>
          <div className="discover-artist-info"><div className="discover-identity"><span className="discover-avatar">{artist.name.split(' ').map(n => n[0]).join('')}</span><div><h3><button onClick={() => setPreview(artist)}>{artist.name}</button></h3><p>{artist.studio}</p></div><button className="discover-view-icon" aria-label={`Explore ${artist.name}'s work`} onClick={() => setPreview(artist)}><FiArrowUpRight aria-hidden /></button></div><p className="discover-artist-line">{artist.line}</p><div className="discover-artist-meta"><span><FiMapPin aria-hidden />{artist.city}</span><div>{artist.styles.map(s => <span key={s}>{s}</span>)}</div></div></div>
        </article>)}</div>
        {!artists.length && <div className="discover-empty"><FiSearch aria-hidden /><h3>{savedOnly && !saved.length ? 'Keep the artists that catch your eye.' : 'No match just yet.'}</h3><p>{savedOnly && !saved.length ? 'Tap the bookmark on a portfolio to build your shortlist.' : 'Try another style or location, or make your search a little broader.'}</p><button className="focus-primary" onClick={clear}>Explore all artists <FiArrowRight aria-hidden /></button></div>}
        <div className="discover-bottom-note"><span className="discover-eyebrow">A good tattoo starts with a conversation.</span><p>Find the work you love. Save a few favourites.<br />Take your time with the choice.</p></div>
      </section>
    </main>
    <footer className="discover-footer"><button className="discover-brand" onClick={onHome}><img src="/brand-droplet.svg" alt="" />Smart Ink</button><span>Art worth wearing. People worth finding.</span><button onClick={onStudio}>For tattoo artists <FiArrowUpRight aria-hidden /></button></footer>
    {preview && <FocusDialog title={`${preview.name} · portfolio preview`} wide onClose={() => setPreview(null)}><div className="discover-preview"><div className="discover-preview-intro"><span className="discover-avatar">{preview.name.split(' ').map(n => n[0]).join('')}</span><div><p>{preview.studio} · {preview.city}</p><h3>{preview.line}</h3><span>{preview.styles.join(' · ')}</span></div></div><div className="discover-preview-grid">{preview.work.map(img => <div key={img.src}><Artwork image={img} eager /><button className="discover-collect" onClick={() => onMoodboard(img)}><FiBookmark aria-hidden />Collect for moodboard</button></div>)}</div><p className="discover-demo-note">This is a sample portfolio for the discovery demo. Full artist profiles and live booking are not connected yet.</p><div className="discover-preview-actions"><button className="discover-studio-button" onClick={() => setPreview(null)}>Keep browsing</button><button className="focus-primary" aria-pressed={saved.includes(preview.id)} onClick={() => toggleSave(preview.id)}><FiBookmark aria-hidden />{saved.includes(preview.id) ? 'Saved to shortlist' : 'Save artist'}</button></div>{saveError && <p role="alert" className="discover-error">{saveError}</p>}</div></FocusDialog>}
  </div>;
}
