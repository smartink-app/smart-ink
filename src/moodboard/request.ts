import { DEMO_ARTISTS } from '../discovery/artists';
import { saveBooking, saveClient, type ArtistData, type Booking } from '../artist/model';
import { snapshotBoard, type Moodboard } from './model';
export interface MoodboardRequest { id: string; artistId: string; name: string; email: string; date: string; time: string }
/** Build the client, appointment and frozen board in one artist-store write. */
export function requestWithMoodboard(data: ArtistData, board: Moodboard, request: MoodboardRequest, now = new Date()): ArtistData {
  if (data.bookings.some(b => b.id === request.id)) return data;
  const artist = DEMO_ARTISTS.find(a => a.id === request.artistId);
  if (!artist?.open) throw Error('Choose an artist who is open for requests.');
  const existing = data.clients.find(c => c.email.toLowerCase() === request.email.trim().toLowerCase());
  const client = { id: existing?.id ?? crypto.randomUUID(), name: request.name, email: request.email, phone: '', notes: '' };
  // Validate the submitted name/email even when this contact already exists; never replace artist notes.
  saveClient({ ...data, clients: data.clients.filter(c => c.id !== client.id) }, client);
  const next = existing ? data : saveClient(data, client);
  const booking: Booking = {
    id: request.id, clientId: client.id, title: `${board.title} · consultation`.slice(0, 120), service: 'Consultation',
    date: request.date, time: request.time, duration: 60, status: 'requested', price: 0, deposit: 0, depositPaid: false,
    brief: [board.brief, board.placement && `Placement: ${board.placement}`, board.size && `Size: ${board.size}`].filter(Boolean).join('\n'),
    notes: '', projectId: '', moodboard: snapshotBoard(board, artist),
  };
  return saveBooking(next, booking, now);
}
