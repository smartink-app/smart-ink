import { FiExternalLink, FiFileText } from 'react-icons/fi';
import type { Moodboard, MoodboardSnapshot } from './model';
import './moodboard.css';
export default function MoodboardPreview({ board }: { board: Moodboard | MoodboardSnapshot }) {
  return <section className="mood-attached" aria-label="Attached moodboard">
    <p className="focus-eyebrow">The inspiration behind the idea</p><h3>{board.title}</h3>
    {'artistName' in board && <p className="mood-muted">For {board.artistName} · saved with this request</p>}
    <p className="mood-brief">{board.brief}</p>
    <div className="mood-tags">{[board.placement, board.size].filter(Boolean).map(v => <span key={v}>{v}</span>)}</div>
    <div className="mood-preview-grid">{board.items.filter(i => !i.removed).map(item => <article key={item.id}>
      {item.kind === 'image' ? <img src={item.image} alt={item.title} loading="lazy" /> : <span className="mood-preview-symbol">{item.kind === 'link' ? <FiExternalLink /> : <FiFileText />}</span>}
      <strong>{item.title}</strong>{item.note && <p>{item.note}</p>}{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">View source <FiExternalLink aria-hidden /></a>}
    </article>)}</div>
    <p className="mood-muted">References guide the conversation. The artist creates an original design.</p>
  </section>;
}
