import { FiGrid, FiEdit3, FiImage, FiAperture, FiUser, FiUsers, FiCompass, FiMessageSquare } from 'react-icons/fi';

export type StudioSection = 'projects' | 'studio' | 'artwork' | 'renders' | 'artist' | 'client' | 'account';
const items = [
  { id: 'projects', label: 'Projects', icon: FiGrid },
  { id: 'studio', label: 'Studio', icon: FiEdit3 },
  { id: 'artwork', label: 'Artwork', icon: FiImage },
  { id: 'renders', label: 'Renders', icon: FiAperture },
] as const;

export default function StudioRail({ active, onNavigate, onHome, onExplore, onFeedback, feedbackDisabled = false, studioAvailable = true, disabled = false }: {
  active: StudioSection; onNavigate: (section: StudioSection) => void; onHome: () => void; onExplore?: () => void;
  onFeedback?: () => void; feedbackDisabled?: boolean;
  studioAvailable?: boolean; disabled?: boolean;
}) {
  const clientsActive = active === 'artist' || active === 'client';
  return <aside className="studio-rail" inert={disabled}>
    <button type="button" className="studio-rail-brand" onClick={onHome} aria-label="Smart Ink home"><img src="/brand-droplet.svg" alt="" /></button>
    <nav aria-label="Studio tools">
      {items.map(({ id, label, icon: Icon }) => <button type="button" key={id}
        aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}
        disabled={id === 'studio' && !studioAvailable} title={id === 'studio' && !studioAvailable ? 'Open a project to enter the studio' : label}>
        <Icon aria-hidden /><span>{label}</span>
      </button>)}
    </nav>
    <nav aria-label="Feature previews" className="studio-rail-previews">
      <span className="studio-rail-group-label">Preview</span>
      <button type="button" aria-current={clientsActive ? 'page' : undefined} onClick={() => onNavigate(clientsActive ? active : 'artist')} title="Clients · local preview"><FiUsers aria-hidden /><span>Clients</span></button>
      {onExplore && <button type="button" onClick={onExplore} title="Explore artists and moodboards · preview"><FiCompass aria-hidden /><span>Explore</span></button>}
      {onFeedback && <button type="button" onClick={onFeedback} disabled={feedbackDisabled} title="Feedback · preview"><FiMessageSquare aria-hidden /><span>Feedback</span></button>}
    </nav>
    <nav aria-label="Your account" className="studio-rail-account"><button type="button" aria-current={active === 'account' ? 'page' : undefined} onClick={() => onNavigate('account')}><FiUser aria-hidden /><span>Account</span></button></nav>
    <span className="studio-rail-beta">BETA</span>
  </aside>;
}
