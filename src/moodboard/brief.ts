import { prepareInspirationImage } from './images';
import { safeReferenceUrl, safeImage, type Moodboard } from './model';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function briefHtml(board: Moodboard): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(board.title)} · Tattoo brief</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#202730;background:#f5f3ef;max-width:1040px;margin:0 auto;padding:48px 24px}h1{font-size:42px;line-height:1.1}small{letter-spacing:.15em}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}article{background:white;border:1px solid #d6d3cf;border-radius:18px;padding:18px;break-inside:avoid}img{width:100%;max-height:380px;object-fit:contain;border-radius:10px}p{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#395ba6}footer{margin-top:40px;font-size:13px;color:#657080}@media print{body{padding:0;background:white}section{display:block}article{margin-bottom:18px}a{word-break:break-all}}</style><small>SMART INK / INSPIRATION BRIEF</small><h1>${escape(board.title)}</h1><p>${escape(board.brief)}</p><p>${escape([board.placement, board.size].filter(Boolean).join(' · '))}</p><section>${board.items.filter(i => !i.removed).map(i => `<article>${i.kind === 'image' && safeImage(i.image) ? `<img src="${escape(i.image)}" alt="${escape(i.title)}">` : ''}<h2>${escape(i.title)}</h2><p>${escape(i.note)}</p>${i.url ? `<a href="${escape(safeReferenceUrl(i.url))}" target="_blank" rel="noopener noreferrer">${escape(i.url)}</a>` : ''}</article>`).join('')}</section><footer>References for inspiration, to help the artist create an original design. Prepared with Smart Ink. Use your browser’s print command to save a PDF.</footer></html>`;
}
export async function downloadBrief(board: Moodboard) {
  const copy = structuredClone(board);
  for (const item of copy.items) {
    if (item.removed || item.kind !== 'image' || !item.image.startsWith('/')) continue;
    const response = await fetch(item.image);
    if (!response.ok) throw Error('An image could not be included. Try downloading the brief again.');
    const blob = await response.blob();
    item.image = await prepareInspirationImage(new File([blob], 'reference', { type: blob.type }));
  }
  const html = briefHtml(copy);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${board.title.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 80) || 'tattoo'}-brief.html`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
