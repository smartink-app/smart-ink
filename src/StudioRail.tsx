import { FiGrid, FiEdit3, FiImage, FiAperture, FiUser, FiCalendar } from 'react-icons/fi';
import { ThemeToggle } from './Theme';

export type StudioSection = 'projects' | 'studio' | 'artwork' | 'renders' | 'artist' | 'account';
const items = [
  { id: 'projects', label: 'Projects', icon: FiGrid },
  { id: 'studio', label: 'Studio', icon: FiEdit3 },
  { id: 'artwork', label: 'Artwork', icon: FiImage },
  { id: 'renders', label: 'Renders', icon: FiAperture },
  { id: 'artist', label: 'Artist desk', icon: FiCalendar },
  { id: 'account', label: 'Account', icon: FiUser },
] as const;

export default function StudioRail({ active, onNavigate, onHome, studioAvailable = true, disabled = false }: {
  active: StudioSection; onNavigate: (section: StudioSection) => void; onHome: () => void;
  studioAvailable?: boolean; disabled?: boolean;
}) {
  return <aside className="studio-rail" inert={disabled}>
    <button type="button" className="studio-rail-brand" onClick={onHome} aria-label="Smart Ink home"><img src="/brand-droplet.svg" alt="" /></button>
    <nav aria-label="Workspace">
      {items.map(({ id, label, icon: Icon }) => <button type="button" key={id}
        aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}
        disabled={id === 'studio' && !studioAvailable} title={id === 'studio' && !studioAvailable ? 'Open a project to enter the studio' : label}>
        <Icon aria-hidden /><span>{label}</span>
      </button>)}
    </nav>
    <ThemeToggle />
    <span className="studio-rail-beta">BETA</span>
  </aside>;
}
