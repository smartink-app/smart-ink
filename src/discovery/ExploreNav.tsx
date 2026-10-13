import { FiArrowLeft } from 'react-icons/fi';
import './explore-nav.css';

/** One navigation shell for inspiration, separate from the working studio. */
export default function ExploreNav({ active, onHome, onArtists, onMoodboards, onStudio, signedIn = true }: {
  active: 'artists' | 'moodboards'; onHome: () => void; onArtists: () => void;
  onMoodboards: () => void; onStudio: () => void; signedIn?: boolean;
}) {
  return <header className="explore-nav">
    <button type="button" className="explore-brand" onClick={onHome} aria-label="Smart Ink home"><img src="/brand-droplet.svg" alt="" /><span>Explore <small>Preview</small></span></button>
    <nav aria-label="Explore">
      <button type="button" aria-current={active === 'artists' ? 'page' : undefined} onClick={onArtists}>Artists</button>
      <button type="button" aria-current={active === 'moodboards' ? 'page' : undefined} onClick={onMoodboards}>Moodboards</button>
    </nav>
    <button type="button" className="explore-workspace" onClick={onStudio}><FiArrowLeft aria-hidden />{signedIn ? 'Back to workspace' : 'Log in'}</button>
  </header>;
}
