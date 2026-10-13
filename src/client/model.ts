import { addMessage, saveBooking, type ArtistData, type Booking, type Message } from '../artist/model';
import { snapshotBoard, type Moodboard } from '../moodboard/model';

export type ProjectRole = 'client' | 'artist';
/** An explicit client-facing projection: never spread private contact or booking records. */
export function clientProject(data: ArtistData, clientId: string, bookingId: string) {
  const client = data.clients.find(c => c.id === clientId);
  const b = data.bookings.find(b => b.id === bookingId && b.clientId === clientId);
  if (!client || !b) return null;
  return {
    id: b.id, clientId, clientName: client.name, title: b.title, service: b.service,
    date: b.date, time: b.time, duration: b.duration, status: b.status,
    price: b.price, deposit: b.deposit, depositPaid: b.depositPaid,
    brief: b.brief, sceneId: b.projectId, moodboard: b.moodboard ? structuredClone(b.moodboard) : undefined,
    messages: data.messages.filter(m => m.clientId === clientId && m.bookingId === bookingId)
      .map(m => ({ id: m.id, text: m.text, from: m.from, at: m.at })),
  };
}
export type ClientProject = NonNullable<ReturnType<typeof clientProject>>;
export function sendProjectMessage(data: ArtistData, clientId: string, bookingId: string, text: string, role: Message['from']) {
  if (!clientProject(data, clientId, bookingId)) throw Error('This project is no longer available for this client.');
  return addMessage(data, clientId, text, role, bookingId);
}
export function sharePreview(data: ArtistData, bookingId: string, sceneId: string, role: ProjectRole, availableSceneIds: string[]) {
  if (role !== 'artist') throw Error('Only the artist can share a design preview.');
  const b = data.bookings.find(b => b.id === bookingId);
  if (!b) throw Error('This project is no longer available.');
  if (sceneId && !availableSceneIds.includes(sceneId)) throw Error('Choose an available tattoo project.');
  return saveBooking(data, { ...b, projectId: sceneId });
}
export function attachBoard(data: ArtistData, clientId: string, bookingId: string, board: Moodboard) {
  const project = clientProject(data, clientId, bookingId);
  if (!project) throw Error('This project is no longer available for this client.');
  const b = data.bookings.find(b => b.id === bookingId)!;
  const artist = { id: b.moodboard?.artistId ?? 'demo-studio', name: b.moodboard?.artistName ?? 'Your artist' };
  return saveBooking(data, { ...b, moodboard: snapshotBoard(board, artist) });
}
export function nextStep(project: Pick<Booking, 'status' | 'service'> & { sceneId: string }) {
  if (project.status === 'cancelled') return { title: 'This appointment was cancelled.', text: 'Message your artist if you’d like to plan a new session.' };
  if (project.status === 'declined') return { title: 'The request wasn’t accepted.', text: 'Your references and conversation are still here. Discuss another idea or time with your artist.' };
  if (project.status === 'completed') return { title: 'A little idea, brought to life.', text: 'Your session is complete. Keep the conversation going with your artist here.' };
  if (project.sceneId) return { title: 'Take a closer look.', text: 'Explore the placement in 3D and pin a thought wherever you’d like a change.' };
  if (project.status === 'requested') return { title: 'Your idea is with the artist.', text: 'They’ll review your brief and preferred time. You can add a reference or leave a message while you wait.' };
  return { title: 'Your session is on the calendar.', text: 'Keep your inspiration close and discuss the details before you meet.' };
}
